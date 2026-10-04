import { useEffect } from 'react';
import {
    onNotificationClick, offNotificationClick, type NotificationClickPayload,
} from '../../../utils/notifications';
import { extractNotificationTelephon } from '../lib/notificationClick';

/**
 * Wires up the two ways a notification click reaches the app — the Service
 * Worker message path (`onNotificationClick`, plain `{ telephon }`) and the
 * native Notification API fallback (`window.addEventListener`, a
 * `CustomEvent`) — and calls `onClick(telephon)` once, regardless of which
 * path fired. Extracted out of `DashboardContext` so the wiring itself
 * (registration + cleanup) is testable without mounting the whole provider.
 */
export function useNotificationClick(onClick: (telephon: string) => void): void {
    useEffect(() => {
        const handler = (payload: NotificationClickPayload | CustomEvent<NotificationClickPayload>) => {
            const telephon = extractNotificationTelephon(payload);
            if (!telephon) return;
            onClick(telephon);
        };

        onNotificationClick(handler);
        // algunas notificaciones se disparan como evento de ventana
        window.addEventListener('notification-click', handler as EventListener);
        return () => {
            offNotificationClick(handler);
            window.removeEventListener('notification-click', handler as EventListener);
        };
    }, [onClick]);
}
