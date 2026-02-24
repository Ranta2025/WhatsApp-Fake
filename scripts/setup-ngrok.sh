#!/bin/bash

# Script para obtener la URL pública de Cloudflare Tunnel

echo "🔧 Obteniendo URL de Cloudflare Tunnel"
echo ""

# Verificar si cloudflared está corriendo
if ! docker ps | grep -q cloudflared; then
    echo "❌ El contenedor de cloudflared no está corriendo"
    echo "Inicia tu aplicación con: docker compose -f docker/compose.yml up -d"
    exit 1
fi

# Esperar a que cloudflared establezca el túnel
echo "⏳ Esperando a que Cloudflare Tunnel se inicialice..."
sleep 5

# Extraer la URL de los logs (cloudflared la imprime en stderr)
publicUrl=$(docker logs cloudflared 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1)

if [ -z "$publicUrl" ]; then
    echo "❌ No se encontró la URL de Cloudflare Tunnel"
    echo "Verifica los logs: docker logs cloudflared"
    exit 1
fi

echo "✅ Cloudflare Tunnel está funcionando correctamente!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Comparte esta URL con tus amigos:"
echo ""
echo "   $publicUrl"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Información importante:"
echo "   • La URL cambia cada vez que reinicias los contenedores"
echo "   • No requiere cuenta ni token de Cloudflare"
echo ""
echo "🔧 Arquitectura:"
echo "   Internet → Cloudflare Tunnel → Nginx → Frontend (React) + Backend (Go API)"
echo "   Todo está en el mismo dominio, Nginx maneja el routing"
echo ""
