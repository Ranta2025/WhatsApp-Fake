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
- 👑 **Roles** — Admin y miembro, el creador es admin por defecto
- 🖼️ **Avatar de grupo** — Imagen personalizada almacenada en MinIO
- 💬 **Mensajería grupal** — Enviar, editar y eliminar mensajes con broadcast a todos los miembros
- 📄 **Paginación** — Mensajes de grupo paginados
- 🚪 **Salir del grupo** — Cualquier miembro puede abandonar el grupo

### Infraestructura
- ⚡ **Alto rendimiento** — Backend en Go (Gin) con caché Redis
- 🗄️ **PostgreSQL 16 + GORM** — Persistencia con migraciones automáticas
- 📦 **MinIO** — Object storage S3-compatible para todos los archivos multimedia
- 🐳 **Docker Compose** — Redis y MinIO en Docker; PostgreSQL local
- 🌐 **Nginx** — Reverse proxy con routing inteligente (API, WebSocket, storage, frontend)
- 🐛 **Bug reporting** — Los usuarios pueden reportar bugs que se crean como GitHub Issues automáticamente
- ☁️ **Cloudflare Tunnel** — Acceso público integrado en Docker sin configuración extra
- 📡 **Cloudflare Tunnel** — Scripts para obtener URL pública en desarrollo

---

## 📋 Requisitos Previos

- [Go 1.25+](https://golang.org/dl/)
- [Node.js 20+](https://nodejs.org/)
- [Docker & Docker Compose](https://www.docker.com/)

> Docker levanta Redis y MinIO. PostgreSQL debe estar instalado localmente.

---

## 🛠️ Instalación

### 1. Clonar el Repositorio

```bash
git clone github.com/Ranta2025/Whatsapp-Fake.git
cd <nombre-proyecto>
```

### 2. Configurar Variables de Entorno

Crea un archivo `.env` en la raíz con las variables listadas en la sección [Variables de Entorno](#-variables-de-entorno).

### 3. Opción A: Docker (Servicios auxiliares)

Levanta Redis y MinIO (PostgreSQL corre localmente):

```bash
cd docker
docker-compose up -d
```

### 3. Opción B: Manual

**Backend:**
```bash
go mod download
go run main.go
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## 🎯 Uso

### Desarrollo Local

1. Iniciar el backend (puerto `8080`): `go run main.go`
2. Iniciar el frontend (puerto `5173`): `cd frontend && npm run dev`
3. Abrir `http://localhost:5173`

### Con Docker (Redis + MinIO)

```bash
cd docker
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener
docker-compose down
```

> **Nota:** PostgreSQL corre localmente, no en Docker. Asegúrate de tenerlo iniciado antes de levantar el backend.

### Compartir con Cloudflare Tunnel

```bash
# Windows
./scripts/setup-cloudflare.ps1

# Linux/Mac
./scripts/setup-cloudflare.sh
```

Estos scripts leen los logs de `cloudflared` y te muestran la URL pública `https://*.trycloudflare.com`.

---

## 📁 Estructura del Proyecto

```
├── backend/
│   ├── cache/           # Caché Redis (intentos, validaciones, utilidades)
│   ├── config/          # Configuración CORS
│   ├── database/        # Conexiones PostgreSQL, Redis, MinIO
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
├── docker/              # compose.yml, dockerfile, nginx.conf
├── docs/                # Documentación técnica
├── scripts/             # Automatización cloudflare
├── tests/               # Tests de integración
└── main.go              # Entry point
```

---

## 🛣️ API Endpoints

### Autenticación (sin token)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/register` | Crear cuenta |
| `POST` | `/LogIn` | Iniciar sesión → devuelve JWT |
| `POST` | `/logout` | Cerrar sesión |
| `POST` | `/refresh` | Refrescar JWT |
| `POST` | `/activate` | Activar cuenta con código |
| `POST` | `/activate-cuenta` | Solicitar código de recuperación |
| `POST` | `/resend-code` | Reenviar código de activación |
| `POST` | `/recover-cuenta` | Desbloquear cuenta con código |
| `POST` | `/unlock-account` | Recuperar cuenta y cambiar contraseña |
| `POST` | `/forgot-password-send` | Enviar código para cambio de contraseña |
| `POST` | `/forgot-password-change` | Cambiar contraseña con código |

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
| `POST` | `/api/v1/group/:groupID/members` | Agregar miembros |
| `DELETE` | `/api/v1/group/:groupID/member` | Salir del grupo |
| `PATCH` | `/api/v1/group/:groupID/avatar` | Actualizar avatar del grupo |
| `POST` | `/api/v1/group/:groupID/message` | Enviar mensaje al grupo |
| `GET` | `/api/v1/group/:groupID/message` | Obtener mensajes del grupo (paginados) |
| `PUT` | `/api/v1/group/:groupID/message` | Editar mensaje del grupo |
| `DELETE` | `/api/v1/group/:groupID/message` | Eliminar mensaje del grupo |

### Media — `/api/v1/` (requiere JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Subir archivo a MinIO → devuelve URL pública |

### Público

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/bug-report` | Reportar bug → crea Issue en GitHub |

### WebSocket

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/ws` | Conectar WebSocket (requiere cookie JWT) |

---

## 🔌 Eventos WebSocket

### Cliente → Servidor

| Tipo | Payload | Descripción |
|------|---------|-------------|
| `ping` | — | Keepalive |
| `chat` | `MessageGet` | Enviar mensaje 1:1 |
| `read` | `{from}` | Marcar mensajes de `from` como vistos |
| `typing` | `{to}` | Indicador de escritura |
| `edit_message` | `{messageId, receptor, message}` | Editar mensaje |
| `delete_message` | `{messageId, receptor}` | Eliminar mensaje para todos |
| `call_offer` | `{to, roomId, callType}` | Iniciar llamada |
| `call_accept` | `{to, roomId}` | Aceptar llamada |
| `call_reject` | `{to, roomId}` | Rechazar llamada |
| `call_end` | `{to, roomId}` | Terminar llamada |
| `group_chat` | `GroupMessageSend` | Enviar mensaje grupal |
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
| `error` | `{error}` | Mensaje de error |

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

---

## 🌐 Variables de Entorno

Crea un `.env` en la raíz del proyecto:

```env
# Base de datos
POSTGRES_USER=usuario
POSTGRES_PASSWORD=contraseña
POSTGRES_DB=chatdb
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# Redis
REDIS_ADDR=localhost:6379
REDIS_PASSWORD=

# JWT
SECRETKEY=clave_super_secreta_muy_larga

# Email (Gmail SMTP)
GMAIL=tu@gmail.com
GMAIL_PASSWORD=app_password_de_google

# MinIO (Object Storage)
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=media
MINIO_PUBLIC_URL=http://localhost:9000

# ZegoCloud (videollamadas)
ZEGO_APP_ID=tu_app_id
ZEGO_SERVER_SECRET=tu_secret

# Bug reporting (opcional)
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=tu_usuario
GITHUB_REPO=tu_repositorio

# Cloudflare Tunnel (opcional)
CLOUDFLARE_TUNNEL_TOKEN=tu_tunnel_token
```

---

## 📚 Documentación

| Documento | Descripción |
|-----------|-------------|
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
- Autenticación stateless con **JWT** (access + refresh)
- Bloqueo automático de cuenta tras 5 intentos fallidos
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
