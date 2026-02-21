import axios from 'axios';

// Usar variable de entorno para ngrok, o fallback a hostname actual
const getBaseURL = () => {
    // Si hay una URL del backend configurada (para ngrok), usarla
    if (import.meta.env.VITE_BACKEND_URL) {
        return import.meta.env.VITE_BACKEND_URL;
    }
    
    // Si estamos en producción/ngrok (mismo dominio para frontend y backend)
    // usar rutas relativas
    if (window.location.hostname.includes('ngrok')) {
        return window.location.origin;
    }
    
    // Fallback: desarrollo local - usar el hostname actual del navegador
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

// --- Request interceptor: agrega el access token ---
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// --- Response interceptor: auto-refresh en 401 ---
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(({ resolve, reject }) => {
        if (error) {
            reject(error);
        } else {
            resolve(token);
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
                }).then((token) => {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return api(originalRequest);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const { data } = await axios.post(`${baseURL}/refresh`, {}, {
                    withCredentials: true,
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem('token')}`,
                    },
                });

                const newToken = data.token;
                localStorage.setItem('token', newToken);
                originalRequest.headers.Authorization = `Bearer ${newToken}`;

                processQueue(null, newToken);
                return api(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                // Refresh falló: limpiar y redirigir a login
                localStorage.removeItem('token');
                window.location.href = '/';
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

export default api;
