import axios from 'axios';

const envUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_URL : undefined;
const resolvedBaseURL =
    (envUrl && envUrl.trim() !== '' ? envUrl : undefined)
    ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080');

const api = axios.create({
    baseURL: resolvedBaseURL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

export default api;
