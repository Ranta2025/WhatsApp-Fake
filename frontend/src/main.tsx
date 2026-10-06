import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ThemeProvider } from './features/theme/ThemeProvider'
import { registerServiceWorker } from './utils/notifications'
// Eager import: beforeinstallprompt fires once and early, before the lazy dashboard chunk loads.
import './pwa/useInstallPrompt'

// Registrar Service Worker para notificaciones nativas
registerServiceWorker();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
