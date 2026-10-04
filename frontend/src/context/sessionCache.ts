import type { AuthUser } from './authUser';

/**
 * Last server-validated session profile, kept so an offline reload does not log
 * the user out. Only the AuthUser fields are stored (no tokens: the session
 * itself lives in HttpOnly cookies).
 */
export const SESSION_CACHE_KEY = 'whatsapp-fake:session-user';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Narrows untrusted storage data; a profile without telephon is useless (it keys the outbox). */
export const toCachedUser = (raw: unknown): AuthUser | null => {
    if (!isRecord(raw)) return null;
    const { username, telephon, avatar } = raw;
    if (typeof username !== 'string' || typeof telephon !== 'string' || typeof avatar !== 'string') return null;
    if (telephon === '') return null;
    return { username, telephon, avatar };
};

export function readCachedUser(): AuthUser | null {
    try {
        const raw = localStorage.getItem(SESSION_CACHE_KEY);
        return raw === null ? null : toCachedUser(JSON.parse(raw));
    } catch {
        return null;
    }
}

export function writeCachedUser(user: AuthUser): void {
    const profile = toCachedUser(user);
    try {
        if (profile) localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(profile));
        else localStorage.removeItem(SESSION_CACHE_KEY);
    } catch {
        // Storage unavailable (private mode, quota): the session just won't survive offline.
    }
}

export function clearCachedUser(): void {
    try {
        localStorage.removeItem(SESSION_CACHE_KEY);
    } catch {
        // Storage unavailable: nothing was cached.
    }
}
