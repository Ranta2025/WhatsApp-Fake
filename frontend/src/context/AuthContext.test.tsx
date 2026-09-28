// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
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
