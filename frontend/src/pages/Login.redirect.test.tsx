// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = vi.fn();
const mockLogin = vi.fn();
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login: mockLogin }) }));
vi.mock('react-router-dom', async (importActual) => ({
    ...(await importActual<typeof import('react-router-dom')>()),
    useNavigate: () => mockNavigate,
}));

import Login from './Login';

describe('Login returns to the protected location after signing in', () => {
    let container: HTMLDivElement;
    let root: Root;

    const render = async (state?: unknown) => {
        await act(async () => {
            root.render(<MemoryRouter initialEntries={[{ pathname: '/login', state }]}><Login /></MemoryRouter>);
        });
    };

    const type = async (selector: string, value: string) => {
        const input = container.querySelector<HTMLInputElement>(selector);
        if (!input) throw new Error(`no input ${selector}`);
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    };

    const submit = async () => {
        await type('#username', 'ana');
        await type('#password', 'secret');
        const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Entrar');
        if (!button) throw new Error('no submit');
        await act(async () => { button.click(); });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockLogin.mockResolvedValue(true);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('navigates back to the dashboard chat the notification pointed at', async () => {
        await render({ from: { pathname: '/dashboard', search: '?chat=%2B34', hash: '' } });
        await submit();
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard?chat=%2B34', { replace: true });
    });

    it('defaults to /dashboard without a stored location', async () => {
        await render();
        await submit();
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });

    it('ignores a location outside the dashboard (no open redirect)', async () => {
        await render({ from: { pathname: '//evil.com', search: '' } });
        await submit();
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
});
