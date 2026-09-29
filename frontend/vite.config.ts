import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Separar dependencias grandes en chunks cacheables por el navegador
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          phone: ['react-phone-input-2', 'libphonenumber-js'],
        },
      },
    },
    // El SDK de videollamadas (ZegoCloud) es grande pero se carga bajo demanda
    chunkSizeWarningLimit: 6000,
  },
  server: {
    host: '0.0.0.0', // Escuchar en todas las interfaces
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/storage': {
        target: 'http://minio:9000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/storage/, ''),
      },
      '/api': {
        target: 'http://app:8080',
        changeOrigin: true,
      },
    },
    hmr: {
      // clientPort permite al browser conectar HMR a través de un proxy inverso.
      // Cuando está detrás de Cloudflare/nginx usamos el puerto externo (443);
      // si no hay env var, Vite usa el puerto real del servidor (5173) — correcto para dev local.
      clientPort: process.env.VITE_HMR_CLIENT_PORT ? parseInt(process.env.VITE_HMR_CLIENT_PORT) : undefined,
      timeout: 30000,
      overlay: false,
    },
    watch: {
      usePolling: true, // A veces necesario en Windows/Docker
    },
  },
})
