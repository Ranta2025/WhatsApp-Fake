# =============================================================
# Script: send-url-whatsapp.ps1
# Obtiene la URL del tunel de Cloudflare y la envia por Telegram
# =============================================================

$BOT_TOKEN = "7858041417:AAEOyjLKbPjc7T-pE6DyvBumCgyPTNj0MqE"
$CHAT_ID   = "6022824638"

# 1. Verificar que cloudflared esta corriendo
$cfRunning = docker ps --filter "name=cloudflared" --format "{{.Names}}"

if (-not $cfRunning) {
    Write-Host "cloudflared no esta corriendo." -ForegroundColor Red
    Write-Host "Inicia con: docker compose -f docker/compose.yml up -d" -ForegroundColor Yellow
    exit 1
}

# 2. Extraer la URL publica de los logs
Write-Host "Buscando URL de Cloudflare Tunnel..." -ForegroundColor Yellow

$publicUrl = $null
$intentos  = 0

while (-not $publicUrl -and $intentos -lt 10) {
    Start-Sleep -Seconds 3
    $logs  = docker logs cloudflared 2>&1
    $match = ($logs | Select-String -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com') | Select-Object -Last 1
    if ($match) {
        $publicUrl = $match.Matches[0].Value
    }
    $intentos++
}

if (-not $publicUrl) {
    Write-Host "No se encontro la URL. Revisa: docker logs cloudflared" -ForegroundColor Red
    exit 1
}

Write-Host "URL encontrada: $publicUrl" -ForegroundColor Green

# 3. Enviar mensaje por Telegram
$mensaje = "todos esta en linea!%0A%0AURL: $publicUrl%0A%0AComprtela con tus amigos."
$telegramUrl = "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${mensaje}"

try {
    $response = Invoke-WebRequest -Uri $telegramUrl -Method GET -UseBasicParsing
    $json = $response.Content | ConvertFrom-Json
    if ($json.ok) {
        Write-Host "Mensaje enviado a Telegram!" -ForegroundColor Green
    } else {
        Write-Host "Error de Telegram: $($json.description)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Error al enviar: $_" -ForegroundColor Red
}

# 4. Copiar al portapapeles y mostrar resumen
$publicUrl | Set-Clipboard

Write-Host ""
Write-Host "URL publica (copiada al portapapeles):" -ForegroundColor Cyan
Write-Host "   $publicUrl" -ForegroundColor Green
