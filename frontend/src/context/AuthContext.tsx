import {
    createContext, useState, useContext, useEffect, useCallback, useMemo,
    type ReactNode, type Dispatch, type SetStateAction,
} from 'react';
import api, { SESSION_EXPIRED_EVENT } from '../api/axios';
import type { UserGet, UserLoginRequest } from '../types/api';
import { toUser, type AuthUser } from './authUser';

export type { AuthUser } from './authUser';

export interface AuthContextValue {
    user: AuthUser | null;
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => Promise<void>;
    loading: boolean;
    updateUsername: (username: string) => void;
    setUser: Dispatch<SetStateAction<AuthUser | null>>;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    // Restaurar la sesión desde la cookie HttpOnly al cargar
    useEffect(() => {
        let cancelled = false;
        api.get<UserGet>('/api/v1/user')
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
        const { data } = await api.get<UserGet>('/api/v1/user');
        setUser(toUser(data));
    }, []);

    const login = useCallback(async (username: string, password: string): Promise<boolean> => {
        const body: UserLoginRequest = { username, password };
        await api.post('/api/v1/auth/login', body);
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

    const updateUsername = useCallback((username: string) => {
        setUser((prev) => (prev ? { ...prev, username } : prev));
    }, []);

    const value = useMemo<AuthContextValue>(
        () => ({ user, login, logout, loading, updateUsername, setUser, refreshUser }),
        [user, login, logout, loading, updateUsername, refreshUser]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
