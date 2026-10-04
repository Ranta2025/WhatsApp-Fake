// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useExpiryTimer } from './useExpiryTimer';
import { MAX_EXPIRY_DELAY_MS } from '../lib/disappearing';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ earliest, onExpire, maxDelayMs }: { earliest: number | null; onExpire: (now: number) => void; maxDelayMs?: number }) {
    useExpiryTimer({ earliest, onExpire, now: () => Date.now(), ...(maxDelayMs !== undefined ? { maxDelayMs } : {}) });
    return null;
}

describe('useExpiryTimer', () => {
    let host: HTMLDivElement;
    let root: Root;
    const T0 = Date.parse('2026-01-01T12:00:00Z');

    const render = (props: { earliest: number | null; onExpire: (now: number) => void; maxDelayMs?: number }) =>
        act(() => { root.render(<Harness {...props} />); });

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(T0);
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    });
    afterEach(() => {
        act(() => root.unmount());
        host.remove();
        vi.useRealTimers();
    });

    it('arms nothing when no message expires', () => {
        render({ earliest: null, onExpire: vi.fn() });
        expect(vi.getTimerCount()).toBe(0);
    });

    it('fires once at the earliest expiry with the current clock', () => {
        const onExpire = vi.fn();
        render({ earliest: T0 + 5000, onExpire });
        expect(vi.getTimerCount()).toBe(1);
        act(() => { vi.advanceTimersByTime(4999); });
        expect(onExpire).not.toHaveBeenCalled();
        act(() => { vi.advanceTimersByTime(1); });
        expect(onExpire).toHaveBeenCalledTimes(1);
        expect(onExpire).toHaveBeenCalledWith(T0 + 5000);
    });

    it('keeps a single timer and re-arms when the earliest expiry changes', () => {
        const onExpire = vi.fn();
        render({ earliest: T0 + 60_000, onExpire });
        render({ earliest: T0 + 2000, onExpire });
        expect(vi.getTimerCount()).toBe(1);
        act(() => { vi.advanceTimersByTime(2000); });
        expect(onExpire).toHaveBeenCalledTimes(1);
        // the owner removed the message: next earliest is later
        render({ earliest: T0 + 10_000, onExpire });
        expect(vi.getTimerCount()).toBe(1);
        act(() => { vi.advanceTimersByTime(8000); });
        expect(onExpire).toHaveBeenCalledTimes(2);
    });

    it('an already past expiry fires immediately (never a negative delay)', () => {
        const onExpire = vi.fn();
        render({ earliest: T0 - 5000, onExpire });
        act(() => { vi.advanceTimersByTime(0); });
        expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it('caps the delay and re-arms itself when the cap fires before the expiry', () => {
        const onExpire = vi.fn();
        const far = T0 + 3 * MAX_EXPIRY_DELAY_MS + 1000;
        render({ earliest: far, onExpire });
        act(() => { vi.advanceTimersByTime(MAX_EXPIRY_DELAY_MS); });
        expect(onExpire).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(1); // re-armed even though earliest did not change
        act(() => { vi.advanceTimersByTime(MAX_EXPIRY_DELAY_MS); });
        expect(onExpire).toHaveBeenCalledTimes(2);
        act(() => { vi.advanceTimersByTime(MAX_EXPIRY_DELAY_MS); });
        expect(onExpire).toHaveBeenCalledTimes(3);
        act(() => { vi.advanceTimersByTime(1000); });
        expect(onExpire).toHaveBeenCalledTimes(4);
        expect(onExpire).toHaveBeenLastCalledWith(far);
    });

    it('clears the timer on unmount', () => {
        render({ earliest: T0 + 5000, onExpire: vi.fn() });
        act(() => root.unmount());
        expect(vi.getTimerCount()).toBe(0);
        root = createRoot(host);
    });
});
