#!/bin/bash

# Script para mostrar la URL pública de Cloudflare Tunnel

echo "🔍 Obteniendo URL de Cloudflare Tunnel..."
echo ""

# Verificar si cloudflared está corriendo
if ! docker ps | grep -q cloudflared; then
    echo "❌ El contenedor de cloudflared no está corriendo"
    echo "Inicia tu aplicación con: docker compose -f docker/compose.yml up -d"
    exit 1
fi

# Extraer la URL de los logs (cloudflared la imprime en stderr)
publicUrl=$(docker logs cloudflared 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1)

if [ -z "$publicUrl" ]; then
    echo "❌ No se encontró la URL. Espera unos segundos y vuelve a intentarlo."
    echo "Verifica los logs: docker logs cloudflared"
    exit 1
fi

echo "✅ URL pública de Cloudflare Tunnel:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "   $publicUrl"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Comparte esta URL con tus amigos"
echo ""
