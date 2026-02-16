# 💬 ChatApp - Real-time Messaging Platform

Una plataforma de mensajería instantánea moderna construida con **Go** y **React**, con WebSockets para comunicación en tiempo real.

<div align="center">

[![Go](https://img.shields.io/badge/Go-1.20+-00ADD8?style=for-the-badge&logo=go)](https://golang.org/)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=for-the-badge&logo=react)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-336791?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7+-DC382D?style=for-the-badge&logo=redis)](https://redis.io/)

</div>

---

## 🚀 Características

- 💬 **Chat en Tiempo Real** - Comunicación instantánea mediante WebSockets
- 🔒 **Autenticación Segura** - JWT tokens y contraseñas encriptadas con bcrypt
- 👥 **Gestión de Contactos** - Sistema de solicitudes y aceptación de contactos
- 🔔 **Notificaciones** - Estado online/offline en tiempo real
- 🐛 **Sistema de Reportes** - Los usuarios pueden reportar bugs directamente a GitHub Issues
- ⚡ **Alto Rendimiento** - Backend en Go con caché Redis
- 🎨 **UI Moderna** - Interfaz responsive con React y Tailwind CSS
- 🐳 **Dockerizado** - Fácil despliegue con Docker Compose
- 📡 **Ngrok Ready** - Comparte tu app con scripts automatizados

---

## 📋 Requisitos Previos

- [Go 1.20+](https://golang.org/dl/)
- [Node.js 18+](https://nodejs.org/)
- [Docker & Docker Compose](https://www.docker.com/)
- [PostgreSQL 15+](https://www.postgresql.org/) (o usar Docker)
- [Redis 7+](https://redis.io/) (o usar Docker)

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
