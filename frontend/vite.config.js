import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Escuchar en todas las interfaces
    port: 5173,
    allowedHosts: [
      'localhost',
      '10.64.222.131',
      '.ngrok-free.dev',
      '.ngrok.io',
      '.ngrok.app',
    ],
    hmr: {
      timeout: 30000, // Aumentar timeout para conexiones lentas (ngrok)
      overlay: false, // Desactivar overlay de errores que puede causar recargas
    },
    watch: {
      usePolling: true, // A veces necesario en Windows/Docker
    },
  },
})
