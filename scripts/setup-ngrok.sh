#!/bin/bash

# Script para obtener la URL pública de ngrok

echo "🔧 Obteniendo URL de ngrok"
echo ""

# Verificar si ngrok está corriendo
if ! docker ps | grep -q ngrok; then
    echo "❌ El contenedor de ngrok no está corriendo"
    echo "Inicia tu aplicación con: cd docker && docker-compose up -d"
    exit 1
fi

# Esperar un momento para que ngrok se inicialice
echo "⏳ Esperando a que ngrok se inicialice..."
sleep 3

# Obtener las URLs de la API de ngrok
response=$(curl -s http://localhost:4040/api/tunnels)

if [ -z "$response" ]; then
    echo "❌ No se pudo conectar con ngrok"
    echo "Verifica los logs: docker logs ngrok"
    exit 1
fi

# Extraer URL HTTPS usando jq
publicUrl=$(echo "$response" | jq -r '.tunnels[] | select(.proto=="https") | .public_url' | head -n 1)

if [ -z "$publicUrl" ]; then
    echo "❌ No se encontró la URL de ngrok"
    echo "Verifica los logs: docker logs ngrok"
    exit 1
fi

echo "✅ ngrok está funcionando correctamente!"
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
echo "   • La primera vez verán una pantalla de advertencia de ngrok"
echo "   • Deben dar click en 'Visit Site' para continuar"
echo "   • Ver estado en tiempo real: http://localhost:4040"
echo ""
echo "🔧 Arquitectura:"
echo "   Internet → ngrok → Nginx → Frontend (React) + Backend (Go API)"
echo "   Todo está en el mismo dominio, Nginx maneja el routing"
echo ""
