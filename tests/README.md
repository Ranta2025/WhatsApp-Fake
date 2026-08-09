# 📋 Estructura de Tests del Proyecto

## 📁 Organización

```
proyecto/
├── backend/
│   ├── utils/
│   │   ├── password.go           ← Código
│   │   ├── password_test.go      ← ✅ Test unitario (mismo paquete)
│   │   ├── token.go              ← Código
│   │   └── token_test.go         ← ✅ Test unitario (mismo paquete)
│   │
│   ├── services/
│   │   ├── servicesUser.go       ← Código
│   │   └── servicesUser_test.go  ← ✅ Test unitario (mismo paquete)
│   │
│   └── handlers/
│       ├── handlerChat.go        ← Código
│       └── handlerChat_test.go   ← ✅ Test unitario (mismo paquete)
│
└── tests/
    ├── integration/              ← Tests de integración (múltiples capas)
    │   ├── auth_flow_test.go     ← Test: Registro → Login → Activación
    │   ├── chat_flow_test.go     ← Test: Crear chat → Enviar mensaje
    │   └── contact_flow_test.go  ← Test: Agregar contacto → Iniciar chat
    │
    └── fixtures/                 ← Datos de prueba
        ├── users.json
        ├── messages.json
        └── setup.go              ← Funciones auxiliares para tests
```

## 🎯 Tipos de Tests y Ubicación

### 1. Tests Unitarios (`*_test.go` en carpeta del código)

**¿Qué prueban?** Una función individual, aislada

**Ubicación:** Misma carpeta del código

**Ejemplo:**
```go
// backend/utils/password_test.go
func TestHashSuccess(t *testing.T) { ... }
```

**Ventajas:**
- Rápidos
- Fáciles de escribir
- Prueban lógica pura

**Desventajas:**
- No prueban interacción entre capas
- Necesitan mocks

---

### 2. Tests de Integración (`tests/integration/`)

**¿Qué prueban?** Flujos completos entre múltiples capas

**Ubicación:** Carpeta separada `tests/integration/`

**Ejemplo:**
```go
// tests/integration/auth_flow_test.go
func TestCompleteAuthFlow(t *testing.T) {
    // 1. Crear usuario (handler → service → repo → DB)
    // 2. Activar cuenta (handler → service → cache)
    // 3. Login (handler → service → cache)
}
```

**Ventajas:**
- Prueban flujos reales
- Detectan problemas en la integración
- Más confiables

**Desventajas:**
- Más lentos
- Necesitan BD real o mocks complejos
- Más difíciles de escribir

---

## 🏃 Ejecutar Tests

```bash
# Todos los tests (unitarios + integración)
go test -v ./...

# Solo tests unitarios de una carpeta
go test -v ./backend/utils

# Solo tests de integración
go test -v ./tests/integration

# Con cobertura
go test -cover ./...

# Tests específicos
go test -v -run TestHashSuccess ./backend/utils
```

---

## 📊 Ejemplo: Auth Flow

### Estructura Actual (Unitarios)
```
backend/utils/password_test.go       ← Prueba Hash() aislado
backend/utils/token_test.go          ← Prueba GenerateToken() aislado
backend/services/servicesUser_test.go ← Prueba CreateUser() aislado
```

### Estructura Futura (Integración)
```
tests/integration/auth_flow_test.go  ← Prueba: Register → Activate → Login
```

Que probaría:
1. Usuario hace POST /log/create
2. Se envía email (mock)
3. Usuario hace POST /log/activate
4. Se activa la cuenta en BD
5. Usuario hace POST /log/login
6. Se devuelve JWT válido
7. JWT se puede usar en endpoints protegidos

---

## 🛠️ Fixtures (Datos de Prueba)

En `tests/fixtures/` irán archivos con datos de prueba:

```go
// tests/fixtures/setup.go
func CreateTestUser() models.UserDataBase {
    return models.UserDataBase{
        Username: "testuser",
        Gmail:    "test@example.com",
        Telephon: "12345678",
        Password: "hashedPassword",
    }
}
```

---

## 📈 Plan de Testing Completo

| Nivel | Tipo | Ubicación | Ejemplos |
|-------|------|-----------|----------|
| 1️⃣ | Unit | `backend/*/` | Hash(), Token(), Validaciones |
| 2️⃣ | Unit | `backend/*/` | Services (con mocks) |
| 3️⃣ | Unit | `backend/*/` | Handlers (con mocks) |
| 4️⃣ | Integration | `tests/integration/` | Auth flow completo |
| 5️⃣ | Integration | `tests/integration/` | Chat flow completo |
| 6️⃣ | E2E | `tests/e2e/` | Tests en navegador (opcional) |

---

## ✅ Checklist de Estructura

- [x] Carpetas `tests/integration/` y `tests/fixtures/` creadas
- [ ] Tests unitarios en carpetas del código (`*_test.go`)
- [ ] Tests de integración en `tests/integration/`
- [ ] Fixtures en `tests/fixtures/`
- [ ] Documentation actualizada
- [ ] Makefile con comandos de test (opcional pero profesional)

