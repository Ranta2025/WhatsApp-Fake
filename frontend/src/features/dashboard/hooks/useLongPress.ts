import { useCallback, useEffect, useRef, type TouchEvent } from 'react';

const LONG_PRESS_MS = 400;
/** Finger travel (px) above which the gesture is a scroll/drag, not a press. */
const MOVE_TOLERANCE_PX = 10;

interface LongPressHandlers {
    onTouchStart: (e: TouchEvent) => void;
    onTouchMove: (e: TouchEvent) => void;
    onTouchEnd: () => void;
    onTouchCancel: () => void;
}

/**
 * Touch long-press (400 ms). `bind(arg)` returns the touch handlers for one
 * element and calls `onLongPress(arg)` after the hold. It is cancelled by
 * releasing, by moving the finger past a small tolerance, and by any scroll
 * (captured on the document, so a scrolling message list cancels it too).
 * One timer is shared: only one touch gesture is tracked at a time.
 */
export function useLongPress<T>(onLongPress: (arg: T) => void, delayMs: number = LONG_PRESS_MS): (arg: T) => LongPressHandlers {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const originRef = useRef<{ x: number; y: number } | null>(null);
    const callbackRef = useRef(onLongPress);
    useEffect(() => { callbackRef.current = onLongPress; }, [onLongPress]);

    const cancelRef = useRef<() => void>(() => {});
    useEffect(() => {
        const cancel = () => {
            if (timerRef.current !== null) clearTimeout(timerRef.current);
            timerRef.current = null;
            originRef.current = null;
            document.removeEventListener('scroll', cancel, true);
        };
        cancelRef.current = cancel;
        return cancel;
    }, []);

    return useCallback((arg: T): LongPressHandlers => ({
        onTouchStart: (e) => {
            cancelRef.current();
            const t = e.touches[0];
            if (!t) return;
            originRef.current = { x: t.clientX, y: t.clientY };
            const cancel = cancelRef.current;
            document.addEventListener('scroll', cancel, true);
            timerRef.current = setTimeout(() => {
                cancel();
                callbackRef.current(arg);
            }, delayMs);
        },
        onTouchMove: (e) => {
            const origin = originRef.current;
            const t = e.touches[0];
            if (!origin || !t) return;
            if (Math.hypot(t.clientX - origin.x, t.clientY - origin.y) > MOVE_TOLERANCE_PX) cancelRef.current();
        },
        onTouchEnd: () => cancelRef.current(),
        onTouchCancel: () => cancelRef.current(),
    }), [delayMs]);
}
