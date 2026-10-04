// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { AuthContextValue } from '../context/AuthContext';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockAuth: Pick<AuthContextValue, 'user' | 'loading'> = { user: null, loading: false };
vi.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }));
vi.mock('./ui/FullScreenLoader', () => ({ default: () => <div data-testid="loader" /> }));

import PrivateRoute from './PrivateRoute';

function LoginProbe() {
    const location = useLocation();
    return <pre data-testid="login">{JSON.stringify(location.state)}</pre>;
}

describe('PrivateRoute', () => {
    let container: HTMLDivElement;
    let root: Root;

    const render = async (entry: string) => {
        await act(async () => {
            root.render(
                <MemoryRouter initialEntries={[entry]}>
                    <Routes>
                        <Route path="/login" element={<LoginProbe />} />
                        <Route path="/dashboard" element={<PrivateRoute><div data-testid="dashboard" /></PrivateRoute>} />
                    </Routes>
                </MemoryRouter>,
            );
        });
    };

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('redirects a logged-out visit to /login keeping where it came from (incl. ?chat=)', async () => {
        mockAuth = { user: null, loading: false };
        await render('/dashboard?chat=%2B34');
        const probe = container.querySelector('[data-testid="login"]');
        expect(probe).not.toBeNull();
        const state: unknown = JSON.parse(probe?.textContent ?? 'null');
        expect(state).toEqual({ from: expect.objectContaining({ pathname: '/dashboard', search: '?chat=%2B34' }) });
    });

    it('renders the protected page when logged in', async () => {
        mockAuth = { user: { username: 'Ana', telephon: '111', avatar: '' }, loading: false };
        await render('/dashboard?group=3');
        expect(container.querySelector('[data-testid="dashboard"]')).not.toBeNull();
    });

    it('shows the loader while the session is being restored', async () => {
        mockAuth = { user: null, loading: true };
        await render('/dashboard');
        expect(container.querySelector('[data-testid="loader"]')).not.toBeNull();
    });
});
