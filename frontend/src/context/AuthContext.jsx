import { createContext, useState, useContext } from 'react';
import api from '../api/axios';

const AuthContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading] = useState(false);

    const login = async (username, password) => {
        try {
            const { data } = await api.post('/LogIn', { username, password });
            console.log('[AUTH] Respuesta de login:', data);
            if (data?.token) {
                console.log('[AUTH] Guardando token en localStorage:', data.token);
                localStorage.setItem('token', data.token);
                console.log('[AUTH] Token guardado, verificando:', localStorage.getItem('token'));
            } else {
                console.warn('[AUTH] No se recibió token en la respuesta');
            }
            setUser({ username }); // Guardamos datos básicos del usuario
            return true;
        } catch (error) {
            console.error("Login error:", error);
            throw error;
        }
    };

    const logout = async () => {
        try {
            await api.post('/logout');
            localStorage.removeItem('token');
            setUser(null);
        } catch (error) {
            console.error("Logout error:", error);
        }
    };

    const updateUsername = (username) => {
        setUser((prev) => (prev ? { ...prev, username } : { username }));
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, updateUsername, setUser }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
