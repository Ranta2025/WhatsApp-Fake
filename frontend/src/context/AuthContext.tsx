import {
    createContext, useState, useContext, useEffect, useCallback, useMemo,
    type ReactNode, type Dispatch, type SetStateAction,
} from 'react';
import axios from 'axios';
import api, { SESSION_EXPIRED_EVENT } from '../api/axios';
import type { UserGet, UserLoginRequest } from '../types/api';
import { toUser, type AuthUser } from './authUser';
import { clearCachedUser, readCachedUser, writeCachedUser } from './sessionCache';
import { clearLocalPushSubscription, removePushSubscription } from '../utils/push';
import { PUSH_CLEANUP_TIMEOUT_MS, settleWithin } from './settleWithin';

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

/**
 * The session ended without `logout()` (expired / rejected): the server DELETE
 * would 401, so only the browser subscription is dropped (fire-and-forget) so a
 * shared browser stops receiving this user's pushes.
 */
const dropLocalPush = (): void => {
    Promise.resolve().then(clearLocalPushSubscription).catch((err: unknown) => {
        console.error('[Push] Error cancelando la suscripción tras el fin de sesión:', err);
    });
};

/**
 * The request never got an HTTP response (offline, DNS, server unreachable).
 * Any real response (401, 403, 5xx) is an answer from the server, not a network failure.
 */
const isNetworkFailure = (err: unknown): boolean => {
    if (axios.isAxiosError(err)) return err.response === undefined;
    return typeof navigator !== 'undefined' && navigator.onLine === false;
};

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
    // Session restored from the offline cache: the server has not confirmed it yet.
    const [needsRevalidation, setNeedsRevalidation] = useState(false);

    // Restaurar la sesión desde la cookie HttpOnly al cargar. Sin red (p.ej. una
    // recarga offline) se conserva el último perfil validado en vez de cerrar sesión.
    useEffect(() => {
        let cancelled = false;
        api.get<UserGet>('/api/v1/user')
            .then(({ data }) => { if (!cancelled) setUser(toUser(data)); })
            .catch((err: unknown) => {
                if (cancelled) return;
                const cached = isNetworkFailure(err) ? readCachedUser() : null;
                setUser(cached);
                setNeedsRevalidation(cached !== null);
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    // Al recuperar la red, el servidor confirma (o rechaza) la sesión cacheada.
    useEffect(() => {
        if (!needsRevalidation) return;
        let cancelled = false;
        const onOnline = () => {
            api.get<UserGet>('/api/v1/user')
                .then(({ data }) => {
                    if (cancelled) return;
                    setUser(toUser(data));
                    setNeedsRevalidation(false);
                })
                .catch((err: unknown) => {
                    if (cancelled || isNetworkFailure(err)) return; // still unreachable: retry on the next online
                    dropLocalPush();
                    setUser(null);
                    setNeedsRevalidation(false);
                });
        };
        window.addEventListener('online', onOnline);
        return () => {
            cancelled = true;
            window.removeEventListener('online', onOnline);
        };
    }, [needsRevalidation]);

    // The cached profile mirrors the session once it is settled: kept while
    // logged in, dropped on logout / expiry / server rejection.
    useEffect(() => {
        if (loading) return;
        if (user) writeCachedUser(user);
        else clearCachedUser();
    }, [user, loading]);

    // Si la sesión no se puede renovar (refresh token caducado o revocado),
    // se cierra la sesión local para que PrivateRoute redirija al login.
    useEffect(() => {
        const onExpired = () => {
            dropLocalPush();
            setUser(null);
            setNeedsRevalidation(false);
        };
        window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
        return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    }, []);

    // Recarga el perfil del usuario autenticado (tras login o activación)
    const refreshUser = useCallback(async () => {
        const { data } = await api.get<UserGet>('/api/v1/user');
        setUser(toUser(data));
        setNeedsRevalidation(false);
    }, []);

    const login = useCallback(async (username: string, password: string): Promise<boolean> => {
        const body: UserLoginRequest = { username, password };
        await api.post('/api/v1/auth/login', body);
        // Las cookies HttpOnly las establece el servidor
        await refreshUser();
        return true;
    }, [refreshUser]);

    const logout = useCallback(async () => {
        // Antes de cerrar la sesión (el DELETE necesita la cookie aún válida):
        // en un navegador compartido no deben llegar pushes del usuario anterior.
        // Bounded: a Service Worker that never becomes ready must not hang the logout.
        const cleanup = Promise.resolve().then(removePushSubscription).catch((err: unknown) => {
            console.error('[Push] Error eliminando la suscripción al cerrar sesión:', err);
        });
        await settleWithin(cleanup, PUSH_CLEANUP_TIMEOUT_MS);
        try {
            await api.post('/api/v1/auth/logout');
        } catch {
            // Aunque falle la petición, se limpia la sesión local
        } finally {
            setUser(null);
            setNeedsRevalidation(false);
            clearCachedUser();
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
