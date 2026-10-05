# 💬 ChatApp - Real-time Messaging Platform

Una plataforma de mensajería instantánea completa construida con **Go (Gin)** y **React 19**, con WebSockets, chats grupales, videollamadas, compartición de multimedia, fotos de perfil y fondos personalizados.

<div align="center">

[![Go](https://img.shields.io/badge/Go-1.25+-00ADD8?style=for-the-badge&logo=go)](https://golang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-336791?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7+-DC382D?style=for-the-badge&logo=redis)](https://redis.io/)
[![MinIO](https://img.shields.io/badge/MinIO-Object_Storage-C72C48?style=for-the-badge&logo=minio)](https://min.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker)](https://www.docker.com/)

</div>

---

## 🚀 Características

### Mensajería
- 💬 **Chat 1:1 en Tiempo Real** — Mensajes instantáneos vía WebSocket con confirmación
- 👥 **Chat Grupal** — Crear grupos, agregar miembros, roles admin/miembro, mensajería grupal en tiempo real
- 📎 **Multimedia** — Envío de imágenes, audio, vídeo y stickers (almacenados en MinIO)
- 🎙️ **Notas de voz** — Grabación y reproducción con velocidad variable (0.5×–2×)
- ✏️ **Editar / Eliminar mensajes** — Sincronización en tiempo real, eliminación individual o para todos
- 💬 **Responder mensajes** — Citas de mensajes previos con vista previa
- 🗑️ **Borrar chat / Eliminar para mí** — Control individual del historial (soft-delete por usuario)
- 📖 **Estados de mensaje** — Enviado → Entregado → Visto
- ⌨️ **Indicador de escritura** — En chats 1:1 y grupales
- ↪️ **Reenviar mensajes** — A otros contactos

### PWA y modo offline
- 📲 **Instalable** — Manifest con iconos PNG (192/512/maskable) y `apple-touch-icon`; botón "Instalar app" en el perfil (Chromium/Edge/Android) e instrucciones para iOS (regenerar iconos: `cd frontend && npm run icons`)
- 🧱 **App shell offline** — Service worker (`vite-plugin-pwa`, modo `injectManifest`, fuente en `frontend/src/sw.ts`) que precachea `index.html`, `/assets/*` e iconos; tras una visita, recargar sin red muestra la app y el aviso "Sin conexión"
- 🚫 **Sin caché de datos** — `/api/*` (incluido el WebSocket), `/storage/*`, `/healthz` y `/metrics` siempre van a la red
- 🔄 **Actualizaciones con aviso** — Una nueva versión muestra "Nueva versión disponible · Actualizar"; nunca reemplaza el worker bajo una pestaña abierta sin confirmación
- 📤 **Envío offline de texto** — Los mensajes de texto (1:1 y grupo) escritos sin conexión quedan en una cola IndexedDB con reloj de pendiente, sobreviven a la recarga y se envían en orden al reconectar. Cada envío lleva un `clientID` (UUID) y el backend es idempotente por (remitente, `clientID`): un reenvío no duplica ni se vuelve a entregar. Los adjuntos no se encolan

### Notificaciones push
- 🔔 **Web Push (VAPID)** — Avisos de mensajes nuevos 1:1 y de grupo con la app cerrada; al pulsarlos se abre ese chat. Opcional y con vista previa configurable; ver [Notificaciones push](#-notificaciones-push-web-push)

### Videollamadas
- 📹 **Llamadas de voz y vídeo** — Integrado con **ZegoCloud**, tokens seguros por sala
- 📋 **Historial de llamadas** — Registro con duración, tipo (audio/video) y estado (contestada/perdida/rechazada/no disponible)
- 🔔 **Ciclo completo** — Oferta → Aceptar/Rechazar → Finalizar, con notificación de no disponible
- 🗑️ **Eliminar registros** — Eliminación individual por usuario

### Usuarios y Contactos
- 🖼️ **Fotos de perfil** — Subida a MinIO, notificación instantánea a todos los contactos vía WebSocket
- 🎨 **Fondos personalizados** — Wallpaper global y por contacto individual
- 🔒 **Autenticación** — JWT (access + refresh tokens), bcrypt, bloqueo automático tras intentos fallidos
- 📧 **Verificación por email** — Código de activación, recuperación de contraseña, reenvío de código
- 👥 **Gestión de contactos** — Solicitud/Aceptar/Rechazar/Bloquear con notificación en tiempo real
- 📝 **Nombres personalizados** — Cada usuario puede nombrar a sus contactos de forma independiente
- 🟢 **Presencia** — Estado online/offline y hora de última conexión en tiempo real
- 🔄 **Cambio de username** — Notificación en tiempo real a todos los contactos

### Grupos
- 🏗️ **Crear grupos** — Con nombre, descripción y miembros iniciales
- 👑 **Roles** — Admin y miembro, el creador es admin por defecto; los admins designan/descartan admins y eliminan participantes
- ⚙️ **Permisos estilo WhatsApp** — "Enviar mensajes", "Editar info del grupo" y "Agregar otros participantes", cada uno todos / solo admins, aplicados en el servidor (REST y WS); ver [Administración de grupos](#administración-de-grupos)
- 📜 **Mensajes de sistema** — Altas, bajas, cambios de rol, de configuración y de nombre/descripción quedan persistidos en el historial
- 🖼️ **Avatar de grupo** — Imagen personalizada almacenada en MinIO
- 💬 **Mensajería grupal** — Enviar, editar y eliminar mensajes con broadcast a todos los miembros
- 📄 **Paginación** — Mensajes de grupo paginados
- 🚪 **Salir del grupo** — Cualquier miembro puede abandonar el grupo

### Infraestructura
- ⚡ **Alto rendimiento** — Backend en Go (Gin) con caché Redis
- 🗄️ **PostgreSQL 16 + GORM** — Persistencia con migraciones automáticas
- 📦 **MinIO** — Object storage S3-compatible para todos los archivos multimedia
- 🐳 **Docker Compose** — 7 servicios (app, postgres, redis, frontend, nginx, minio, cloudflared)
- 🌐 **Nginx** — Reverse proxy con routing inteligente (API, WebSocket, storage, frontend)
- 🐛 **Bug reporting** — Los usuarios pueden reportar bugs que se crean como GitHub Issues automáticamente
- ☁️ **Cloudflare Tunnel** — Acceso público integrado en Docker sin configuración extra
- 📡 **Cloudflare Tunnel** — Scripts para obtener URL pública en desarrollo

---

## ☁️ Despliegue gratuito

Backend en **Render** (blueprint `render.yaml` con PostgreSQL y Redis gratuitos) y
frontend en **Vercel** (`frontend/vercel.json`). Guía paso a paso en
[`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## ⚡ Probarlo en local (Docker, 1 comando)

Solo necesitas [Docker Desktop](https://www.docker.com/products/docker-desktop/) (o Docker
Engine + Compose v2). No hace falta crear `.env` ni instalar Go/Node.

```bash
git clone https://github.com/Ranta2025/WhatsApp-Fake.git
cd WhatsApp-Fake
docker compose up -d --build        # o: make up
```

La primera vez tarda unos minutos (compila el backend, el frontend y MinIO). Después:

| Qué | Dónde |
|---|---|
| **App** | http://localhost |
| Bandeja de correo (códigos de activación) | http://localhost:8025 (Mailpit) |
| Consola de archivos | http://localhost:9001 (`minioadmin` / `minioadmin`) |
| API directa | http://localhost:8080 (`/healthz` para comprobar el estado) |

**Usuarios de prueba** (se crean solos): `ana_demo`, `luis_demo`, `marta_demo` — contraseña
`Demo1234!`. Ya son contactos entre sí, tienen una conversación y un grupo. Abre dos
navegadores (o uno normal y otro en incógnito) con dos usuarios para ver el chat en tiempo real.

También puedes registrarte: el código de activación llega a **Mailpit** (http://localhost:8025).

Servicios del stack: `web` (nginx con el frontend compilado + proxy de `/api`, WebSocket y
`/storage`), `app` (API Go), `postgres`, `redis`, `minio` y `mailpit`.

Comandos útiles:

```bash
docker compose ps                  # estado (todos deben aparecer "healthy")
docker compose logs -f app         # logs del backend
docker compose down                # parar (conserva los datos)
docker compose down -v             # parar y BORRAR los datos
docker compose --profile tunnel up -d && ./scripts/setup-cloudflare.sh   # URL pública temporal
```

Para personalizar (puertos si el 80 está ocupado, correo real, llamadas con ZegoCloud…)
copia `.env.example` a `.env` y descomenta lo que necesites, por ejemplo `WEB_PORT=8081`.

> Las **llamadas** necesitan credenciales gratuitas de ZegoCloud (`ZEGO_APP_ID`,
> `ZEGO_SERVER_SECRET`); todo lo demás funciona sin configurar nada.

### Desarrollo con recarga en caliente

Con el stack de Docker en marcha, el frontend en modo desarrollo usa la API de `localhost:8080`:

```bash
cd frontend && npm install && npm run dev    # http://localhost:5173
```

Para el backend fuera de Docker (Go 1.25+): `docker compose up -d postgres redis minio mailpit`,
copia `.env.example` a `.env` con los valores de `localhost` y ejecuta `go run .`.

---

## 🔔 Notificaciones push (Web Push)

Avisos del sistema para mensajes nuevos (1:1 y de grupo) aunque la app no esté abierta.
Al pulsar la notificación se abre (o se enfoca) la app en ese chat, también si estaba cerrada.
**Es opcional**: sin claves VAPID el push queda deshabilitado y la app funciona igual que
siempre, sin ningún ajuste de push en la interfaz.

**Activarlo:**

```bash
make vapid-keys                # imprime VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT
```

1. Copia las tres variables `VAPID_*` a tu `.env` (ajusta `VAPID_SUBJECT` a un `mailto:` o
   una URL `https` tuya). Nunca subas estas claves al repositorio.
2. Reinicia el backend: `docker compose up -d app`.
3. En la app, abre **Editar Perfil** (icono de ajustes) y activa **Notificaciones push**; el
   navegador pedirá permiso de notificaciones.

**Privacidad:**

- Por defecto la notificación muestra el remitente (o el grupo) y el texto del mensaje
  (truncado; "Foto", "Audio"… para multimedia). El contenido viaja cifrado de extremo a
  extremo hasta el navegador: el servicio de push no puede leerlo.
- Cada usuario puede desactivar **Mostrar vista previa** en Editar Perfil: la notificación
  mantiene el remitente pero el texto pasa a ser "Nuevo mensaje".
- `PUSH_PREVIEW=off` en `.env` fuerza ese cuerpo genérico para todos los usuarios.
- Al **cerrar sesión** se elimina la suscripción de ese navegador: un navegador compartido no
  sigue recibiendo los mensajes del usuario anterior.

**Cuándo llega un push:** solo a los usuarios sin conexión abierta con la app (sin WebSocket
activo). Quien tiene la app abierta ya recibe el mensaje en tiempo real y no recibe un push
duplicado en ese dispositivo.

**Requisitos del navegador:**

- Web Push exige **HTTPS**. `http://localhost` cuenta como contexto seguro y sirve para
  probar en el propio equipo; para un móvil u otro dispositivo real usa el túnel de
  Cloudflare (`make tunnel` o `docker compose --profile tunnel up -d`), que da una URL `https`.
- **iOS/iPadOS** solo entrega notificaciones push a la **PWA instalada** (Compartir →
  "Añadir a pantalla de inicio", iOS/iPadOS 16.4 o superior) y abierta desde ese icono; en una
  pestaña de Safari no está disponible.
- Chrome, Edge, Firefox, Android y Safari en macOS 13+ funcionan desde el navegador.

---

## 📁 Estructura del Proyecto

```
├── backend/
│   ├── app/             # Raíz de composición: dependencias, servidor y apagado ordenado
│   ├── cache/           # Redis: refresh tokens, códigos, intentos, tickets WS
│   ├── config/          # Configuración CORS
│   ├── database/        # Conexiones PostgreSQL, Redis, MinIO
│   ├── integration/     # Tests de integración (-tags integration) y e2e (-tags e2e)
│   ├── handlers/        # HTTP handlers (User, Contact, Chat, Call, Group, Media, BugReport)
│   ├── middleware/      # Validación de inputs, JWT, reglas de negocio
│   ├── models/          # Modelos de dominio y DTOs base
│   ├── repos/           # Acceso a datos
│   ├── routers/         # Registro de rutas (auth + api/v1)
│   ├── schemas/         # DTOs de respuesta (user, chat, call, group)
│   ├── services/        # Lógica de negocio
│   ├── utils/           # JWT, bcrypt, validaciones, email, logger
│   └── websocket/       # Hub, cliente, handlers y eventos
│
├── frontend/
│   └── src/
│       ├── api/         # Cliente HTTP/WebSocket y APIs de grupo
│       ├── components/  # Componentes compartidos (auth, llamadas, bug report, media)
│       ├── context/     # AuthContext
│       ├── features/    # Dashboard modular (componentes, hooks, context)
│       ├── hooks/       # useWebSocket
│       ├── pages/       # Login, register, dashboard, recuperación, etc.
│       └── utils/       # notificaciones, permisos, validaciones
│
├── docker/              # Dockerfiles (backend, frontend, minio) y nginx.conf
├── compose.yaml         # Stack local completo (docker compose up -d --build)
├── docs/                # Documentación técnica (despliegue: docs/DEPLOY.md)
├── scripts/             # Automatización cloudflare
├── tests/               # Tests de integración
└── main.go              # Entry point
```

---

## 🛣️ API Endpoints

### Autenticación — `/api/v1/auth/` (sin token)

La sesión usa cookies HttpOnly: `token` (access, 15 min) y `refresh_token` (7 días,
opaco, rotado en cada uso y revocado al cambiar la contraseña o bloquear la cuenta).

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/auth/register` | Crear cuenta (inactiva hasta verificar el código del email) |
| `POST` | `/api/v1/auth/login` | Iniciar sesión (cookies de sesión) |
| `POST` | `/api/v1/auth/logout` | Cerrar sesión (invalida el refresh token) |
| `POST` | `/api/v1/auth/refresh` | Renovar la sesión con la cookie `refresh_token` |
| `POST` | `/api/v1/auth/activate` | Activar cuenta con código |
| `POST` | `/api/v1/auth/resend-activation` | Reenviar código de activación (por username) |
| `POST` | `/api/v1/auth/resend-unlock-code` | Enviar código de desbloqueo (por email) |
| `POST` | `/api/v1/auth/unlock` | Desbloquear cuenta con código |
| `POST` | `/api/v1/auth/unlock-and-reset` | Desbloquear y cambiar contraseña con código |
| `POST` | `/api/v1/auth/forgot-password` | Enviar código para restablecer contraseña |
| `POST` | `/api/v1/auth/reset-password` | Restablecer contraseña con código |

Los códigos son de un solo uso, caducan a los 10 minutos y se invalidan tras 5 intentos
fallidos. Las rutas antiguas en la raíz (`/LogIn`, `/register`, …) siguen disponibles por
compatibilidad. Los endpoints de login/códigos y los que envían emails tienen límite de
peticiones por IP.

### Usuarios — `/api/v1/` (requiere JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/user` | Obtener perfil propio |
| `PUT` | `/api/v1/user` | Actualizar username |
| `PUT` | `/api/v1/profile/avatar` | Actualizar foto de perfil |
| `PUT` | `/api/v1/profile/wallpaper` | Actualizar wallpaper global |
| `PUT` | `/api/v1/contact/wallpaper` | Actualizar wallpaper por contacto |

### Contactos — `/api/v1/` (requiere JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/contact` | Listar contactos |
| `POST` | `/api/v1/contact` | Agregar contacto |
| `PUT` | `/api/v1/contact` | Actualizar contacto (nombre/estado) |

### Chat — `/api/v1/` (requiere JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/chat` | Crear mensaje (HTTP) |
| `GET` | `/api/v1/chat/:contact` | Obtener mensajes con un contacto |
| `GET` | `/api/v1/chats` | Listar todas las conversaciones |
| `PUT` | `/api/v1/chat/:contact` | Marcar mensajes como vistos/entregados |
| `PUT` | `/api/v1/chat` | Marcar pendientes como entregados |
| `PUT` | `/api/v1/chat/edit` | Editar mensaje |
| `DELETE` | `/api/v1/chat/:contact` | Borrar chat (para mí) |
| `DELETE` | `/api/v1/message/:id/me` | Eliminar mensaje para mí |

### Llamadas — `/api/v1/` (requiere JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/call/token/:roomID` | Obtener token ZegoCloud para sala |
| `GET` | `/api/v1/call/history` | Historial de llamadas |
| `DELETE` | `/api/v1/call/:id` | Eliminar registro de llamada |

### Grupos — `/api/v1/` (requiere JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/group` | Crear grupo |
| `GET` | `/api/v1/group` | Obtener grupos del usuario |
| `GET` | `/api/v1/group/:groupID` | Obtener detalle del grupo |
| `POST` | `/api/v1/group/:groupID/members` | Agregar miembros (según "Agregar otros participantes") |
| `PUT` | `/api/v1/group/:groupID/members/:telephon/role` | Designar/descartar admin, body `{"role":"admin"\|"member"}` (solo admins) |
| `DELETE` | `/api/v1/group/:groupID/members/:telephon` | Eliminar a un participante (solo admins) |
| `DELETE` | `/api/v1/group/:groupID/member` | Salir del grupo |
| `PATCH` | `/api/v1/group/:groupID/settings` | Configuración de permisos (solo admins) |
| `PATCH` | `/api/v1/group/:groupID` | Cambiar nombre/descripción (según "Editar info del grupo") |
| `PATCH` | `/api/v1/group/:groupID/avatar` | Actualizar avatar del grupo (según "Editar info del grupo") |
| `POST` | `/api/v1/group/:groupID/message` | Enviar mensaje al grupo |
| `GET` | `/api/v1/group/:groupID/message` | Obtener mensajes del grupo (paginados) |
| `PUT` | `/api/v1/group/:groupID/message` | Editar mensaje del grupo |
| `DELETE` | `/api/v1/group/:groupID/message` | Eliminar mensaje del grupo |

### Media — `/api/v1/` (requiere JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Subir archivo a MinIO → devuelve URL pública |

La app incluye un pack de stickers básicos servido como assets estáticos en `/stickers/basic/<id>.webp`; se envían como mensajes con `mediaType=sticker` y no pasan por `/api/v1/upload`.

### Público

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/bug-report` | Reportar bug → crea Issue en GitHub |

### WebSocket

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/ws-ticket` | Ticket de un solo uso (30 s) para abrir el WebSocket |
| `GET` | `/api/v1/ws` | Conectar WebSocket (cookie de sesión o `?ticket=`) |
| `GET` | `/healthz` | Estado de PostgreSQL y Redis |

---

## 🔌 Eventos WebSocket

### Cliente → Servidor

| Tipo | Payload | Descripción |
|------|---------|-------------|
| `ping` | — | Keepalive |
| `chat` | `MessageGet` | Enviar mensaje 1:1 (`clientID` opcional para idempotencia) |
| `read` | `{from}` | Marcar mensajes de `from` como vistos |
| `typing` | `{to}` | Indicador de escritura |
| `edit_message` | `{messageId, receptor, message}` | Editar mensaje |
| `delete_message` | `{messageId, receptor}` | Eliminar mensaje para todos |
| `call_offer` | `{to, roomId, callType}` | Iniciar llamada |
| `call_accept` | `{to, roomId}` | Aceptar llamada |
| `call_reject` | `{to, roomId}` | Rechazar llamada |
| `call_end` | `{to, roomId}` | Terminar llamada |
| `group_chat` | `GroupMessageSend` | Enviar mensaje grupal (`clientID` opcional para idempotencia) |
| `group_typing` | `{groupID}` | Typing en grupo |
| `group_edit_message` | `{groupID, messageID, message}` | Editar mensaje grupal |
| `group_delete_message` | `{groupID, messageID}` | Eliminar mensaje grupal |
| `group_join` | `{groupID}` | Unirse a sala WS del grupo |

### Servidor → Cliente

| Tipo | Payload | Descripción |
|------|---------|-------------|
| `pong` | — | Respuesta a ping |
| `chat` | Objeto `Message` | Mensaje nuevo / confirmación |
| `read` | `{from}` | Confirmación de mensajes vistos |
| `typing` | `{from, isTyping}` | Indicador de escritura |
| `edit_message` | Objeto `Message` | Mensaje editado |
| `delete_message` | Objeto `Message` | Mensaje eliminado |
| `message_delivered` | `{from}` | Mensajes marcados como entregados |
| `contacts_online` | `[]telephon` | Lista inicial de contactos conectados |
| `online` | `{username, telephon}` | Contacto conectado |
| `offline` | `{username, telephon, last_seen}` | Contacto desconectado |
| `avatar_changed` | `{telephon, avatarUrl}` | Foto de perfil actualizada |
| `contact_request` | `{username, number, status}` | Nueva solicitud de contacto |
| `contact_response` | `{username, number, status}` | Respuesta a solicitud |
| `username_changed` | `{telephon, username}` | Contacto cambió username |
| `incoming_call` | `{from, roomId, callType}` | Llamada entrante |
| `call_accepted` | `{from, roomId}` | Llamada aceptada |
| `call_rejected` | `{from, roomId}` | Llamada rechazada |
| `call_ended` | `{from, roomId}` | Llamada finalizada |
| `call_unavailable` | `{from, roomId}` | Usuario no disponible |
| `group_chat` | `GroupMessageResponse` | Nuevo mensaje de grupo |
| `group_typing` | `{groupID, from}` | Typing en grupo |
| `group_edit_message` | `GroupMessageResponse` | Mensaje grupal editado |
| `group_delete_message` | `{groupID, messageID}` | Mensaje grupal eliminado |
| `group_member_added` | `{groupID, addedByUsername, addedMembers, newMemberCount, systemMessage}` | Participantes añadidos |
| `group_member_left` | `{groupID, telephon, username, systemMessage}` | Un participante salió |
| `group_member_role` | `{groupID, telephon, role, systemMessage}` | Admin designado/descartado |
| `group_member_removed` | `{groupID, telephon, username, newMemberCount, systemMessage}` | Participante eliminado (también lo recibe el eliminado) |
| `group_settings` | `{groupID, onlyAdminsCanSend, onlyAdminsCanEditInfo, onlyAdminsCanAddMembers, systemMessage?}` | Configuración de permisos cambiada |
| `group_info` | `{groupID, name, description, systemMessage?}` | Nombre/descripción cambiados |
| `error` | `{error}` | Mensaje de error |

### Administración de grupos

Modelo estilo WhatsApp, aplicado en el servidor en cada ruta (REST y WebSocket); ocultar controles en la UI es solo comodidad.

- **Roles:** `admin` y `member`. El creador nace admin. Cualquier admin puede designar o descartar a otro admin (incluido el creador; no hay dueño protegido) y eliminar participantes. Nadie puede descartarse ni eliminarse a sí mismo por estas rutas (para salir está `DELETE .../member`); si el último admin sale, se promueve al miembro más antiguo.
- **Configuración** (`PATCH /api/v1/group/:groupID/settings`, al menos un campo): `onlyAdminsCanSend` ("Enviar mensajes"), `onlyAdminsCanEditInfo` ("Editar info del grupo": nombre, descripción y avatar) y `onlyAdminsCanAddMembers` ("Agregar otros participantes"). Por defecto todo abierto (`false`), también en los grupos existentes; `POST /api/v1/group` acepta los tres valores al crear. Repetir los valores vigentes no escribe ni genera mensaje de sistema.
- **Solo admins envían:** un miembro restringido no puede enviar (REST ni WS `group_chat`), editar mensajes ni emitir `group_typing`; sí puede borrar sus propios mensajes. Los admins no se ven afectados.
- **Errores:** permiso denegado → `403` en REST y frame `error` en WS sin efectos; objetivo que no es miembro → `404`; transición inválida (rol ya asignado, auto-descarte o auto-eliminación) → `400`.
- **Participante eliminado:** sale de la sala WS, recibe `group_member_removed`, pierde acceso a detalle, historial y búsqueda, y si se lo vuelve a añadir empieza con una línea base de acuses nueva.
- **Mensajes de sistema:** cada alta, baja, salida, cambio de rol, de configuración y de nombre/descripción se persiste (el cambio de avatar emite `group_avatar_update` sin mensaje de sistema) en el historial como un `GroupMessageResponse` con `Kind: "system"`, `SystemEvent` (`member_added`, `member_removed`, `member_left`, `admin_granted`, `admin_revoked`, `settings_changed`, `info_changed`) y `SystemTargets` (teléfonos afectados); el texto se renderiza por cliente. Viajan en el campo `systemMessage` de los eventos y quedan fuera de búsqueda, Info/acuses, respuestas, ediciones y media.

---

## 🧪 Testing

```bash
# Todos los tests
go test ./...

# Con cobertura
go test -cover ./...

# Paquete específico
go test -v ./backend/services/...
```

**Cobertura actual del repo:**
- 15 archivos de tests
- Tests en handlers, services, repos y utils
- Uso de `testify` (assert/require + mocks)

Ver: [docs/TESTS_INSTRUCTIONS.md](docs/TESTS_INSTRUCTIONS.md)

### Tests e2e (navegador y API) e integración continua

Con el stack levantado (`make up`, usuarios demo incluidos):

```bash
# e2e de API/WebSocket en Go (-tags e2e)
make test-integration
# si el Postgres del stack está publicado en otro puerto (POSTGRES_PUBLIC_PORT), p. ej. 55432:
POSTGRES_PUBLIC_PORT=55432 make test-integration

# e2e de navegador con Playwright (login, chat, grupo con media, administración de grupos, estados, paginación, búsqueda, PWA, envío offline y Web Push)
cd frontend && npm ci
npx playwright install chromium   # solo la primera vez
npm run test:e2e                  # o, desde la raíz: make e2e
```

- Base URL por defecto `http://localhost`; se cambia con `E2E_BASE_URL`.
- El global setup inicia sesión una vez con `ana_demo`, `luis_demo` y `marta_demo` y guarda el estado en `frontend/e2e/.auth/` (ignorado por git).
- Los specs usan texto único y no asumen conteos absolutos: pueden repetirse sobre una BD con datos previos.
- Informe HTML en `frontend/playwright-report/` (`npx playwright show-report`).
- No ejecutes `go test -tags integration` contra este stack: hace `TRUNCATE` de las tablas.

GitHub Actions (`.github/workflows/ci.yml`) ejecuta el job `unit` (`go test ./...` y lint, typecheck, test y build del frontend) y, si pasa, el job `e2e` (levanta el stack con Docker Compose, `make test-integration` y Playwright; sube siempre el informe de Playwright y, si falla o se cancela, los logs de Docker Compose).

---

## 🌐 Variables de Entorno

Todas están documentadas en [`.env.example`](.env.example). Con Docker ninguna es
obligatoria (compose.yaml trae valores por defecto para uso local); en producción las
imprescindibles son `SECRETKEY` (≥ 32 caracteres), la base de datos (`DATABASE_URL` o
`POSTGRES_*`), Redis (`REDIS_URL` o `REDIS_*`), el almacenamiento (`MINIO_*`) y el correo
(`SMTP_*`/`GMAIL_*` o `BREVO_API_KEY`). Ver también [`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## 📚 Documentación

| Documento | Descripción |
|-----------|-------------|
| [docs/DEPLOY.md](docs/DEPLOY.md) | Despliegue gratuito (Render + Vercel) |
| [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md) | Métricas Prometheus, request id, Grafana (perfil `observability`) |
| [docs/WEBSOCKET_GUIDE.md](docs/WEBSOCKET_GUIDE.md) | Protocolo WebSocket detallado |
| [docs/BUG_REPORT_SYSTEM.md](docs/BUG_REPORT_SYSTEM.md) | Sistema de reportes a GitHub |
| [scripts/setup-cloudflare.ps1](scripts/setup-cloudflare.ps1) | Obtener URL pública con Cloudflare (Windows) |
| [scripts/setup-cloudflare.sh](scripts/setup-cloudflare.sh) | Obtener URL pública con Cloudflare (Linux/Mac) |
| [docs/MEDIA_UPLOAD_GUIDE.md](docs/guides/MEDIA_UPLOAD_GUIDE.md) | Subida de archivos multimedia |
| [docs/TESTS_INSTRUCTIONS.md](docs/TESTS_INSTRUCTIONS.md) | Cómo ejecutar los tests |
| [docs/INDEX.md](docs/INDEX.md) | Índice completo |

---

## 🔐 Seguridad

- Contraseñas hasheadas con **bcrypt**
- Sesión en cookies HttpOnly: JWT de 15 min + refresh token opaco, rotado y revocable
- Bloqueo automático de cuenta tras 5 intentos fallidos; códigos de un solo uso
- Límite de peticiones por IP en login, códigos y envío de emails
- URLs de archivos validadas (sin `javascript:`) y contenido de subidas verificado
- Validación estricta de inputs en middlewares
- CORS configurado por entorno
- Secrets exclusivamente en variables de entorno

---

## 🐛 Reportar Bugs

La app incluye un botón de reporte de bugs integrado. Al enviarlo, se crea automáticamente un Issue en el repositorio de GitHub con toda la información del usuario y su descripción.

Ver configuración: [docs/BUG_REPORT_SYSTEM.md](docs/BUG_REPORT_SYSTEM.md)

---

## 🤝 Contribuir

1. Fork el proyecto
2. `git checkout -b feature/mi-feature`
3. `git commit -m 'feat: descripción'`
4. `git push origin feature/mi-feature`
5. Abre un Pull Request

---

## 📝 Licencia

MIT — ver [LICENSE](LICENSE) para detalles.

---

## 👨‍💻 Autor

**Rafael Antonio Tanda Pretel**

- GitHub: [Ranta2025](https://github.com/Ranta2025)

---

## 🙏 Stack

- [Gin](https://github.com/gin-gonic/gin) — HTTP framework para Go
- [GORM](https://gorm.io/) — ORM para Go
- [Gorilla WebSocket](https://github.com/gorilla/websocket) — WebSockets en Go
- [MinIO](https://min.io/) — Object storage S3-compatible
- [ZegoCloud](https://www.zegocloud.com/) — SDK de videollamadas
- [React 19](https://reactjs.org/) — UI library
- [Tailwind CSS](https://tailwindcss.com/) — Utility-first CSS

---

## ✅ Estado del Proyecto

- Backend modular por capas (handlers → services → repos)
- WebSocket con presencia, typing, entrega de mensajes y reconexión robusta
- Soporte completo para chats 1:1, grupos, llamadas y multimedia
- Infraestructura lista para desarrollo local y exposición pública (Cloudflare)

---

<div align="center">

**⭐ Si te gusta este proyecto, dale una estrella ⭐**

</div>
