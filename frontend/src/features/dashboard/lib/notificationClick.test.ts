// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractNotificationTelephon } from './notificationClick';
import type { NotificationClickPayload } from '../../../utils/notifications';

// DashboardContext registers ONE handler both with
// `utils/notifications.ts`'s `onNotificationClick` (Service Worker click
// path, calls the handler with a plain `{ telephon }`) AND with
// `window.addEventListener('notification-click', handler)` (the direct
// Notification-API fallback in `showNativeNotification`'s `notif.onclick`,
// which does `window.dispatchEvent(new CustomEvent('notification-click',
// { detail: { telephon } }))`). A DOM event listener receives the
// CustomEvent itself, not its `detail` — destructuring `{ telephon }`
// straight off that event silently yields `undefined`, so clicking a native
// notification without an active Service Worker never opened the chat.
describe('extractNotificationTelephon', () => {
    it('reads telephon directly from a plain payload (Service Worker path)', () => {
        expect(extractNotificationTelephon({ telephon: '123' })).toBe('123');
    });

    it('reads telephon from event.detail for a CustomEvent (fallback path)', () => {
        const event = new CustomEvent('notification-click', { detail: { telephon: '456' } });
        expect(extractNotificationTelephon(event)).toBe('456');
    });

    it('returns undefined for a CustomEvent with no detail', () => {
        const event = new CustomEvent<NotificationClickPayload>('notification-click');
        expect(extractNotificationTelephon(event)).toBeUndefined();
    });
});
