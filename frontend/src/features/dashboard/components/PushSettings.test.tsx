// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DashboardContextValue } from '../context/DashboardContext';
import type { PushConfig } from '../../../types/api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockIsSupported = vi.fn<() => boolean>();
const mockEnsure = vi.fn<(c: PushConfig) => Promise<boolean>>();
const mockRemove = vi.fn<() => Promise<void>>();
const mockCurrent = vi.fn<() => Promise<unknown>>();
const mockSetOptOut = vi.fn<(userKey: string, optedOut: boolean) => void>();
vi.mock('../../../utils/push', () => ({
    setPushOptedOut: (u: string, o: boolean) => mockSetOptOut(u, o),
    isPushSupported: () => mockIsSupported(),
    ensurePushSubscription: (c: PushConfig) => mockEnsure(c),
    removePushSubscription: () => mockRemove(),
    getCurrentPushSubscription: () => mockCurrent(),
}));

const mockGetConfig = vi.fn<() => Promise<PushConfig | null>>();
const mockSetPreview = vi.fn<(p: boolean) => Promise<void>>();
vi.mock('../../../api/pushApi', () => ({
    getPushConfig: () => mockGetConfig(),
    setPushPreview: (p: boolean) => mockSetPreview(p),
}));

const mockRequestPermission = vi.fn<() => Promise<NotificationPermission>>();
vi.mock('../context/DashboardContext', () => ({
    useDashboard: (): Pick<DashboardContextValue, 'requestNotificationPermission' | 'user'> => ({
        requestNotificationPermission: () => mockRequestPermission(),
        user: { username: 'Ana', telephon: '111', avatar: '' },
    }),
}));

import PushSettings from './PushSettings';

const CONFIG: PushConfig = { enabled: true, publicKey: 'BKey', preview: true };

const setPermission = (permission: NotificationPermission) => {
    Object.defineProperty(window, 'Notification', { configurable: true, value: { permission } });
};

describe('PushSettings', () => {
    let container: HTMLDivElement;
    let root: Root;

    const render = async () => {
        await act(async () => { root.render(<PushSettings />); });
    };
    const getSwitch = (name: string): HTMLButtonElement | null =>
        container.querySelector<HTMLButtonElement>(`[role="switch"][aria-label="${name}"]`);
    const click = async (el: HTMLElement) => {
        await act(async () => { el.click(); });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockIsSupported.mockReturnValue(true);
        mockGetConfig.mockResolvedValue(CONFIG);
        mockCurrent.mockResolvedValue(null);
        mockEnsure.mockResolvedValue(true);
        mockRemove.mockResolvedValue(undefined);
        mockSetPreview.mockResolvedValue(undefined);
        mockRequestPermission.mockResolvedValue('granted');
        setPermission('granted');
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
        Reflect.deleteProperty(window, 'Notification');
        vi.restoreAllMocks();
    });

    it('is hidden when push is disabled on the server', async () => {
        mockGetConfig.mockResolvedValue({ enabled: false, publicKey: '', preview: true });
        await render();
        expect(container.innerHTML).toBe('');
    });

    it('is hidden when the config request fails or is malformed', async () => {
        mockGetConfig.mockRejectedValue(new Error('500'));
        await render();
        expect(container.innerHTML).toBe('');
    });

    it('is hidden (and never asks the server) when the browser lacks Web Push', async () => {
        mockIsSupported.mockReturnValue(false);
        await render();
        expect(container.innerHTML).toBe('');
        expect(mockGetConfig).not.toHaveBeenCalled();
    });

    it('reflects the current subscription and the preview setting', async () => {
        mockCurrent.mockResolvedValue({ endpoint: 'x' });
        mockGetConfig.mockResolvedValue({ ...CONFIG, preview: false });
        await render();
        expect(getSwitch('Notificaciones push')?.getAttribute('aria-checked')).toBe('true');
        expect(getSwitch('Mostrar vista previa')?.getAttribute('aria-checked')).toBe('false');
    });

    it('switches render no text content (only the knob)', async () => {
        await render();
        expect(getSwitch('Notificaciones push')?.textContent).toBe('');
        expect(getSwitch('Mostrar vista previa')?.textContent).toBe('');
    });

    it('turning push on ensures the subscription', async () => {
        await render();
        const toggle = getSwitch('Notificaciones push')!;
        expect(toggle.getAttribute('aria-checked')).toBe('false');
        await click(toggle);
        expect(mockRequestPermission).not.toHaveBeenCalled();
        expect(mockEnsure).toHaveBeenCalledWith(CONFIG);
        expect(toggle.getAttribute('aria-checked')).toBe('true');
    });

    it('turning push on clears the per-user opt-out', async () => {
        await render();
        await click(getSwitch('Notificaciones push')!);
        expect(mockSetOptOut).toHaveBeenCalledWith('111', false);
    });

    it('turning push off records the per-user opt-out so it sticks across reloads', async () => {
        mockCurrent.mockResolvedValueOnce({ endpoint: 'x' }).mockResolvedValue(null);
        await render();
        await click(getSwitch('Notificaciones push')!);
        expect(mockSetOptOut).toHaveBeenCalledWith('111', true);
        expect(mockSetOptOut).not.toHaveBeenCalledWith('111', false);
    });

    it('turning push on requests permission first when not yet granted', async () => {
        setPermission('default');
        mockRequestPermission.mockImplementation(() => { setPermission('granted'); return Promise.resolve('granted'); });
        await render();
        await click(getSwitch('Notificaciones push')!);
        expect(mockRequestPermission).toHaveBeenCalled();
        expect(mockEnsure).toHaveBeenCalledWith(CONFIG);
    });

    it('stays off and explains when permission is refused', async () => {
        setPermission('default');
        mockRequestPermission.mockResolvedValue('denied');
        await render();
        const toggle = getSwitch('Notificaciones push')!;
        await click(toggle);
        expect(mockEnsure).not.toHaveBeenCalled();
        expect(toggle.getAttribute('aria-checked')).toBe('false');
        expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/permiso/i);
    });

    it('turning push off removes the subscription', async () => {
        mockCurrent.mockResolvedValueOnce({ endpoint: 'x' }).mockResolvedValue(null);
        await render();
        const toggle = getSwitch('Notificaciones push')!;
        expect(toggle.getAttribute('aria-checked')).toBe('true');
        await click(toggle);
        expect(mockRemove).toHaveBeenCalled();
        expect(toggle.getAttribute('aria-checked')).toBe('false');
    });

    it('the preview toggle PUTs push/preview and reverts on failure', async () => {
        await render();
        const toggle = getSwitch('Mostrar vista previa')!;
        await click(toggle);
        expect(mockSetPreview).toHaveBeenCalledWith(false);
        expect(toggle.getAttribute('aria-checked')).toBe('false');

        mockSetPreview.mockRejectedValue(new Error('404'));
        await click(toggle);
        expect(mockSetPreview).toHaveBeenLastCalledWith(true);
        expect(toggle.getAttribute('aria-checked')).toBe('false');
        expect(container.querySelector('[role="alert"]')).not.toBeNull();
    });
});
