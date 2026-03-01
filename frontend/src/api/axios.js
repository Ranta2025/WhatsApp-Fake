import axios from 'axios';

// Usar variable de entorno para ngrok, o fallback a hostname actual
const getBaseURL = () => {
    // Si hay una URL del backend configurada (para ngrok), usarla
    if (import.meta.env.VITE_BACKEND_URL) {
        return import.meta.env.VITE_BACKEND_URL;
    }
    
    // Si estamos en producción/túnel público (ngrok o Cloudflare Tunnel)
    // usar rutas relativas — nginx maneja el routing
    if (window.location.hostname.includes('ngrok') ||
        window.location.hostname.includes('trycloudflare')) {
        return window.location.origin;
    }
    
    // Fallback: desarrollo local - usar el mismo hostname del navegador para mantener same-site cookies
    const apiPort = '8080';
    const protocol = window.location.protocol;
    return `${protocol}//${window.location.hostname}:${apiPort}`;
};

const baseURL = getBaseURL();
console.log('API BaseURL:', baseURL);

const api = axios.create({
    baseURL: baseURL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

// --- Response interceptor: auto-refresh en 401 (cookie-only) ---
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error) => {
    failedQueue.forEach(({ resolve, reject }) => {
        if (error) {
            reject(error);
        } else {
            resolve();
        }
    });
    failedQueue = [];
};

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Si la respuesta es 401 y NO es la petición de refresh ni login
        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !originalRequest.url?.includes('/refresh') &&
            !originalRequest.url?.includes('/LogIn')
        ) {
            if (isRefreshing) {
                // Si ya se está refrescando, encolar la petición
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(() => api(originalRequest));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                // El refresh_token se envía automáticamente via cookie HttpOnly
                await axios.post(`${baseURL}/refresh`, {}, {
                    withCredentials: true,
                });

                // El servidor ya setió la nueva cookie HttpOnly con el access token
                processQueue(null);
                return api(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError);
                // Refresh falló: dejar que el código llamante maneje el error
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

export default api;
