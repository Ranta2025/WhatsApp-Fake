// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AxiosError, AxiosHeaders } from 'axios';
import { AuthProvider, useAuth, type AuthContextValue } from './AuthContext';
import { PUSH_CLEANUP_TIMEOUT_MS } from './settleWithin';

// R3-toUser-null-body-guard-removed: covers the AuthProvider-level effect of
// a null response body (see `authUser.test.ts` for the `toUser` unit tests
// themselves) — session restore and `login()` must not crash/reject when
// `/api/v1/user` returns an empty body.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('../api/axios', () => ({
    default: { get: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args) },
    SESSION_EXPIRED_EVENT: 'auth:session-expired',
}));

const mockRemovePush = vi.fn();
const mockClearLocalPush = vi.fn();
vi.mock('../utils/push', () => ({
    removePushSubscription: (...args: unknown[]) => mockRemovePush(...args),
    clearLocalPushSubscription: (...args: unknown[]) => mockClearLocalPush(...args),
}));

function Harness({ onReady }: { onReady: (value: AuthContextValue) => void }) {
    const auth = useAuth();
    onReady(auth);
    return null;
}

describe('AuthProvider with a null response body', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({ data: null });
        mockPost.mockResolvedValue({ data: null });
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('session restore on mount does not crash and settles to a tolerant empty user', async () => {
        let ctx: AuthContextValue | undefined;
        await act(async () => {
            root.render(<AuthProvider><Harness onReady={(v) => { ctx = v; }} /></AuthProvider>);
        });
        expect(ctx?.user).toEqual({ username: '', telephon: '', avatar: '' });
        expect(ctx?.loading).toBe(false);
    });

    it('login() resolves (does not reject) after the server sets cookies with a null user body', async () => {
        let ctx: AuthContextValue | undefined;
        await act(async () => {
            root.render(<AuthProvider><Harness onReady={(v) => { ctx = v; }} /></AuthProvider>);
        });

        await act(async () => {
            await expect(ctx!.login('ana', 'secret')).resolves.toBe(true);
        });

        expect(ctx?.user).toEqual({ username: '', telephon: '', avatar: '' });
    });
});

