# Script para obtener la URL pública de Cloudflare Tunnel

Write-Host "🔧 Obteniendo URL de Cloudflare Tunnel" -ForegroundColor Cyan
Write-Host ""

# Verificar si cloudflared está corriendo
$cfRunning = docker ps --filter "name=cloudflared" --format "{{.Names}}"

if (-not $cfRunning) {
    Write-Host "❌ El contenedor de cloudflared no está corriendo" -ForegroundColor Red
    Write-Host "Inicia tu aplicación con: docker compose -f docker/compose.yml up -d" -ForegroundColor Yellow
    exit 1
}

# Esperar a que cloudflared establezca el túnel
Write-Host "⏳ Esperando a que Cloudflare Tunnel se inicialice..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Extraer la URL de los logs del contenedor (cloudflared la imprime en stderr)
$logs = docker logs cloudflared 2>&1
$match = ($logs | Select-String -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com') | Select-Object -Last 1

if (-not $match) {
    Write-Host "❌ No se encontró la URL de Cloudflare Tunnel" -ForegroundColor Red
    Write-Host "Verifica los logs: docker logs cloudflared" -ForegroundColor Yellow
    exit 1
}

$publicUrl = $match.Matches[0].Value

Write-Host "✅ Cloudflare Tunnel está funcionando correctamente!" -ForegroundColor Green
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""
Write-Host "🌐 Comparte esta URL con tus amigos:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   $publicUrl" -ForegroundColor Green -BackgroundColor Black
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""
Write-Host "💡 Información importante:" -ForegroundColor Cyan
Write-Host "   • La URL cambia cada vez que reinicias los contenedores" -ForegroundColor Gray
Write-Host "   • No requiere cuenta ni token de Cloudflare" -ForegroundColor Gray
Write-Host ""
Write-Host "🔧 Arquitectura:" -ForegroundColor Cyan
Write-Host "   Internet → Cloudflare Tunnel → Nginx → Frontend (React) + Backend (Go API)" -ForegroundColor Gray
Write-Host "   Todo está en el mismo dominio, Nginx maneja el routing" -ForegroundColor Gray
Write-Host ""
