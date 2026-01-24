import { createContext, useState, useEffect, useContext } from 'react';
import api from '../api/axios';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Aquí podrías verificar si el usuario ya tiene una sesión válida
        // Por ahora lo dejamos simple, asumiendo que el login establece el estado
        setLoading(false);
    }, []);

    const login = async (username, password) => {
        try {
            await api.post('/LogIn', { username, password });
            // Como tu backend usa cookies, no necesitamos guardar token en localStorage manualmente
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
            setUser(null);
        } catch (error) {
            console.error("Logout error:", error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
