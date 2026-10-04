import { useEffect, useRef, useState } from 'react';
import { expiryDelay, MAX_EXPIRY_DELAY_MS } from '../lib/disappearing';

interface UseExpiryTimerArgs {
    /** Earliest `ExpiresAt` (epoch ms) among every loaded message, or null. */
    earliest: number | null;
    /** Called when the timer fires; must remove every message with `now >= ExpiresAt`. */
    onExpire: (now: number) => void;
    /** Injectable clock (defaults to Date.now). */
    now?: () => number;
    /** Longest single timeout; a longer wait is split and re-armed (browser timers clamp/drift). */
    maxDelayMs?: number;
}

/**
 * ONE timeout for the earliest expiry (never one per message), re-armed whenever
 * `earliest` changes. The delay is never negative and capped, so a tab that slept or
 * a far expiry still converges: when the cap fires before the expiry, the timer
 * re-arms itself (`earliest` did not change, so a tick forces the effect to run
 * again). When it fires at/after the expiry the owner removes the messages and the
 * new `earliest` re-arms it.
 */
export function useExpiryTimer({ earliest, onExpire, now = Date.now, maxDelayMs = MAX_EXPIRY_DELAY_MS }: UseExpiryTimerArgs): void {
    const handlers = useRef({ onExpire, now });
    useEffect(() => { handlers.current = { onExpire, now }; });
    const [rearm, setRearm] = useState(0);

    useEffect(() => {
        const delay = expiryDelay(earliest, handlers.current.now(), maxDelayMs);
        if (delay === null || earliest === null) return;
        const handle = setTimeout(() => {
            const current = handlers.current.now();
            handlers.current.onExpire(current);
            if (current < earliest) setRearm(n => n + 1);
        }, delay);
        return () => clearTimeout(handle);
    }, [earliest, rearm, maxDelayMs]);
}
