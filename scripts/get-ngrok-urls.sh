#!/bin/bash

# Script para mostrar las URLs públicas de ngrok

echo "🔍 Obteniendo URLs de ngrok..."
echo ""

# Verificar si ngrok está corriendo
if ! docker ps | grep -q ngrok; then
    echo "❌ El contenedor de ngrok no está corriendo"
    echo "Inicia tu aplicación con: cd docker && docker-compose up -d"
    exit 1
fi

# Esperar un momento para que ngrok se inicialice
sleep 2

# Obtener las URLs de la API de ngrok
TUNNELS=$(curl -s http://localhost:4040/api/tunnels)

if [ -z "$TUNNELS" ]; then
    echo "❌ No se pudo conectar con ngrok"
    echo "Verifica los logs: docker logs ngrok"
    exit 1
fi

echo "✅ URLs públicas de ngrok:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Extraer y mostrar las URLs
echo "$TUNNELS" | jq -r '.tunnels[] | "📍 \(.name | ascii_upcase)\n   URL: \(.public_url)\n   Destino: \(.config.addr)\n"'

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Interfaz web de ngrok: http://localhost:4040"
echo ""
echo "💡 Comparte la URL del FRONTEND con tus amigos"
echo ""
