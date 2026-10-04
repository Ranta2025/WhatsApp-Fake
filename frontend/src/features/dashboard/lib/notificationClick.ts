import {
    parseNotificationClickPayload, toNotificationTarget,
    type NotificationClickPayload, type NotificationTarget,
} from '../../../utils/notificationTarget';

export type { NotificationTarget } from '../../../utils/notificationTarget';

/**
 * The window `'notification-click'` handler in DashboardContext is
 * registered both with `utils/notifications.ts`'s `onNotificationClick`
 * (Service Worker message path — calls it with a plain
 * `NotificationClickPayload`, `{ telephon }` or `{ groupID }`) and with
 * `window.addEventListener('notification-click', handler)` (the direct
 * Notification API fallback in `showNativeNotification`'s `notif.onclick`,
 * which dispatches `new CustomEvent('notification-click', { detail })`).
 * A DOM listener receives the event itself, so the target has to be read
 * from `event.detail`, not the event directly. Every shape is re-validated.
 */
export function extractNotificationTarget(
    payload: NotificationClickPayload | Event
): NotificationTarget | null {
    const raw: unknown = payload instanceof Event
        ? (payload instanceof CustomEvent ? payload.detail : null)
        : payload;
    const parsed = parseNotificationClickPayload(raw);
    return parsed ? toNotificationTarget(parsed) : null;
}

/** Backwards-compatible 1:1 path: the telephon of a direct target, undefined otherwise. */
export function extractNotificationTelephon(
    payload: NotificationClickPayload | Event
): string | undefined {
    const target = extractNotificationTarget(payload);
    return target?.kind === 'direct' ? target.telephon : undefined;
}
