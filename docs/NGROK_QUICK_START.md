# 🚀 Inicio Rápido con Ngrok

¿Quieres que tus amigos prueben tu aplicación? ¡Usa ngrok!

## Pasos Rápidos:

1. **Obtén tu token de ngrok (gratis):**
   - Ve a https://ngrok.com y crea una cuenta
   - Copia tu token de https://dashboard.ngrok.com/get-started/your-authtoken
   - Agrégalo al archivo `.env` en la raíz:
     ```env
     NGROK_AUTHTOKEN=tu_token_aqui
     ```

2. **Inicia la aplicación:**
   ```bash
   cd docker
   docker-compose up -d
   ```

3. **Configura ngrok automáticamente:**
   ```powershell
   # Windows
   .\scripts\setup-ngrok.ps1
   ```
   ```bash
   # Linux/Mac
   ./scripts/setup-ngrok.sh
   ```

4. **¡Comparte la URL!** El script te mostrará la URL para compartir.

## Ver las URLs:

- **Interfaz web:** http://localhost:4040
- **Script PowerShell:** `.\scripts\get-ngrok-urls.ps1`
- **Script Bash:** `./scripts/get-ngrok-urls.sh`

## Documentación Completa:

📖 [Guía de Ngrok](docs/NGROK_GUIDE.md) - Instrucciones detalladas, troubleshooting y más

---

**Nota:** Cada vez que reinicies ngrok las URLs cambian (limitación de la cuenta gratuita). Vuelve a ejecutar `scripts/setup-ngrok.ps1` para reconfigurar.
