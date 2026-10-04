// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useNotificationClick } from './useNotificationClick';
import * as notifications from '../../../utils/notifications';

// R3-notification-handler-wiring-unproved: DashboardContext registers ONE
// handler both via `onNotificationClick` (Service Worker click path) and
// via `window.addEventListener('notification-click', ...)` (the native
// Notification API fallback, which dispatches a CustomEvent) — see
// `features/dashboard/lib/notificationClick.ts`. That wiring itself
// (registration + cleanup on unmount) had no test; mounting the full
// DashboardProvider needs excessive mocking (useAuth, useWebSocket, every
// dashboard fetch), so the wiring was extracted into this small hook and is
// tested directly instead.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../../utils/notifications', () => ({
    onNotificationClick: vi.fn(),
    offNotificationClick: vi.fn(),
}));

function Harness({ handler }: { handler: (telephon: string) => void }) {
    useNotificationClick(handler);
    return null;
}

describe('useNotificationClick', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('registers a Service Worker click listener and forwards its telephon', () => {
        const handler = vi.fn();
        act(() => { root.render(<Harness handler={handler} />); });

        const registered = vi.mocked(notifications.onNotificationClick).mock.calls[0]?.[0];
        expect(registered).toBeDefined();
        act(() => { registered!({ telephon: '111' }); });

        expect(handler).toHaveBeenCalledWith('111');
    });

    it('reads telephon from a window CustomEvent (native Notification fallback)', () => {
        const handler = vi.fn();
        act(() => { root.render(<Harness handler={handler} />); });

        act(() => {
            window.dispatchEvent(new CustomEvent('notification-click', { detail: { telephon: '222' } }));
        });

        expect(handler).toHaveBeenCalledWith('222');
    });

    it('ignores a CustomEvent with no telephon and does not call the handler', () => {
        const handler = vi.fn();
        act(() => { root.render(<Harness handler={handler} />); });

        act(() => {
            window.dispatchEvent(new CustomEvent('notification-click', { detail: {} }));
        });

        expect(handler).not.toHaveBeenCalled();
    });

    it('removes both listeners on unmount', () => {
        const handler = vi.fn();
        act(() => { root.render(<Harness handler={handler} />); });
        const registered = vi.mocked(notifications.onNotificationClick).mock.calls[0]?.[0];

        act(() => { root.unmount(); });

        expect(notifications.offNotificationClick).toHaveBeenCalledWith(registered);

        act(() => {
            window.dispatchEvent(new CustomEvent('notification-click', { detail: { telephon: '333' } }));
        });
        expect(handler).not.toHaveBeenCalled();
    });
});
