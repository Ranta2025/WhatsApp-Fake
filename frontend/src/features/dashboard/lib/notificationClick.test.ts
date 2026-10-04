// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractNotificationTarget, extractNotificationTelephon } from './notificationClick';
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

describe('extractNotificationTarget', () => {
    it('maps a plain { telephon } payload to a direct target', () => {
        expect(extractNotificationTarget({ telephon: '123' })).toEqual({ kind: 'direct', telephon: '123' });
    });

    it('maps a plain { groupID } payload to a group target', () => {
        expect(extractNotificationTarget({ groupID: 7 })).toEqual({ kind: 'group', groupID: 7 });
    });

    it('reads either target from a CustomEvent detail', () => {
        expect(extractNotificationTarget(new CustomEvent('notification-click', { detail: { telephon: '9' } })))
            .toEqual({ kind: 'direct', telephon: '9' });
        expect(extractNotificationTarget(new CustomEvent('notification-click', { detail: { groupID: 3 } })))
            .toEqual({ kind: 'group', groupID: 3 });
    });

    it('returns null for events without a valid target', () => {
        expect(extractNotificationTarget(new CustomEvent('notification-click'))).toBeNull();
        expect(extractNotificationTarget(new CustomEvent('notification-click', { detail: { groupID: 0 } }))).toBeNull();
        expect(extractNotificationTarget(new Event('notification-click'))).toBeNull();
    });
});

describe('extractNotificationTelephon (group payloads)', () => {
    it('returns undefined for a group target', () => {
        expect(extractNotificationTelephon({ groupID: 7 })).toBeUndefined();
    });
});
