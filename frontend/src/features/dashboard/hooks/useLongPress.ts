import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent, type TouchEvent } from 'react';

const LONG_PRESS_MS = 400;
/** Finger travel (px) above which the gesture is a scroll/drag, not a press. */
const MOVE_TOLERANCE_PX = 10;
/** How long after the touchend of a fired press the ghost click / context menu is still expected. */
const GHOST_WINDOW_MS = 500;

interface LongPressHandlers {
    onTouchStart: (e: TouchEvent) => void;
    onTouchMove: (e: TouchEvent) => void;
    onTouchEnd: () => void;
    onTouchCancel: () => void;
    onContextMenu: (e: ReactMouseEvent) => void;
}

/**
 * Touch long-press (400 ms). `bind(arg)` returns the touch handlers for one
 * element and calls `onLongPress(arg)` after the hold. It is cancelled by
 * releasing, by moving the finger past a small tolerance, and by any scroll
 * (captured on the document, so a scrolling message list cancels it too).
 * Once it fires, the native context menu is suppressed and the single click
 * that follows the touchend is swallowed (capture phase, one-shot), so neither
 * closes the Popover the long press just opened.
 * One timer is shared: only one touch gesture is tracked at a time.
 */
export function useLongPress<T>(onLongPress: (arg: T) => void, delayMs: number = LONG_PRESS_MS): (arg: T) => LongPressHandlers {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const originRef = useRef<{ x: number; y: number } | null>(null);
    const callbackRef = useRef(onLongPress);
    useEffect(() => { callbackRef.current = onLongPress; }, [onLongPress]);

    // True from touchstart until GHOST_WINDOW_MS after the touchend of a fired press.
    const suppressRef = useRef(false);
    const firedRef = useRef(false);
    const ghostCleanupRef = useRef<(() => void) | null>(null);

    const clearGhost = useCallback(() => {
        ghostCleanupRef.current?.();
        ghostCleanupRef.current = null;
    }, []);

    /** Swallows the next click (capture) and stops suppressing after GHOST_WINDOW_MS. */
    const armGhostGuard = useCallback(() => {
        clearGhost();
        const swallow = (e: Event) => {
            e.stopPropagation();
            e.preventDefault();
            clearGhost();
        };
        document.addEventListener('click', swallow, true);
        const timeout = setTimeout(clearGhost, GHOST_WINDOW_MS);
        ghostCleanupRef.current = () => {
            document.removeEventListener('click', swallow, true);
            clearTimeout(timeout);
            suppressRef.current = false;
        };
    }, [clearGhost]);

    useEffect(() => clearGhost, [clearGhost]);

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
            clearGhost();
            firedRef.current = false;
            const t = e.touches[0];
            if (!t) return;
            suppressRef.current = true;
            originRef.current = { x: t.clientX, y: t.clientY };
            const cancel = cancelRef.current;
            document.addEventListener('scroll', cancel, true);
            timerRef.current = setTimeout(() => {
                cancel();
                firedRef.current = true;
                callbackRef.current(arg);
            }, delayMs);
        },
        onTouchMove: (e) => {
            const origin = originRef.current;
            const t = e.touches[0];
            if (!origin || !t) return;
            if (Math.hypot(t.clientX - origin.x, t.clientY - origin.y) > MOVE_TOLERANCE_PX) cancelRef.current();
        },
        onTouchEnd: () => {
            cancelRef.current();
            if (firedRef.current) armGhostGuard();
            else suppressRef.current = false;
            firedRef.current = false;
        },
        onTouchCancel: () => {
            cancelRef.current();
            if (firedRef.current) armGhostGuard();
            else suppressRef.current = false;
            firedRef.current = false;
        },
        onContextMenu: (e) => { if (suppressRef.current) e.preventDefault(); },
    }), [delayMs, clearGhost, armGhostGuard]);
}
