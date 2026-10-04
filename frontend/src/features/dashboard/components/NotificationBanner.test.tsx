// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DashboardContextValue } from '../context/DashboardContext';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockSetOptOut = vi.fn<(userKey: string, optedOut: boolean) => void>();
vi.mock('../../../utils/push', () => ({
    setPushOptedOut: (u: string, o: boolean) => mockSetOptOut(u, o),
}));

const mockRequestPermission = vi.fn<() => Promise<NotificationPermission>>();
const mockSetNotifPermission = vi.fn();
vi.mock('../context/DashboardContext', () => ({
    useDashboard: (): Pick<DashboardContextValue,
        'notifPermission' | 'setNotifPermission' | 'requestNotificationPermission' | 'user'> => ({
        notifPermission: 'default',
        setNotifPermission: mockSetNotifPermission,
        requestNotificationPermission: () => mockRequestPermission(),
        user: { username: 'Ana', telephon: '111', avatar: '' },
    }),
}));

import NotificationBanner from './NotificationBanner';

describe('NotificationBanner', () => {
    let container: HTMLDivElement;
    let root: Root;

    const clickButton = async (label: string) => {
        const button = [...container.querySelectorAll('button')].find((b) => b.textContent === label);
        if (!button) throw new Error(`no button "${label}"`);
        await act(async () => { button.click(); });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockRequestPermission.mockResolvedValue('granted');
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('an explicit "Activar" clears the per-user push opt-out before asking for permission', async () => {
        const order: string[] = [];
        mockSetOptOut.mockImplementation(() => { order.push('opt-in'); });
        mockRequestPermission.mockImplementation(() => { order.push('request'); return Promise.resolve('granted'); });
        await act(async () => { root.render(<NotificationBanner />); });
        await clickButton('Activar');
        expect(mockSetOptOut).toHaveBeenCalledWith('111', false);
        expect(order).toEqual(['opt-in', 'request']);
        expect(mockSetNotifPermission).toHaveBeenCalledWith('granted');
    });

    it('dismissing the banner does not touch the opt-out', async () => {
        await act(async () => { root.render(<NotificationBanner />); });
        await clickButton('×');
        expect(mockSetOptOut).not.toHaveBeenCalled();
        expect(mockSetNotifPermission).toHaveBeenCalledWith('dismissed');
    });
});
