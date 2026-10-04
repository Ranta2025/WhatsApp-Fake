import { useEffect } from 'react';
import { syncPushSubscription } from '../../../utils/push';
import type { NotificationPermissionState } from '../../../utils/notifications';

/**
 * Web Push lifecycle for the authenticated dashboard: re-syncs this browser's
 * push subscription on boot (login / reload) and right after the user grants
 * notification permission (the banner updates `permission`). Endpoints can
 * rotate, so the subscription is always re-POSTed; the server is idempotent.
 * `userKey` identifies the logged-in user (null = no session).
 */
export function usePushSync(userKey: string | null, permission: NotificationPermissionState): void {
    useEffect(() => {
        if (!userKey || permission !== 'granted') return;
        void syncPushSubscription();
    }, [userKey, permission]);
}
