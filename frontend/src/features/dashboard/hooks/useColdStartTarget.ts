import { useEffect, useRef, useState } from 'react';
import { hasColdStartParams, parseColdStartTarget, stripColdStartParams } from '../lib/coldStartTarget';
import type { NotificationTarget } from '../lib/notificationClick';

/**
 * Consumes the notification cold-start deep link (`?chat=` / `?group=`, see
 * `lib/coldStartTarget.ts`). The query is read once, at the first render;
 * once `ready` (contacts/chats/groups loaded) `onTarget` runs a single time
 * and the params are removed with `history.replaceState` (keeping the
 * router's history state, other params and the hash) so a reload does not
 * re-open the chat. An invalid value is stripped without selecting anything.
 */
export function useColdStartTarget(ready: boolean, onTarget: (target: NotificationTarget) => void): void {
    const [boot] = useState(() => {
        const search = window.location.search;
        return { present: hasColdStartParams(search), target: parseColdStartTarget(search) };
    });
    const consumedRef = useRef(false);

    useEffect(() => {
        if (!ready || consumedRef.current || !boot.present) return;
        consumedRef.current = true;
        const { pathname, search, hash } = window.location;
        const state: unknown = window.history.state;
        window.history.replaceState(state, '', `${pathname}${stripColdStartParams(search)}${hash}`);
        if (boot.target) onTarget(boot.target);
    }, [ready, onTarget, boot]);
}
