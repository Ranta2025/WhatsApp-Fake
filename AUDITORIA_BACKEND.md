# Auditoria Backend — todos (Go + Gin + GORM)

## Stack Tecnologico

| Componente | Tecnologia | Version |
|------------|-----------|---------|
| Lenguaje | Go | 1.25.5 |
| Framework HTTP | Gin | v1.11.0 |
| ORM | GORM | v1.31.1 |
| Base de datos | PostgreSQL | 16 |
| Cache | Redis | 7 |
| Object Storage | MinIO | S3-compatible |
| WebSocket | Gorilla WebSocket | v1.5.3 |
| Auth | golang-jwt + bcrypt | v5.3.0 |
| Email | gomail.v2 | SMTP |
| Testing | testify | v1.11.1 |

## Arquitectura

```
HTTP Request -> Middlewares -> Handlers -> Services -> Repos -> DB/Cache
                                  |
                             WebSocket Hub -> Clients (readPump/writePump)
```

72 archivos Go, ~15 tests unitarios, cobertura ~59%.

---

## PROBLEMAS CRITICOS (12)

### [C1] Refresh Token no rotacion — token robado reutilizable 7 dias
**Archivo:** `backend/handlers/HandlerUser.go:389-437`
El handler de refresh genera un nuevo token pero **NO invalida el anterior** en Redis. Si un refresh token es robado, el atacante puede renovar access tokens durante toda la ventana de 7 dias.
```go
// setTokenCookies guarda nuevo, NO elimina viejo
// HandlerRefreshToken valida pero NO rota
```

### [C2] JWT parseado sin validar firma — `ParseUnverified` + `WithoutClaimsValidation`
**Archivo:** `backend/handlers/HandlerUser.go:448-449`
```go
parser := jwt.NewParser(jwt.WithoutClaimsValidation())
token, _, err := parser.ParseUnverified(tokenStr, jwt.MapClaims{})
```
Cualquier string con formato JWT se acepta sin verificar la firma HMAC. Suplantacion de identidad total en el flujo de refresh.

### [C3] Exposicion de errores internos al cliente
**Archivos:** `HandlerUser.go`, `handlerChat.go`, `handlerContact.go`, `handlerGroup.go`
Practicamente todos los handlers retornan `err.Error()` directamente al cliente:
```go
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
```
Esto expone nombres de tablas, columnas, y detalles de infraestructura.

### [C4] Migracion `post_009_status_indexes.sql` NO es idempotente
**Archivo:** `backend/database/migrations/post_009_status_indexes.sql`
Los `ALTER TABLE ADD CONSTRAINT` no estan envueltos en `DO $$ IF NOT EXISTS`. Si la migracion se ejecuta dos veces, la app no arrancara.

### [C5] Foreign Keys eliminadas en `contact_data_bases` sin sustituto
**Archivo:** `backend/database/migrations/post_003_drop_legacy_fk_constraints.sql`
Se eliminaron los FK `id_user` y `id_contact` para manejar soft-deletes. Sin integridad referencial, nada impide insertar IDs huerfanos.

### [C6] No hay Graceful Shutdown
**Archivo:** `main.go:73-75`
```go
func (a *app) Run() { a.app.Run("0.0.0.0:8080") }
```
No captura `SIGTERM`/`SIGINT`, no cierra el Hub WebSocket, no libera conexiones. En Docker/K8s las conexiones se cortan abruptamente.

### [C7] `sslmode=disable` hardcodeado en PostgreSQL
**Archivo:** `backend/database/postgres.go:25-28`
Credenciales y datos viajan en texto plano entre backend y BD. No configurable via variable de entorno.

### [C8] Rate Limiter "fail open" — sin Redis, sin limites
**Archivo:** `backend/middleware/ratelimit.go:58-62`
```go
if err != nil { return true, limit, window } // PERMITE todo
```
Si Redis cae, todas las peticiones pasan sin rate limiting. Endpoints de login quedan vulnerables a brute-force.

### [C9] Race condition: AddContact sin unique constraint ni transaccion
**Archivos:** `backend/services/servicesContact.go:87-138, 194-245`
Flujo check-then-act: `ExistContactAdd` -> `AddContact`. Dos requests concurrentes pueden insertar duplicados. La tabla `contact_data_bases` debe tener unique constraint `(id_user, id_contact)`.

