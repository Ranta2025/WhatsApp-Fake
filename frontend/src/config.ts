// Configuración central de URLs del backend.
//
// - VITE_API_URL (o el antiguo VITE_BACKEND_URL): URL base de la API.
//   Si no se define:
//     · en desarrollo → http(s)://<mismo host>:8080
//     · en producción → mismo origen (nginx / Vercel reenvían las rutas al backend)
// - VITE_WS_URL: URL base del WebSocket (p. ej. wss://mi-api.onrender.com).
//   Necesaria cuando el frontend se sirve desde un dominio que no puede
//   reenviar WebSockets (Vercel). Si no se define, se deriva de la API.

const trimSlash = (url: string): string => url.replace(/\/+$/, '');

const resolveApiBaseUrl = (): string => {
    const configured = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
    if (configured) return trimSlash(configured);
    if (import.meta.env.DEV) {
        return `${window.location.protocol}//${window.location.hostname}:8080`;
    }
    return window.location.origin;
};

export const API_BASE_URL = resolveApiBaseUrl();

const resolveWsBaseUrl = (): string => {
    const configured = import.meta.env.VITE_WS_URL;
    const base = configured ? trimSlash(configured) : API_BASE_URL;
    return base.replace(/^http/, 'ws');
};

export const WS_URL = `${resolveWsBaseUrl()}/api/v1/ws`;
