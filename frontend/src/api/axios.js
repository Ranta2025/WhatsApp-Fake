import axios from 'axios';

const api = axios.create({
    baseURL: '/',
    withCredentials: true, // Importante para enviar cookies de sesión
});

export default api;
