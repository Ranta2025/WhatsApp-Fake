# Guía de Ngrok para Compartir tu Aplicación

## 🚀 Configuración Inicial

### 1. Obtener tu Token de Ngrok (GRATIS)

1. Ve a [https://ngrok.com](https://ngrok.com)
2. Crea una cuenta gratuita
3. Ve a [https://dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken)
4. Copia tu authtoken

### 2. Configurar el Token

Agrega tu token de ngrok al archivo `.env` en la raíz del proyecto:

```env
NGROK_AUTHTOKEN=tu_token_copiado_aqui
```

## 🎯 Iniciar la Aplicación con Ngrok

### Opción A: Configuración Automática (Recomendado) ⚡

1. **Obtén y configura tu token de ngrok en `.env`** (ver sección de arriba)

2. **Inicia Docker:**
   ```bash
   cd docker
   docker-compose up -d
   ```

3. **Ejecuta el script de configuración:**
   
   **Windows (PowerShell):**
   ```powershell
   .\scripts\setup-ngrok.ps1
   ```
   
   **Linux/Mac:**
   ```bash
   ./scripts/setup-ngrok.sh
   ```

4. **¡Listo!** El script te mostrará la URL para compartir con tus amigos.

---

### Opción B: Configuración Manual

### Paso 1: Iniciar Docker

Ejecuta Docker Compose normalmente:

```bash
cd docker
docker-compose up -d
```

Ngrok se iniciará automáticamente junto con los demás servicios.

### Paso 2: Obtener las URLs de Ngrok

Abre en tu navegador:
```
http://localhost:4040
```

Verás dos túneles:
- **frontend** - URL como `https://abc123.ngrok-free.app`
- **backend** - URL como `https://xyz456.ngrok-free.app`

### Paso 3: Configurar el Frontend

Copia la URL del **BACKEND** y configúrala en el frontend:

1. Ve a la carpeta `frontend/` 
2. Crea un archivo `.env` (si no existe) copiando `.env.example`:
   ```bash
   cd ../frontend
   cp .env.example .env
   ```
3. Edita el archivo `.env` y agrega la URL del backend:
   ```env
   VITE_BACKEND_URL=https://xyz456.ngrok-free.app
   ```
   ⚠️ **Importante**: NO incluyas la barra final `/`

### Paso 4: Reiniciar el Frontend

Para que el frontend cargue la nueva configuración:

```bash
cd ../docker
docker-compose restart frontend
```

Espera unos 10-15 segundos para que el frontend se reinicie.

### Paso 5: ¡Comparte con tus Amigos!

Ahora comparte la URL del **FRONTEND** (no del backend):
```
https://abc123.ngrok-free.app
```

Tus amigos:
1. Abrirán esa URL en su navegador
2. Verán una pantalla de advertencia de ngrok (dar click en "Visit Site")
3. ¡Podrán usar tu aplicación!

## 📡 Ver las URLs Públicas

Hay **3 formas** de ver las URLs que ngrok generó:

### Opción 1: Interfaz Web de Ngrok (Recomendado)
Abre en tu navegador:
```
http://localhost:4040
```

Ahí verás:
- **Frontend URL**: La URL para compartir a tus amigos (termina en `.ngrok-free.app`)
- **Backend URL**: La URL del API
- Todas las peticiones HTTP en tiempo real
- Estadísticas de tráfico

### Opción 2: Logs del Contenedor
```bash
docker logs ngrok
```

Busca líneas como:
```
started tunnel    url=https://xxxx-xx-xx-xx-xx.ngrok-free.app
```

### Opción 3: API de Ngrok
```bash
curl http://localhost:4040/api/tunnels
```

## 🌐 Compartir con tus Amigos

La URL que ngrok te da se ve algo así:
```
https://abc123.ngrok-free.app
```

**¡Comparte la URL del FRONTEND con tus amigos!**

- Ellos pueden abrir esa URL en cualquier navegador
- La primera vez verán una pantalla de advertencia de ngrok (solo dar click en "Visit Site")
- El frontend automáticamente se conectará al backend usando la URL de ngrok

## ⚡ Cómo Funciona

Tu configuración con ngrok:

```
┌─────────────────┐
│  Tus Amigos     │
└────────┬────────┘
         │
         │ https://abc123.ngrok-free.app (Frontend)
         │
    ╔════▼════════╗
    ║   NGROK     ║
    ╚════╦════════╝
         ║
         ╠══► Túnel 1: Frontend (Puerto 5173)
         ║           │
         ║           └──► El frontend carga en el navegador
         ║                y hace peticiones al túnel 2
         ║
         ╠══► Túnel 2: Backend (Puerto 8080)
         ║           │
         ║           ├──► PostgreSQL
         ║           ├──► Redis  
         ║           └──► WebSocket Hub
         ║
```

**Flujo de comunicación:**
1. Tu amigo accede a `https://abc123.ngrok-free.app` (frontend)
2. El navegador carga la aplicación React
3. El frontend lee `VITE_BACKEND_URL` y se conecta a `https://xyz456.ngrok-free.app` (backend)
4. Todas las peticiones API y WebSocket van al backend a través del túnel de ngrok
5. ¡Todo funciona como si fuera local!

## 🔧 Limitaciones de la Cuenta Gratuita

- ✅ URLs públicas funcionan perfectamente
- ✅ Múltiples túneles (Frontend + Backend)
- ✅ HTTPS incluido
- ⚠️ La URL cambia cada vez que reinicias ngrok
- ⚠️ Pantalla de advertencia la primera vez que alguien accede
- ⚠️ Límite de conexiones simultáneas

Para URLs permanentes, necesitas la versión de pago de ngrok.

## 🛑 Detener Ngrok

```bash
docker-compose down
```

O solo detener ngrok:
```bash
docker stop ngrok
```

## 🔍 Troubleshooting

### "Invalid authtoken"
- Verifica que copiaste correctamente el token en `.env`
- El token debe estar sin comillas

### "Tunnel not found"
- Espera unos segundos después de `docker-compose up`
- Revisa los logs: `docker logs ngrok`

### "Failed to connect to backend"
- **Verifica que configuraste `VITE_BACKEND_URL` en `frontend/.env`**
- Asegúrate de reiniciar el frontend después de editar `.env`
- Verifica que todos los contenedores estén corriendo: `docker ps`
- Revisa que el backend esté respondiendo: `curl http://localhost:8080`

### "Network Error" o peticiones fallan
- Abre `http://localhost:4040` y verifica que ambos túneles estén activos
- Comprueba que la URL en `frontend/.env` coincide con la URL del backend en ngrok
- Verifica los logs del backend: `docker logs gorm-app`

### CORS Errors
- El CORS ya está configurado para permitir orígenes de ngrok
- Si ves errores, verifica que estés usando HTTPS (no HTTP) en las URLs de ngrok
- Limpia la caché del navegador y vuelve a intentar

### WebSocket no conecta
- Asegúrate de que `VITE_BACKEND_URL` esté configurado correctamente
- Los WebSockets automáticamente usan WSS cuando el backend es HTTPS
- Verifica en las herramientas de desarrollo del navegador (pestaña Network → WS)

## 📝 Notas Importantes

1. **Seguridad**: Estás exponiendo tu aplicación a internet. Ten en cuenta:
   - No uses datos reales/sensibles en pruebas
   - Cierra ngrok cuando no lo uses
   - Considera agregar autenticación

2. **Performance**: 
   - Ngrok agrega latencia (~50-200ms)
   - Es perfecto para demos y pruebas
   - No es recomendado para producción

3. **Desarrollo**:
   - Los cambios en tu código se reflejan en tiempo real
   - Tus amigos verán los cambios al recargar la página

---

¿Necesitas ayuda? Revisa:
- [Documentación de Ngrok](https://ngrok.com/docs)
- [Dashboard de Ngrok](https://dashboard.ngrok.com)
