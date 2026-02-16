# Script para obtener la URL pública de ngrok

Write-Host "🔧 Obteniendo URL de ngrok" -ForegroundColor Cyan
Write-Host ""

# Verificar si ngrok está corriendo
$ngrokRunning = docker ps --filter "name=ngrok" --format "{{.Names}}"

if (-not $ngrokRunning) {
    Write-Host "❌ El contenedor de ngrok no está corriendo" -ForegroundColor Red
    Write-Host "Inicia tu aplicación con: cd docker; docker-compose up -d" -ForegroundColor Yellow
    exit 1
}

# Esperar un momento para que ngrok se inicialice
Write-Host "⏳ Esperando a que ngrok se inicialice..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Obtener las URLs de la API de ngrok
try {
    $response = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -Method Get
    
    # Encontrar la URL HTTPS
    $publicUrl = $null
    
    foreach ($tunnel in $response.tunnels) {
        if ($tunnel.proto -eq "https") {
            $publicUrl = $tunnel.public_url
            break
        }
    }
    
    if (-not $publicUrl) {
        Write-Host "❌ No se encontró la URL de ngrok" -ForegroundColor Red
        Write-Host "Verifica los logs: docker logs ngrok" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "✅ ngrok está funcionando correctamente!" -ForegroundColor Green
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
    Write-Host "   • La primera vez verán una pantalla de advertencia de ngrok" -ForegroundColor Gray
    Write-Host "   • Deben dar click en 'Visit Site' para continuar" -ForegroundColor Gray
    Write-Host "   • Ver estado en tiempo real: " -NoNewline -ForegroundColor Gray
    Write-Host "http://localhost:4040" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "🔧 Arquitectura:" -ForegroundColor Cyan
    Write-Host "   Internet → ngrok → Nginx → Frontend (React) + Backend (Go API)" -ForegroundColor Gray
    Write-Host "   Todo está en el mismo dominio, Nginx maneja el routing" -ForegroundColor Gray
    Write-Host ""
    
} catch {
    Write-Host "❌ Error al conectar con ngrok" -ForegroundColor Red
    Write-Host "Verifica los logs: docker logs ngrok" -ForegroundColor Yellow
    exit 1
}