### [C10] N+1 queries en GetAllChats y GetCallHistory
- `serviceChat.go:254`: por cada contacto, `GetUserByID()` — 50 contactos = 50 queries extra.
- `serviceCall.go:161-162`: por cada `CallLog`, 2x `GetUserByID()` — 100 registros = 200 queries extra.

### [C11] Caches Redis nunca se invalidan
- `user:id:<telephon>` (contactData.go:370): TTL 24h. Si un usuario cambia de username, la cache sigue apuntando al ID viejo.
- `user:contacts:<telephon>` (contactData.go:402): TTL 1h. Al agregar/eliminar contacto, no se refresca.

### [C12] Errores descartados con `_` — datos corruptos al frontend
**Archivos:** `serviceGroup.go:186-188, 232, 284`, `serviceCall.go:161-162`
```go
callerData, _ := s.repo.GetUserByID(...) // error ignorado
memberCount, _ := s.repo.GetMemberCount(...) // error ignorado
```
Si estas operaciones fallan, el frontend recibe datos con valores cero sin saber que algo fallo.

---

## PROBLEMAS ALTOS (18)

| # | Problema | Archivo |
|---|----------|---------|
| A1 | God Handler: `HandlerUser` tiene 12 metodos, viola SRP | `handlers/HandlerUser.go` |
| A2 | God Middleware: `middlewareUser.go` con 11 middlewares, validacion de password duplicada 4x | `middleware/middlewareUser.go` |
| A3 | `ctx.Abort()` inconsistente: algunos handlers lo llaman, otros no | `handlerChat.go`, `handlerGroup.go` |
| A4 | PII en logs: username y telephon en texto plano | `middlewareToken.go`, `HandlerUser.go` |
| A5 | HTTP 400 para errores de BD (deberia ser 500) | `handlerGroup.go`, `handlerContact.go` |
| A6 | Business logic en handlers: generacion de JWT y cookies | `HandlerUser.go:91-92`, `handlerContact.go:84-95` |
| A7 | Race condition en rate limiter: TTL leido en operacion separada del Lua script | `ratelimit.go:54-74` |
| A8 | `.trycloudflare.com` en CORS: cualquier tunnel Cloudflare es aceptado | `config/cors.go:58-59` |
| A9 | WebSocket acepta conexiones sin Origin | `websocket/handler.go:20-22` |
| A10 | `servicesBugReport.go` sin DI, lee `os.Getenv` directamente, no testeable | `services/servicesBugReport.go:23-29` |
| A11 | `serviceMedia.go` depende de tipo concreto `*minio.Client`, no testeable | `services/serviceMedia.go:61` |
| A12 | `cacheUser.go` depende de tipo concreto `*RepositoriesUser` | `cache/cacheUser.go:17` |
| A13 | ClearChat sin transaccion (dos UPDATEs separados) | `repos/contactData.go:287-305` |
| A14 | Race condition en contador de intentos fallidos (GET+SET Redis) | `services/servicesUser.go:248-268` |
| A15 | Contador de intentos fallidos no se resetea tras login exitoso | `cache/cacheUser.go:127-145` |
| A16 | Codigos de activacion no se borran tras uso (posible reuso) | `cache/cacheUser.go:89-101` |
| A17 | Duplicacion masiva: AddContact/AddContactByTelephon 95% identico | `services/servicesContact.go` |
| A18 | Sin connection pooling en PostgreSQL (SetMaxOpenConns sin configurar) | `database/postgres.go:30-41` |

---

## PROBLEMAS MEDIOS (22)

| # | Problema |
|---|----------|
| M1 | Sin transaccion en migraciones multi-statement |
| M2 | Sin soporte de rollback en migraciones |
| M3 | Sin funcion `Close()` para conexiones (DB, Redis, MinIO) |
| M4 | Nombres mezclando ingles/espanol: `Activo`, `Bloqueado`, `Telephon` |
| M5 | Formato de respuesta JSON inconsistente (4 patrones distintos) |
| M6 | Codigos HTTP inconsistentes: `400` vs `http.StatusBadRequest` |
| M7 | `HandlerLogOut` en realidad registra usuarios (nombre enganoso) |
| M8 | Invalidacion de cache `bloqueado:<username>` olvidada al desbloquear |
| M9 | `HandleGroupJoin` consulta BD en hilo readPump (bloqueante) |
| M10 | Sin validacion de Content-Type en middlewares |
| M11 | Sin health check endpoint (`/healthz`) |
| M12 | Sin sanitizacion de inputs HTML/XSS (defensa en profundidad) |
| M13 | Uso mixto de `log.Println` y `slog` (formato inconsistente) |
| M14 | Puerto `:8080` hardcodeado |
| M15 | `AutoMigrate` en produccion (peligroso sin control de versiones) |
| M16 | Modulo Go llamado `gorm` (confunde con `gorm.io/gorm`) |
| M17 | Refresh token no vinculado al usuario (sin claims `sub`/`jti`) |
| M18 | Sin mecanismo de revocacion de JWT (blacklist) |
| M19 | Claims JWT minimos (faltan `iat`, `nbf`, `jti`) |
| M20 | Validacion de email solo acepta `@gmail.com` |
| M21 | Email del remitente hardcodeado en `codigoRandom.go` |
| M22 | Conexion SMTP sin verificacion de certificado TLS |

