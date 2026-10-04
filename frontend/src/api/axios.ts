import axios from 'axios';
import { API_BASE_URL } from '../config';

// Aumenta la config de axios con la marca de reintento único que usa el
// interceptor de abajo (evita bucles de refresh infinitos).
declare module 'axios' {
    export interface InternalAxiosRequestConfig {
        _retry?: boolean;
    }
}

const baseURL = API_BASE_URL;

// Evento global que se emite cuando la sesión no se puede renovar.
export const SESSION_EXPIRED_EVENT = 'auth:session-expired';

// Sin Content-Type fijo: axios usa JSON para objetos y multipart (con su
// boundary) para FormData automáticamente.
const api = axios.create({
    baseURL,
    withCredentials: true,
});

// --- Response interceptor: auto-refresh en 401 (cookie-only) ---
interface QueuedRequest {
    resolve: () => void;
    reject: (reason: unknown) => void;
}

let isRefreshing = false;
let failedQueue: QueuedRequest[] = [];

const processQueue = (error: unknown): void => {
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
    async (error: unknown) => {
        if (!axios.isAxiosError(error)) {
            return Promise.reject(error);
        }

        const originalRequest = error.config;

        // Si la respuesta es 401 y NO es la petición de refresh ni login
        if (
            error.response?.status === 401 &&
            originalRequest &&
            !originalRequest._retry &&
            !originalRequest.url?.includes('/auth/refresh') &&
            !originalRequest.url?.includes('/auth/login') &&
            !originalRequest.url?.includes('/auth/logout')
        ) {
            if (isRefreshing) {
                // Si ya se está refrescando, encolar la petición
                return new Promise<void>((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(() => api(originalRequest));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                // El refresh_token se envía automáticamente via cookie HttpOnly
                await axios.post(`${baseURL}/api/v1/auth/refresh`, {}, {
                    withCredentials: true,
                });

                // El servidor ya setió la nueva cookie HttpOnly con el access token
                processQueue(null);
                return api(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError);
                // La sesión expiró: avisar a la app (AuthContext cierra la sesión)
                window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

export default api;
