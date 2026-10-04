/**
 * What a notification click points at. Shared by every click path on the page:
 * the Service Worker `NOTIFICATION_CLICK` message, the native Notification
 * fallback (`'notification-click'` CustomEvent) and the cold-start query
 * (`/dashboard?chat=` / `?group=`).
 */

/** Wire shape (SW message body / CustomEvent detail): 1:1 chat or group. */
export type NotificationClickPayload = { telephon: string } | { groupID: number };

/** Tagged form consumed by the dashboard. */
export type NotificationTarget = { kind: 'direct'; telephon: string } | { kind: 'group'; groupID: number };

export function isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Runtime guard: `{ telephon }` (non-empty) or `{ groupID }` (positive integer); null otherwise. */
export function parseNotificationClickPayload(value: unknown): NotificationClickPayload | null {
    if (typeof value !== 'object' || value === null) return null;
    if ('telephon' in value && typeof value.telephon === 'string' && value.telephon !== '') {
        return { telephon: value.telephon };
    }
    if ('groupID' in value && isPositiveInteger(value.groupID)) {
        return { groupID: value.groupID };
    }
    return null;
}

export function toNotificationTarget(payload: NotificationClickPayload): NotificationTarget {
    return 'telephon' in payload
        ? { kind: 'direct', telephon: payload.telephon }
        : { kind: 'group', groupID: payload.groupID };
}
