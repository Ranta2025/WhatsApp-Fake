# Sistema de Reportes de Bugs 🐛

## Descripción

Este proyecto incluye un sistema de reportes de bugs que permite a los usuarios reportar problemas directamente desde la aplicación, los cuales se crean automáticamente como Issues en GitHub.

## Configuración

### 1. Crear un Personal Access Token de GitHub

1. Ve a GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click en "Generate new token (classic)"
3. Dale un nombre descriptivo (ej: "ChatApp Bug Reports")
4. Selecciona los siguientes permisos:
   - `repo` (acceso completo a repositorios) o solo `public_repo` si tu repo es público
5. Click en "Generate token"
6. **IMPORTANTE**: Copia el token inmediatamente (no podrás verlo de nuevo)

### 2. Configurar Variables de Entorno

Agrega las siguientes variables a tu archivo `.env` en la raíz del proyecto:

```env
# GitHub Configuration para Bug Reports
GITHUB_TOKEN=ghp_tu_token_aqui
GITHUB_OWNER=tu-usuario-github
GITHUB_REPO=nombre-del-repositorio
```

**Ejemplo:**
```env
GITHUB_TOKEN=ghp_abc123XYZ456...
GITHUB_OWNER=johndoe
GITHUB_REPO=chatapp
```

### 3. Frontend - Configurar URL de la API (Opcional)

Si tu backend no está en `http://localhost:8080`, crea o edita el archivo `frontend/.env`:

```env
VITE_API_URL=http://tu-servidor:puerto
```

## Uso

### Para Usuarios

1. En la página de inicio, haz clic en el botón "Reportar Bug" 🐛 en el navbar
2. Completa el formulario con:
   - **Título**: Descripción breve del bug
   - **Descripción**: Explicación detallada del problema
   - **Pasos para Reproducir** (opcional): Cómo recrear el bug
   - **Comportamiento Esperado** (opcional): Qué debería pasar
   - **Comportamiento Actual** (opcional): Qué está pasando
   - **Email** (opcional): Por si se necesita más información
3. Haz clic en "Enviar Reporte"

La información del navegador, sistema operativo y resolución de pantalla se envía automáticamente.

### Para Desarrolladores

Los reportes aparecerán como Issues en tu repositorio de GitHub con:
- Labels automáticos: `bug`, `user-reported`
- Formato Markdown organizado por secciones
- Información del sistema del usuario
- Timestamp del reporte

## API Endpoint

### POST `/api/v1/bug-report`

Endpoint público (no requiere autenticación) para crear reportes de bugs.

**Request Body:**
```json
{
  "title": "El botón de login no funciona",
  "description": "Cuando intento hacer login, el botón no responde",
  "steps": "1. Ir a /login\n2. Ingresar credenciales\n3. Click en Enviar",
  "expected": "Debería iniciar sesión",
  "actual": "No pasa nada",
  "user_email": "usuario@example.com",
  "browser": "Chrome",
  "os": "Windows",
  "screen_size": "1920x1080"
}
```

**Response Success (201):**
```json
{
  "success": true,
  "message": "Bug reportado exitosamente. ¡Gracias por tu ayuda!"
}
```

**Response Error (400/500):**
```json
{
  "error": "Descripción del error",
  "message": "Detalles adicionales"
}
```

## Estructura de Archivos

```
backend/
├── models/
│   └── bugReport.go           # Modelos de datos
├── services/
│   └── servicesBugReport.go   # Lógica de negocio y API de GitHub
└── handlers/
    └── handlerBugReport.go    # Controlador HTTP

frontend/
└── src/
    └── components/
        └── BugReportModal.jsx # Componente del modal de reporte
```

## Seguridad

⚠️ **IMPORTANTE**: 
- **NUNCA** subas tu archivo `.env` a Git
- El `.env` ya está en `.gitignore`
- Mantén tu token de GitHub seguro y privado
- Si accidentalmente expones tu token, revócalo inmediatamente en GitHub y genera uno nuevo

## Solución de Problemas

### Error: "GitHub configuration is missing"
- Verifica que las variables `GITHUB_TOKEN`, `GITHUB_OWNER` y `GITHUB_REPO` estén en tu `.env`
- Asegúrate de reiniciar el servidor backend después de agregar las variables

### Error: "GitHub API error (status 401)"
- Tu token puede ser inválido o haber expirado
- Genera un nuevo token y actualiza el `.env`

### Error: "GitHub API error (status 404)"
- Verifica que `GITHUB_OWNER` y `GITHUB_REPO` sean correctos
- Asegúrate de que el token tenga permisos sobre ese repositorio

### Los reportes no llegan
- Verifica la consola del navegador para ver errores
- Verifica los logs del backend
- Asegúrate de que CORS esté configurado correctamente

## Ejemplo de Issue Creado

```markdown
## 🐛 Descripción del Bug

El botón de login no responde cuando se hace clic

## 📋 Pasos para Reproducir

1. Ir a /login
2. Ingresar credenciales válidas
3. Hacer clic en el botón "Enviar"

## ✅ Comportamiento Esperado

Debería iniciar sesión y redirigir al dashboard

## ❌ Comportamiento Actual

El botón no hace nada, no hay respuesta visual

## 💻 Información del Sistema

- **Navegador:** Chrome
- **Sistema Operativo:** Windows
- **Resolución de Pantalla:** 1920x1080

---

📧 **Reportado por:** usuario@example.com

🕐 **Fecha del reporte:** 2026-02-15 14:30:00
```

## Extensiones Futuras

Posibles mejoras al sistema:
- [ ] Adjuntar capturas de pantalla
- [ ] Capturar logs de consola automáticamente
- [ ] Categorizar bugs por tipo (UI, funcionalidad, performance, etc.)
- [ ] Sistema de votación para bugs frecuentes
- [ ] Panel de administración para gestionar reportes
- [ ] Notificaciones por email al equipo cuando llega un reporte
- [ ] Integración con Discord/Slack para alertas en tiempo real