// PW10: an offline reload must not log the user out. The last validated profile
// is cached (no tokens) and reused when `/api/v1/user` fails without a response.
describe('AuthProvider offline session cache', () => {
    const KEY = 'whatsapp-fake:session-user';
    const PROFILE = { username: 'Ana', telephon: '111', avatar: '/a.png' };
    const SERVER = { username: 'Ana', telephon: '111', avatarUrl: '/a.png' };
    let container: HTMLDivElement;
    let root: Root;
    let ctx: AuthContextValue | undefined;

    const networkError = () => new AxiosError('Network Error', AxiosError.ERR_NETWORK);
    const httpError = (status: number) => new AxiosError('fail', AxiosError.ERR_BAD_REQUEST, undefined, undefined,
        { status, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: null });

    async function mount() {
        await act(async () => {
            root.render(<AuthProvider><Harness onReady={(v) => { ctx = v; }} /></AuthProvider>);
        });
    }

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        ctx = undefined;
        mockClearLocalPush.mockResolvedValue(undefined);
        mockPost.mockResolvedValue({ data: null });
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
        localStorage.clear();
    });

    it('caches only the profile fields after a successful session restore', async () => {
        mockGet.mockResolvedValue({ data: { ...SERVER, Email: 'ana@x.io', token: 'secret' } });
        await mount();
        expect(ctx?.user).toEqual(PROFILE);
        expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual(PROFILE);
    });

    it('keeps the session from the cached profile when the restore fails with a network error', async () => {
        localStorage.setItem(KEY, JSON.stringify(PROFILE));
        mockGet.mockRejectedValue(networkError());
        await mount();
        expect(ctx?.loading).toBe(false);
        expect(ctx?.user).toEqual(PROFILE);
        expect(localStorage.getItem(KEY)).not.toBeNull();
    });

    it('without a cached profile a network error still ends logged out', async () => {
        mockGet.mockRejectedValue(networkError());
        await mount();
        expect(ctx?.user).toBeNull();
        expect(ctx?.loading).toBe(false);
    });

    it('a real 401 clears the user and the cached profile', async () => {
        localStorage.setItem(KEY, JSON.stringify(PROFILE));
        mockGet.mockRejectedValue(httpError(401));
        await mount();
        expect(ctx?.user).toBeNull();
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('re-validates on online: a 401 then clears the cached session', async () => {
        localStorage.setItem(KEY, JSON.stringify(PROFILE));
        mockGet.mockRejectedValueOnce(networkError());
        await mount();
        expect(ctx?.user).toEqual(PROFILE);

        mockGet.mockRejectedValueOnce(httpError(401));
        await act(async () => { window.dispatchEvent(new Event('online')); });
        expect(mockGet).toHaveBeenCalledTimes(2);
        expect(ctx?.user).toBeNull();
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('re-validation rejected by the server drops the browser push subscription', async () => {
        localStorage.setItem(KEY, JSON.stringify(PROFILE));
        mockGet.mockRejectedValueOnce(networkError());
        await mount();
        expect(mockClearLocalPush).not.toHaveBeenCalled();

        mockGet.mockRejectedValueOnce(httpError(401));
        await act(async () => { window.dispatchEvent(new Event('online')); });
        expect(mockClearLocalPush).toHaveBeenCalledTimes(1);
    });

    it('re-validation that is still offline keeps the push subscription', async () => {
        localStorage.setItem(KEY, JSON.stringify(PROFILE));
        mockGet.mockRejectedValue(networkError());
        await mount();
        await act(async () => { window.dispatchEvent(new Event('online')); });
        expect(mockClearLocalPush).not.toHaveBeenCalled();
    });

    it('re-validates on online: success refreshes the profile', async () => {
        localStorage.setItem(KEY, JSON.stringify(PROFILE));
        mockGet.mockRejectedValueOnce(networkError());
        await mount();

        mockGet.mockResolvedValueOnce({ data: { ...SERVER, username: 'Ana B' } });
        await act(async () => { window.dispatchEvent(new Event('online')); });
        expect(ctx?.user).toEqual({ ...PROFILE, username: 'Ana B' });
        expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({ ...PROFILE, username: 'Ana B' });
    });

    it('does not re-validate on online when the session was validated by the server', async () => {
        mockGet.mockResolvedValue({ data: SERVER });
        await mount();
        await act(async () => { window.dispatchEvent(new Event('online')); });
        expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('logout clears the cached profile', async () => {
        mockGet.mockResolvedValue({ data: SERVER });
        await mount();
        expect(localStorage.getItem(KEY)).not.toBeNull();
        await act(async () => { await ctx!.logout(); });
        expect(ctx?.user).toBeNull();
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it.each([
        ['not json', '{oops'],
        ['wrong shape', JSON.stringify({ username: 1, telephon: '111', avatar: '' })],
        ['empty telephon', JSON.stringify({ username: 'Ana', telephon: '', avatar: '' })],
        ['null', 'null'],
    ])('ignores a corrupt cached profile (%s)', async (_label, raw) => {
        localStorage.setItem(KEY, raw);
        mockGet.mockRejectedValue(networkError());
        await mount();
        expect(ctx?.user).toBeNull();
        expect(ctx?.loading).toBe(false);
    });
});

// WP4: on a shared browser the previous user's push subscription must be gone
// before the session ends (the DELETE needs the still-valid cookie).
describe('AuthProvider logout and Web Push', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({ data: null });
        mockPost.mockResolvedValue({ data: null });
        mockRemovePush.mockResolvedValue(undefined);
        mockClearLocalPush.mockResolvedValue(undefined);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        vi.useRealTimers();
        act(() => { root.unmount(); });
        container.remove();
    });

    const mount = async (): Promise<AuthContextValue> => {
        let ctx: AuthContextValue | undefined;
        await act(async () => {
            root.render(<AuthProvider><Harness onReady={(v) => { ctx = v; }} /></AuthProvider>);
        });
        return ctx!;
    };

    it('removes the push subscription before the logout request', async () => {
        const order: string[] = [];
        mockRemovePush.mockImplementation(() => { order.push('push'); return Promise.resolve(); });
        mockPost.mockImplementation((url: string) => { order.push(url); return Promise.resolve({ data: null }); });
        const ctx = await mount();
        await act(async () => { await ctx.logout(); });
        expect(order).toEqual(['push', '/api/v1/auth/logout']);
    });

    it('still logs out when removing the push subscription rejects', async () => {
        mockRemovePush.mockRejectedValue(new Error('boom'));
        let latest: AuthContextValue | undefined;
        await act(async () => {
            root.render(<AuthProvider><Harness onReady={(v) => { latest = v; }} /></AuthProvider>);
        });
        expect(latest?.user).not.toBeNull();
        await act(async () => { await latest!.logout(); });
        expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/logout');
        expect(latest?.user).toBeNull();
    });

    it('push cleanup that never settles cannot block logout (bounded wait)', async () => {
        mockRemovePush.mockImplementation(() => new Promise<void>(() => undefined));
        vi.useFakeTimers();
        let latest: AuthContextValue | undefined;
        await act(async () => {
            root.render(<AuthProvider><Harness onReady={(v) => { latest = v; }} /></AuthProvider>);
        });
        let done = false;
        await act(async () => {
            void latest!.logout().then(() => { done = true; });
            await vi.advanceTimersByTimeAsync(PUSH_CLEANUP_TIMEOUT_MS);
        });
        expect(PUSH_CLEANUP_TIMEOUT_MS).toBeLessThanOrEqual(3000);
        expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/logout');
        expect(done).toBe(true);
        expect(latest?.user).toBeNull();
    });

    it('session expiry (no logout call) drops the browser push subscription only', async () => {
        const ctx = await mount();
        expect(ctx.user).not.toBeNull();
        await act(async () => { window.dispatchEvent(new Event('auth:session-expired')); });
        expect(mockClearLocalPush).toHaveBeenCalledTimes(1);
        expect(mockRemovePush).not.toHaveBeenCalled();
    });

    it('a failing browser cleanup on expiry is swallowed', async () => {
        mockClearLocalPush.mockRejectedValue(new Error('boom'));
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        let latest: AuthContextValue | undefined;
        await act(async () => {
            root.render(<AuthProvider><Harness onReady={(v) => { latest = v; }} /></AuthProvider>);
        });
        await act(async () => { window.dispatchEvent(new Event('auth:session-expired')); });
        expect(latest?.user).toBeNull();
        errSpy.mockRestore();
    });
});
