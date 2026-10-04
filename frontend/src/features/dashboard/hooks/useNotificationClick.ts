import { useEffect } from 'react';
import {
    onNotificationClick, offNotificationClick, type NotificationClickPayload,
} from '../../../utils/notifications';
import { extractNotificationTarget, type NotificationTarget } from '../lib/notificationClick';

/**
 * Wires up the two ways a notification click reaches the app — the Service
 * Worker message path (`onNotificationClick`, plain `{ telephon }` or
 * `{ groupID }`) and the native Notification API fallback
 * (`window.addEventListener`, a `CustomEvent`) — and calls `onClick(target)`
 * once, regardless of which path fired. Extracted out of `DashboardContext`
 * so the wiring itself (registration + cleanup) is testable without mounting
 * the whole provider.
 */
export function useNotificationClick(onClick: (target: NotificationTarget) => void): void {
    useEffect(() => {
        // Accepts both shapes, so it is assignable to the handler type and to EventListener.
        const handler = (payload: NotificationClickPayload | Event) => {
            const target = extractNotificationTarget(payload);
            if (!target) return;
            onClick(target);
        };

        onNotificationClick(handler);
        // algunas notificaciones se disparan como evento de ventana
        window.addEventListener('notification-click', handler);
        return () => {
            offNotificationClick(handler);
            window.removeEventListener('notification-click', handler);
        };
    }, [onClick]);
}
