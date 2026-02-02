import axios from 'axios';

// Usar el hostname actual del navegador (ya sea localhost, 10.33.225.131, etc)
const apiPort = '8080';
const baseURL = `http://${window.location.hostname}:${apiPort}`;

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
