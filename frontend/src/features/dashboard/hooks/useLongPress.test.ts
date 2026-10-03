// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useLongPress } from './useLongPress';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const onLongPress = vi.fn();

const Harness = () => {
    const bind = useLongPress<number>(onLongPress);
    return createElement('div', { 'data-testid': 'target', ...bind(7) });
};

describe('useLongPress', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.useFakeTimers();
        onLongPress.mockClear();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => { root.render(createElement(Harness)); });
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.useRealTimers();
    });

    const target = () => container.querySelector('[data-testid="target"]') as HTMLElement;
    const touch = (type: string, x: number, y: number) => {
        const ev = new Event(type, { bubbles: true });
        Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
        act(() => { target().dispatchEvent(ev); });
    };

    it('fires with the bound argument after 400 ms of holding', () => {
        touch('touchstart', 10, 10);
        act(() => { vi.advanceTimersByTime(399); });
        expect(onLongPress).not.toHaveBeenCalled();
        act(() => { vi.advanceTimersByTime(1); });
        expect(onLongPress).toHaveBeenCalledExactlyOnceWith(7);
    });

    it('does not fire when released early', () => {
        touch('touchstart', 10, 10);
        act(() => { vi.advanceTimersByTime(200); });
        touch('touchend', 10, 10);
        act(() => { vi.advanceTimersByTime(1000); });
        expect(onLongPress).not.toHaveBeenCalled();
    });

    it('cancels when the finger moves more than the tolerance (scrolling)', () => {
        touch('touchstart', 10, 10);
        touch('touchmove', 10, 40);
        act(() => { vi.advanceTimersByTime(1000); });
        expect(onLongPress).not.toHaveBeenCalled();
    });

    it('tolerates a tiny finger jitter', () => {
        touch('touchstart', 10, 10);
        touch('touchmove', 12, 11);
        act(() => { vi.advanceTimersByTime(400); });
        expect(onLongPress).toHaveBeenCalledTimes(1);
    });

    it('cancels when an ancestor scrolls', () => {
        touch('touchstart', 10, 10);
        act(() => { container.dispatchEvent(new Event('scroll')); document.dispatchEvent(new Event('scroll')); });
        act(() => { vi.advanceTimersByTime(1000); });
        expect(onLongPress).not.toHaveBeenCalled();
    });
});
