# Script PowerShell para mostrar la URL pública de Cloudflare Tunnel

Write-Host "🔍 Obteniendo URL de Cloudflare Tunnel..." -ForegroundColor Cyan
Write-Host ""

# Verificar si cloudflared está corriendo
$cfRunning = docker ps --filter "name=cloudflared" --format "{{.Names}}"

if (-not $cfRunning) {
    Write-Host "❌ El contenedor de cloudflared no está corriendo" -ForegroundColor Red
    Write-Host "Inicia tu aplicación con: docker compose -f docker/compose.yml up -d" -ForegroundColor Yellow
    exit 1
}

# Extraer la URL de los logs
$logs = docker logs cloudflared 2>&1
$match = ($logs | Select-String -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com') | Select-Object -Last 1

if (-not $match) {
    Write-Host "❌ No se encontró la URL. Espera unos segundos y vuelve a intentarlo." -ForegroundColor Red
    Write-Host "Verifica los logs: docker logs cloudflared" -ForegroundColor Yellow
    exit 1
}

$publicUrl = $match.Matches[0].Value

Write-Host "✅ URL pública de Cloudflare Tunnel:" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""
Write-Host "   $publicUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""
Write-Host "💡 Comparte esta URL con tus amigos" -ForegroundColor Green
Write-Host ""