---

## PROBLEMAS BAJOS (20)

1. Tipografia: `Conection` en vez de `Connection`
2. `GroupMessage` no tiene campo `Status`
3. `BugReport` sin persistencia local (solo GitHub API)
4. `Message.Status` con valores en espanol: 'enviado', 'entregado', 'visto'
5. `StatusView.ViewedAt` sin indice
6. Longitud maxima de mensajes 400 caracteres (restrictivo)
7. `CallLog.Duration` como `int` (deberia ser `int64`)
8. `Password` `size:100` insuficiente para argon2id
9. `MediaUrl` `size:500` insuficiente para URLs firmadas de S3
10. Columna `Time` conflicto con palabra reservada SQL
11. Sin indices compuestos en `call_logs`
12. `UserDataBase.LastSeen` sin indice
13. `RecoverAccount` no retorna error de `SendEmail`
14. Uso de `Scan()` en vez de `First()` en userData (fragil)
15. Buffer de canal WS `Send` fijo en 256
16. Goroutine de inicializacion WS sin timeout
17. Parser de .env no maneja valores con comillas
18. Sin validacion de reuso de password al cambiarla
19. Login middleware no limita longitud de input
20. Duplicacion de estructuras DTO (`UserRecoverAndChange` = `UserForgotPassword`)

---

## COSAS BIEN HECHAS

1. Rate limiting exhaustivo con Lua atomico en Redis y headers `X-RateLimit-*`
2. Bcrypt costo 14 (Owasp recomienda minimo 12)
3. Validacion de fortaleza de password (longitud, numero, mayuscula, especial)
4. Validacion de algoritmo JWT (previene algorithm confusion)
5. Uso de `crypto/rand` para tokens y codigos
6. Hub WebSocket con `sync.RWMutex` correcto, sin race conditions
7. Reconexion WS: cierra canal Send del cliente viejo, limpia rooms
8. `safeSend` no bloqueante con recover
9. Separacion de dominios en routers (`log/` publico, `api/` autenticado)
10. `.env` no sobreescribe variables de entorno del sistema
11. Patron rooms con copia de referencias fuera de lock
12. `GroupContactRepoInterface` — buen uso de Interface Segregation Principle
13. Transacciones correctas en creacion de usuarios, grupos, cambios de password
14. `clause.OnConflict{DoNothing: true}` para prevenir duplicados

---

## Recomendaciones Prioritarias

### Semana 1 (Critico)
1. Implementar refresh token rotation (invalidar viejo al renovar)
2. Corregir `ParseUnverified` — validar siempre la firma JWT
3. Eliminar `err.Error()` de respuestas HTTP
4. Agregar graceful shutdown con manejo de senales
5. Hacer `sslmode` configurable por variable de entorno
6. Implementar health check `/healthz`

### Semana 2 (Alto)
7. Agregar unique constraint `(id_user, id_contact)` en `contact_data_bases`
8. Resolver N+1 queries con batch queries
9. Invalidar caches al modificar datos
10. Extraer funcion de validacion de password unificada
11. Dividir `HandlerUser` y `middlewareUser` en archivos mas pequenos
12. Configurar connection pooling de PostgreSQL

### Semana 3-4 (Medio)
13. Estandarizar formato JSON de respuesta
14. Estandarizar `ctx.Abort()` y constantes HTTP
15. Agregar sanitizacion de inputs
16. Implementar blacklist JWT en Redis
17. Crear interfaces para `ObjectStorer` (MinIO) y `BugReportSender`
18. Refactorizar duplicacion en `servicesContact.go`
19. Unificar logging a solo `slog`
