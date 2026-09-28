import type { NotificationClickPayload } from '../../../utils/notifications';

/**
 * The window `'notification-click'` handler in DashboardContext is
 * registered both with `utils/notifications.ts`'s `onNotificationClick`
 * (Service Worker message path — calls it with a plain
 * `NotificationClickPayload`) and with
 * `window.addEventListener('notification-click', handler)` (the direct
 * Notification API fallback in `showNativeNotification`'s `notif.onclick`,
 * which dispatches `new CustomEvent('notification-click', { detail: {
 * telephon } })`). A DOM listener receives the `CustomEvent` itself, so the
 * telephon has to be read from `event.detail`, not the event directly.
 */
export function extractNotificationTelephon(
    payload: NotificationClickPayload | CustomEvent<NotificationClickPayload>
): string | undefined {
    if (payload instanceof CustomEvent) {
        return payload.detail?.telephon;
    }
    return payload.telephon;
}
