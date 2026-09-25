import { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import api, { SESSION_EXPIRED_EVENT } from '../api/axios';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

// El backend devuelve el perfil con claves Username / Telephon / avatar_url.
const toUser = (data) => ({
    username: data?.Username || '',
    telephon: data?.Telephon || '',
    avatar: data?.avatar_url || '',
});

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Restaurar la sesión desde la cookie HttpOnly al cargar
    useEffect(() => {
        let cancelled = false;
        api.get('/api/v1/user')
            .then(({ data }) => { if (!cancelled) setUser(toUser(data)); })
            .catch(() => { if (!cancelled) setUser(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    // Si la sesión no se puede renovar (refresh token caducado o revocado),
    // se cierra la sesión local para que PrivateRoute redirija al login.
    useEffect(() => {
        const onExpired = () => setUser(null);
        window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
        return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    }, []);

    // Recarga el perfil del usuario autenticado (tras login o activación)
    const refreshUser = useCallback(async () => {
        const { data } = await api.get('/api/v1/user');
        setUser(toUser(data));
    }, []);

    const login = useCallback(async (username, password) => {
        await api.post('/api/v1/auth/login', { username, password });
        // Las cookies HttpOnly las establece el servidor
        await refreshUser();
        return true;
    }, [refreshUser]);

    const logout = useCallback(async () => {
        try {
            await api.post('/api/v1/auth/logout');
        } catch {
            // Aunque falle la petición, se limpia la sesión local
        } finally {
            setUser(null);
        }
    }, []);

    const updateUsername = useCallback((username) => {
        setUser((prev) => (prev ? { ...prev, username } : prev));
    }, []);

    const value = useMemo(
        () => ({ user, login, logout, loading, updateUsername, setUser, refreshUser }),
        [user, login, logout, loading, updateUsername, refreshUser]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
