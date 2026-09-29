// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ProfileModal from './ProfileModal';
import { useDashboard, type DashboardContextValue } from '../context/DashboardContext';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../api/axios';

// Item 6b: ProfileModal used `axios.isAxiosError`, so a plain-object rejection
// lost `response.data.error` / `.message`. Now structural via lib/errors.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../../api/axios', () => ({
    default: { post: vi.fn(), put: vi.fn(), get: vi.fn() },
}));

const mockUseDashboard = vi.mocked(useDashboard);
const mockUseAuth = vi.mocked(useAuth);
const mockPut = vi.mocked(api.put);

const setInputValue = (el: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('ProfileModal error extraction', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        mockUseDashboard.mockReturnValue({
            myAvatar: '',
            setMyAvatar: vi.fn(),
            globalWallpaper: '',
            setGlobalWallpaper: vi.fn(),
            fetchProfile: vi.fn().mockResolvedValue(undefined),
        } as unknown as DashboardContextValue);
        mockUseAuth.mockReturnValue({
            user: { username: 'oldname', telephon: '111', avatar: '' },
            updateUsername: vi.fn(),
        } as unknown as ReturnType<typeof useAuth>);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('shows response.data.error from a plain (non-Axios) rejection', async () => {
        mockPut.mockRejectedValue({ response: { data: { error: 'profile boom' } } });

        await act(async () => { root.render(<ProfileModal isOpen onClose={vi.fn()} />); });

        const usernameInput = container.querySelector('input[placeholder="Tu nombre visible"]') as HTMLInputElement;
        await act(async () => { setInputValue(usernameInput, 'newname'); });

        const submit = Array.from(container.querySelectorAll('button')).find(b => (b.textContent || '').includes('Guardar Cambios'));
        expect(submit).toBeDefined();
        await act(async () => {
            submit!.click();
            await Promise.resolve();
        });

        expect(mockPut).toHaveBeenCalled();
        expect(container.textContent).toContain('profile boom');
    });

    it('prefers response.data.message over response.data.error when a body carries both (original precedence)', async () => {
        mockPut.mockRejectedValue({ response: { data: { error: 'generic err', message: 'specific msg' } } });

        await act(async () => { root.render(<ProfileModal isOpen onClose={vi.fn()} />); });

        const usernameInput = container.querySelector('input[placeholder="Tu nombre visible"]') as HTMLInputElement;
        await act(async () => { setInputValue(usernameInput, 'newname'); });

        const submit = Array.from(container.querySelectorAll('button')).find(b => (b.textContent || '').includes('Guardar Cambios'));
        await act(async () => {
            submit!.click();
            await Promise.resolve();
        });

        expect(container.textContent).toContain('specific msg');
        expect(container.textContent).not.toContain('generic err');
    });
});
