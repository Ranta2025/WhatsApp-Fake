# 🐛 Sistema de Reportes de Bugs - Guía Rápida

## ¿Qué es esto?

Ahora tu aplicación tiene un sistema de reportes de bugs integrado que permite a tus amigos reportar problemas directamente desde la interfaz. Los reportes se crean automáticamente como **Issues en tu repositorio de GitHub**.

## Configuración Rápida (3 pasos)

### 1️⃣ Obtén un Token de GitHub

1. Ve a: https://github.com/settings/tokens
2. Click en **"Generate new token (classic)"**
3. Dale un nombre: `ChatApp Bug Reports`
4. Marca el permiso: **`repo`** (o `public_repo` si es público)
5. Click en **"Generate token"**
6. **¡Copia el token ahora!** (no podrás verlo después)

### 2️⃣ Configura las Variables de Entorno

Abre el archivo `.env` en la raíz del proyecto y completa:

```env
GITHUB_TOKEN=ghp_tu_token_aqui
GITHUB_OWNER=tu-usuario-github
GITHUB_REPO=nombre-del-repositorio
```

**Ejemplo:**
```env
GITHUB_TOKEN=ghp_abc123XYZ456def789...
GITHUB_OWNER=rafaelcabrera
GITHUB_REPO=chatapp
```

### 3️⃣ Reinicia tu Backend

```bash
# Detener el servidor si está corriendo (Ctrl+C)
# Luego iniciar de nuevo
go run main.go
```

¡Listo! 🎉

## Cómo funciona para tus amigos

1. Van a la página de inicio de tu app
2. Ven un botón **"Reportar Bug"** 🐛 en la parte superior
3. Completan un formulario con:
   - Título del bug
   - Descripción
   - Pasos para reproducir (opcional)
   - Información de contacto (opcional)
4. Click en "Enviar"

**Automáticamente:**
- Se crea un Issue en GitHub
- Se incluye toda la info del sistema (navegador, OS, resolución)
- Se etiqueta como `bug` y `user-reported`
- Recibe un timestamp

## Dónde ver los reportes

Los reportes aparecen en:
```
https://github.com/TU-USUARIO/TU-REPO/issues
```

Ejemplo de issue creado:
```markdown
## 🐛 Descripción del Bug
El botón de login no funciona

## 📋 Pasos para Reproducir
1. Ir a /login
2. Click en "Iniciar Sesión"
3. Nada pasa

## 💻 Información del Sistema
- Navegador: Chrome
- Sistema Operativo: Windows
- Resolución: 1920x1080

📧 Reportado por: amigo@email.com
🕐 Fecha: 2026-02-15 14:30:00
```

## Frontend

El botón de "Reportar Bug" ya está integrado en:
- [Welcome.jsx](frontend/src/pages/Welcome.jsx#L60) - Navbar

Para agregarlo a otras páginas:
```jsx
import BugReportModal from '../components/BugReportModal';

function MiPagina() {
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  
  return (
    <>
      <button onClick={() => setIsBugReportOpen(true)}>
        🐛 Reportar Bug
      </button>
      
      <BugReportModal 
        isOpen={isBugReportOpen}
        onClose={() => setIsBugReportOpen(false)}
      />
    </>
  );
}
```

## Solución de Problemas

### "GitHub configuration is missing"
- Verifica que las 3 variables estén en `.env`
- Reinicia el backend

### "GitHub API error (status 401)"
- Token inválido o expirado
- Genera uno nuevo

### "GitHub API error (status 404)"
- Verifica que `GITHUB_OWNER` y `GITHUB_REPO` sean correctos
- Verifica que el token tenga permisos sobre ese repo

## Documentación Completa

Para más detalles, ver: [docs/BUG_REPORT_SYSTEM.md](docs/BUG_REPORT_SYSTEM.md)

## Archivos Creados

```
📁 Backend
├── backend/models/bugReport.go          # Modelos de datos
├── backend/services/servicesBugReport.go # Lógica + GitHub API
└── backend/handlers/handlerBugReport.go  # HTTP handler

📁 Frontend
└── frontend/src/components/BugReportModal.jsx

📁 Docs
├── docs/BUG_REPORT_SYSTEM.md           # Documentación completa
└── README_BUG_REPORTS.md               # Este archivo

📁 Config
├── .env.example                         # Template de configuración
└── .env                                 # Tu configuración (actualizado)
```

## API Endpoint

```
POST /api/v1/bug-report
```

**No requiere autenticación** - Es un endpoint público para que cualquiera pueda reportar bugs.

---

¡Disfruta de tu nuevo sistema de reportes! 🚀
