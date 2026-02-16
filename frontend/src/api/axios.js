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

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;
