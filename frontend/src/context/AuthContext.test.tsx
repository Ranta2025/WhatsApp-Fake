// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AxiosError, AxiosHeaders } from 'axios';
import { AuthProvider, useAuth, type AuthContextValue } from './AuthContext';

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
    const SERVER = { Username: 'Ana', Telephon: '111', avatar_url: '/a.png' };
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

    it('re-validates on online: success refreshes the profile', async () => {
        localStorage.setItem(KEY, JSON.stringify(PROFILE));
        mockGet.mockRejectedValueOnce(networkError());
        await mount();

        mockGet.mockResolvedValueOnce({ data: { ...SERVER, Username: 'Ana B' } });
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
