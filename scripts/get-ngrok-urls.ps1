# Script PowerShell para mostrar las URLs públicas de ngrok

Write-Host "🔍 Obteniendo URLs de ngrok..." -ForegroundColor Cyan
Write-Host ""

# Verificar si ngrok está corriendo
$ngrokRunning = docker ps --filter "name=ngrok" --format "{{.Names}}"

if (-not $ngrokRunning) {
    Write-Host "❌ El contenedor de ngrok no está corriendo" -ForegroundColor Red
    Write-Host "Inicia tu aplicación con: cd docker; docker-compose up -d" -ForegroundColor Yellow
    exit 1
}

# Esperar un momento para que ngrok se inicialice
Start-Sleep -Seconds 2

# Obtener las URLs de la API de ngrok
try {
    $response = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -Method Get
    
    Write-Host "✅ URLs públicas de ngrok:" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host ""
    
    foreach ($tunnel in $response.tunnels) {
        $name = $tunnel.name.ToUpper()
        $url = $tunnel.public_url
        $dest = $tunnel.config.addr
        
        Write-Host "📍 $name" -ForegroundColor Yellow
        Write-Host "   URL: " -NoNewline
        Write-Host "$url" -ForegroundColor Cyan
        Write-Host "   Destino: $dest" -ForegroundColor DarkGray
        Write-Host ""
    }
    
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host ""
    Write-Host "🌐 Interfaz web de ngrok: " -NoNewline
    Write-Host "http://localhost:4040" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "💡 Comparte la URL del FRONTEND con tus amigos" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host "❌ No se pudo conectar con ngrok" -ForegroundColor Red
    Write-Host "Verifica los logs: docker logs ngrok" -ForegroundColor Yellow
    exit 1
}
