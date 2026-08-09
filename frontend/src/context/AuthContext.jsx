import { createContext, useState, useContext, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Intentar restaurar sesión desde cookie HttpOnly al cargar
    useEffect(() => {
        const init = async () => {

            try {
                const { data } = await api.get('/api/v1/user');
                setUser({ 
                    username: data.username || data.Telephon || '',
                    telephon: data.Telephon,
                    avatar: data.avatar_url
                });
            } catch {
                // No hay sesión válida — usuario no autenticado
                setUser(null);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []); // Run once on mount

    const login = async (username, password) => {
        try {
            await api.post('/LogIn', { username, password });
            // La cookie HttpOnly se setió automáticamente por el servidor
            const { data } = await api.get('/api/v1/user');
            setUser({ 
                username: data.username || username,
                telephon: data.Telephon,
                avatar: data.avatar_url
            });
            return true;
        } catch (error) {
            console.error("Login error:", error);
            throw error;
        }
    };

    const logout = async () => {
        try {
            await api.post('/logout');
        } catch (error) {
            console.error("Logout error:", error);
        } finally {
            // El servidor ya limpió las cookies HttpOnly
            setUser(null);
        }
    };

    const updateUsername = (username) => {
        setUser((prev) => (prev ? { ...prev, username } : { username }));
    };


    // updateUsername moved above

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, updateUsername, setUser }}>
            {children}
        </AuthContext.Provider>
    );
};
