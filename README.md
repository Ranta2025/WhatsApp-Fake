# 💬 ChatApp - Real-time Messaging Platform

Una plataforma de mensajería instantánea completa construida con **Go** y **React**, con WebSockets, videollamadas, compartición de archivos multimedia y fotos de perfil.

<div align="center">

[![Go](https://img.shields.io/badge/Go-1.20+-00ADD8?style=for-the-badge&logo=go)](https://golang.org/)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=for-the-badge&logo=react)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-336791?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7+-DC382D?style=for-the-badge&logo=redis)](https://redis.io/)
[![MinIO](https://img.shields.io/badge/MinIO-Object_Storage-C72C48?style=for-the-badge&logo=minio)](https://min.io/)

</div>

---

## 🚀 Características

### Mensajería
- 💬 **Chat en Tiempo Real** — Mensajes instantáneos por WebSocket
- 📎 **Multimedia** — Envío de imágenes, audio, vídeo y documentos (almacenados en MinIO)
- 🎙️ **Notas de voz** — Grabación y reproducción con velocidad variable (0.5×–2×)
- ✏️ **Editar / Eliminar mensajes** — Con sincronización en tiempo real para ambos usuarios
- 💬 **Responder mensajes** — Citas de mensajes previos
- 🗑️ **Borrar chat / Eliminar para mí** — Control individual del historial
- 📖 **Estados de mensaje** — Enviado → Entregado → Visto

### Videollamadas
- 📹 **Llamadas de voz y vídeo** — Integrado con **ZegoCloud**, generación de tokens seguros
- 📋 **Historial de llamadas** — Registro con duración, tipo y estado
- 🗑️ **Eliminar registros de llamadas** — Apenas para el usuario solicitante

### Usuarios y Contactos
- 🖼️ **Fotos de perfil** — Subida a MinIO, propagación instantánea a todos los contactos por WebSocket
- 🔒 **Autenticación** — JWT, bcrypt, bloqueo por intentos fallidos
- 📧 **Verificación por email** — Código de activación y recuperación de contraseña
- 👥 **Gestión de contactos** — Agregar, nombrar, listar; nombres personalizados por contacto
- 🟢 **Presencia** — Estado online/offline y hora de última conexión en tiempo real

### Infraestructura
- ⚡ **Alto rendimiento** — Backend en Go con caché Redis
- 🗄️ **PostgreSQL + GORM** — Persistencia con migraciones automáticas
- 📦 **MinIO** — Object storage S3-compatible para todos los archivos
- 🐳 **Docker Compose** — Un comando para levantar toda la infraestructura
- 🐛 **Bug reporting** — Los usuarios pueden reportar bugs como GitHub Issues desde la app
- 📡 **Ngrok / Cloudflare Tunnel** — Scripts para exponer la app en desarrollo

---

## 📋 Requisitos Previos

- [Go 1.20+](https://golang.org/dl/)
- [Node.js 18+](https://nodejs.org/)
- [Docker & Docker Compose](https://www.docker.com/)

> Con Docker no necesitas instalar PostgreSQL, Redis ni MinIO localmente.

---

## 🛠️ Instalación

### 1. Clonar el Repositorio

```bash
git clone <tu-repositorio>
cd <nombre-proyecto>
```

### 2. Configurar Variables de Entorno

Crea un archivo `.env` en la raíz con las variables listadas en la sección [Variables de Entorno](#-variables-de-entorno).

### 3. Opción A: Docker (Recomendado)

```bash
cd docker
docker-compose up -d
```

Esto levanta **PostgreSQL**, **Redis**, **MinIO** y el **backend** en un solo comando.

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

### Compartir con Ngrok

```bash
# Windows
./scripts/setup-ngrok.ps1
./scripts/get-ngrok-urls.ps1

# Linux/Mac
./scripts/setup-ngrok.sh
./scripts/get-ngrok-urls.sh
```

Ver guía completa: [docs/NGROK_GUIDE.md](docs/NGROK_GUIDE.md)

---

## 📁 Estructura del Proyecto

```
├── backend/
│   ├── cache/           # Caché Redis (contraseñas, códigos, intentos)
│   ├── config/          # CORS
│   ├── database/        # Conexiones PostgreSQL, Redis, MinIO
│   ├── handlers/        # Controladores HTTP (User, Contact, Chat, Call, Media, BugReport)
│   ├── middleware/      # Validación de inputs y JWT
│   ├── models/          # Structs de dominio (User, Message, Contact, CallLog, BugReport)
│   ├── repos/           # Acceso a BD (userData, contactData, callData)
│   ├── routers/         # Registro de rutas (auth, api/v1)
│   ├── schemas/         # DTOs de respuesta (UserGet, Message, ChatGroup)
│   ├── services/        # Lógica de negocio
│   ├── utils/           # JWT, bcrypt, validaciones, email, código aleatorio
│   └── websocket/       # Hub, Client, message handlers
│
├── frontend/
│   └── src/
│       ├── api/         # Cliente HTTP y WebSocket
│       ├── components/  # Componentes reutilizables
│       ├── context/     # Context API
│       ├── hooks/       # Custom hooks
│       └── pages/       # Dashboard y resto de páginas
│
├── docker/              # Dockerfile, docker-compose, nginx.conf
├── docs/                # Documentación técnica
├── scripts/             # Automatización ngrok / cloudflare
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
| `GET` | `profile` | Obtener perfil propio |
| `PUT` | `profile` | Actualizar username |
| `PUT` | `profile/avatar` | Actualizar foto de perfil |

### Contactos — `/api/v1/` (requiere JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `contacts` | Listar contactos |
| `POST` | `contacts` | Agregar contacto |
| `PUT` | `contacts` | Actualizar nombre del contacto |
| `GET` | `search/:number` | Buscar usuario por número |

### Chat — `/api/v1/` (requiere JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `chat` | Crear mensaje (HTTP) |
| `GET` | `chat/:contact` | Obtener mensajes con un contacto |
| `PUT` | `chat/status/:contact` | Marcar mensajes como vistos |
| `PUT` | `chat/status-all` | Marcar todos los mensajes como entregados |
| `DELETE` | `chat/clear/:contact` | Borrar chat (para mí) |
| `PUT` | `chat/edit/:id` | Editar mensaje |
| `DELETE` | `chat/delete/:id` | Eliminar mensaje para mí |
| `GET` | `chats` | Listar todas las conversaciones |

### Llamadas — `/api/v1/` (requiere JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `call/token` | Obtener token ZegoCloud para llamada |
| `GET` | `call/history` | Historial de llamadas |
| `DELETE` | `call/history/:id` | Eliminar registro de llamada |

### Media — `/api/v1/` (requiere JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `upload` | Subir archivo a MinIO → devuelve URL pública |

### Público

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/bug-report` | Reportar bug → crea Issue en GitHub |

### WebSocket

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/ws` | Conectar WebSocket (requiere JWT en query param) |

---

## 🔌 Eventos WebSocket

### Cliente → Servidor

| Tipo | Payload | Descripción |
|------|---------|-------------|
| `chat` | `{receptor, message, mediaUrl?, mediaType?, replyTo?}` | Enviar mensaje |
| `read` | `{from}` | Marcar mensajes de `from` como vistos |
| `typing` | `{to, isTyping}` | Indicador de escritura |
| `edit_message` | `{messageId, newContent, receptor}` | Editar mensaje |
| `delete_message` | `{messageId, receptor}` | Eliminar mensaje para todos |
| `call_offer` | `{to, roomId, callType}` | Iniciar llamada |
| `call_accept` | `{to, roomId}` | Aceptar llamada |
| `call_reject` | `{to, roomId}` | Rechazar llamada |
| `call_end` | `{to, roomId, duration}` | Terminar llamada |
| `ping` | — | Keepalive |

### Servidor → Cliente

| Tipo | Payload | Descripción |
|------|---------|-------------|
| `chat` | Objeto `Message` | Mensaje nuevo / confirmación |
| `read` | `{from}` | Confirmación de mensajes vistos |
| `typing` | `{from, isTyping}` | Indicador de escritura |
| `edit_message` | Objeto `Message` | Mensaje editado |
| `delete_message` | Objeto `Message` | Mensaje eliminado |
| `online` | `{username, telephon}` | Contacto conectado |
| `offline` | `{username, telephon, last_seen}` | Contacto desconectado |
| `avatar_changed` | `{telephon, avatarUrl}` | Foto de perfil actualizada |
| `contact_request` | `{username, number, status}` | Nueva solicitud de contacto |
| `call_offer` | `{from, roomId, callType}` | Llamada entrante |
| `call_accept` | `{from, roomId}` | Llamada aceptada |
| `call_reject` | `{from, roomId}` | Llamada rechazada |
| `call_end` | `{from, roomId}` | Llamada terminada |
| `pong` | — | Respuesta a ping |

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

**Cobertura actual:**
- 78 tests unitarios
- ~60% code coverage
- Tests de servicios, repositorios, utils y handlers

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

# Ngrok (opcional, para desarrollo)
NGROK_AUTHTOKEN=tu_token
```

---

## 📚 Documentación

| Documento | Descripción |
|-----------|-------------|
| [docs/WEBSOCKET_GUIDE.md](docs/WEBSOCKET_GUIDE.md) | Protocolo WebSocket detallado |
| [docs/BUG_REPORT_SYSTEM.md](docs/BUG_REPORT_SYSTEM.md) | Sistema de reportes a GitHub |
| [docs/NGROK_GUIDE.md](docs/NGROK_GUIDE.md) | Exponer la app con ngrok |
| [docs/TESTS_INSTRUCTIONS.md](docs/TESTS_INSTRUCTIONS.md) | Cómo ejecutar los tests |
| [docs/INDEX.md](docs/INDEX.md) | Índice completo |

---

## 🔐 Seguridad

- Contraseñas hasheadas con **bcrypt**
- Autenticación stateless con **JWT**
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
- [React 18](https://reactjs.org/) — UI library
- [Tailwind CSS](https://tailwindcss.com/) — Utility-first CSS

---

<div align="center">

**⭐ Si te gusta este proyecto, dale una estrella ⭐**

</div>


---

## 🛠️ Instalación

### 1. Clonar el Repositorio

```bash
git clone <tu-repositorio>
cd <nombre-proyecto>
```

### 2. Configurar Variables de Entorno

```bash
# Copiar el archivo de ejemplo
cp .env.example .env

# Editar con tu editor favorito
nano .env

# Configura al menos:
# - Credenciales de PostgreSQL y Redis
# - SECRETKEY para JWT (genera una clave segura)
# - GMAIL config para recuperación de contraseñas
```

### 3. Opción A: Usar Docker (Recomendado)

```bash
cd docker
docker-compose up -d
```

### 3. Opción B: Instalación Manual

**Backend:**
```bash
# Instalar dependencias de Go
go mod download

# Ejecutar el servidor
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

1. **Iniciar el Backend** (puerto 8080):
   ```bash
   go run main.go
   ```

2. **Iniciar el Frontend** (puerto 5173):
   ```bash
   cd frontend
   npm run dev
   ```

3. Acceder a `http://localhost:5173`

### Con Docker

```bash
cd docker
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener
docker-compose down
```

### Compartir con Ngrok

```bash
# Configurar (una sola vez)
./scripts/setup-ngrok.ps1    # Windows
./scripts/setup-ngrok.sh     # Linux/Mac

# Obtener URLs públicas
./scripts/get-ngrok-urls.ps1  # Windows
./scripts/get-ngrok-urls.sh   # Linux/Mac
```

Ver guía completa: [docs/NGROK_GUIDE.md](docs/NGROK_GUIDE.md)

---

## 📁 Estructura del Proyecto

```
├── backend/              # Backend en Go
│   ├── cache/           # Caché Redis
│   ├── config/          # Configuraciones (CORS, etc.)
│   ├── database/        # Conexiones a DB
│   ├── handlers/        # HTTP handlers
│   ├── middleware/      # Middlewares
│   ├── models/          # Modelos de datos
│   ├── repos/           # Repositorios (acceso a DB)
│   ├── routers/         # Rutas de la API
│   ├── schemas/         # Schemas de validación
│   ├── services/        # Lógica de negocio
│   ├── utils/           # Utilidades
│   └── websocket/       # WebSocket hub y clientes
│
├── frontend/            # Frontend en React
│   ├── src/
│   │   ├── api/        # Cliente HTTP y WebSocket
│   │   ├── components/ # Componentes React
│   │   ├── context/    # Context API
│   │   ├── hooks/      # Custom hooks
│   │   └── pages/      # Páginas
│   └── ...
│
├── docker/              # Configuración Docker
├── docs/                # Documentación
├── scripts/             # Scripts de automatización (ngrok)
├── tests/               # Tests de integración
├── main.go              # Entry point del backend
└── README.md            # Este archivo
```

---

## 🧪 Testing

El proyecto incluye tests unitarios extensivos:

```bash
# Ejecutar todos los tests
go test ./...

# Tests con coverage
go test -cover ./...

# Tests de un paquete específico
go test ./backend/utils/...

# Verbose
go test -v ./backend/handlers/...
```

**Estadísticas:**
- ✅ 78 tests unitarios
- ✅ ~60% code coverage
- ✅ Table-driven tests
- ✅ Tests de integración

Ver más: [docs/TESTS_INSTRUCTIONS.md](docs/TESTS_INSTRUCTIONS.md)

---

## 📚 Documentación

Toda la documentación está en la carpeta `docs/`:

| Documento | Descripción |
|-----------|-------------|
| [BUG_REPORT_SYSTEM.md](docs/BUG_REPORT_SYSTEM.md) | Sistema de reportes de bugs |
| [WEBSOCKET_GUIDE.md](docs/WEBSOCKET_GUIDE.md) | Guía de WebSockets |
| [NGROK_GUIDE.md](docs/NGROK_GUIDE.md) | Compartir tu app con ngrok |
| [TESTS_INSTRUCTIONS.md](docs/TESTS_INSTRUCTIONS.md) | Cómo ejecutar tests |
| [INDEX.md](docs/INDEX.md) | Índice completo de docs |

---

## 🔐 Seguridad

- ✅ Contraseñas hasheadas con **bcrypt**
- ✅ Autenticación con **JWT tokens**
- ✅ Validación de inputs
- ✅ CORS configurado
- ✅ Variables de entorno para secretos
- ✅ Tokens de recuperación con expiración

---

## 🐛 Reportar Bugs

Este proyecto incluye un sistema integrado de reportes de bugs. Los usuarios pueden reportar problemas directamente desde la aplicación, que se crean automáticamente como Issues en GitHub.

**Configuración:** Ver [docs/BUG_REPORT_SYSTEM.md](docs/BUG_REPORT_SYSTEM.md)

---

## 🛣️ API Endpoints

### Autenticación
- `POST /register` - Registrar usuario
- `POST /login` - Iniciar sesión
- `POST /logout` - Cerrar sesión
- `POST /recover` - Recuperar contraseña
- `POST /activate` - Activar cuenta

### Usuarios (requiere auth)
- `GET /api/v1/user` - Obtener perfil
- `PUT /api/v1/user` - Actualizar perfil

### Contactos (requiere auth)
- `GET /api/v1/contact` - Listar contactos
- `POST /api/v1/contact` - Enviar solicitud
- `PUT /api/v1/contact` - Aceptar/rechazar

### Chat (requiere auth)
- `GET /api/v1/chat/:contact` - Obtener mensajes
- `POST /api/v1/chat` - Enviar mensaje
- `PUT /api/v1/chat/:contact` - Marcar como leído

### WebSocket
- `GET /api/v1/ws` - Conectar al WebSocket

### Público
- `POST /api/v1/bug-report` - Reportar bug

---

## 🌐 Variables de Entorno

El proyecto requiere configurar variables de entorno en un archivo `.env` en la raíz del proyecto.

**Configuración rápida:**
```bash
# Copiar el archivo de ejemplo
cp .env.example .env

# Editar .env con tus valores reales
nano .env  # o usa tu editor favorito
```

**Variables requeridas:**
- Base de datos (PostgreSQL)
- Caché (Redis)
- JWT Secret Key
- Configuración de email (para recuperación de contraseñas)

**Variables opcionales:**
- Token de GitHub (para sistema de reportes de bugs)
- Token de Ngrok (para compartir tu app)

Ver [.env.example](.env.example) para la lista completa con descripciones.

---

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

## 📝 Licencia

Este proyecto es de código abierto, disponible bajo la licencia MIT.

---

## 👨‍💻 Autor

**Rafael Antonio Tanda Pretel**

- GitHub: [Ranta2025](https://github.com/Ranta2025)

---

## 🙏 Agradecimientos

- [Gin](https://github.com/gin-gonic/gin) - Framework web para Go
- [GORM](https://gorm.io/) - ORM para Go
- [React](https://reactjs.org/) - Librería de UI
- [Tailwind CSS](https://tailwindcss.com/) - Framework de CSS
- [Gorilla WebSocket](https://github.com/gorilla/websocket) - WebSockets en Go

---

<div align="center">

**⭐ Si te gusta este proyecto, dale una estrella en GitHub ⭐**

</div>
