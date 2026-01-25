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

    const updateUsername = (username) => {
        setUser((prev) => (prev ? { ...prev, username } : { username }));
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, updateUsername }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
