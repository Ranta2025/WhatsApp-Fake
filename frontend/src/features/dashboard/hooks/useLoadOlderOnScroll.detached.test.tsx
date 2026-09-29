// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useLoadOlderOnScroll, FLASH_MS } from './useLoadOlderOnScroll';

// message-search (MS4): detached mode of useLoadOlderOnScroll - no tail scroll, loadNewer at the
// bottom, scroll-to-target (+ temporary highlight) and return to the bottom when re-attached.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface HarnessProps {
    chatKey: string;
    ids: number[];
    hasMore: boolean;
    loadingOlder: boolean;
    loadOlder: () => void;
    detached: boolean;
    hasMoreNewer: boolean;
    loadingNewer: boolean;
    loadNewer: () => void;
    scrollTarget: { id: number; seq: number } | null;
    onContainer: (el: HTMLDivElement) => void;
}

function Harness({ onContainer, ids, chatKey, hasMore, loadingOlder, loadOlder, detached, hasMoreNewer, loadingNewer, loadNewer, scrollTarget }: HarnessProps) {
    const ref = useRef<HTMLDivElement>(null);
    useLoadOlderOnScroll({
        containerRef: ref, chatKey, firstKey: ids[0], lastKey: ids[ids.length - 1],
        hasMore, loadingOlder, loadOlder, detached, hasMoreNewer, loadingNewer, loadNewer, scrollTarget,
    });
    return (
        <div ref={(node) => { (ref as { current: HTMLDivElement | null }).current = node; if (node) onContainer(node); }}>
            {ids.map(id => <div key={id} data-message-id={id} />)}
        </div>
    );
}

describe('useLoadOlderOnScroll detached mode', () => {
    let host: HTMLDivElement;
    let root: Root;
    let el: HTMLDivElement;
    let height = 5000;
    const CLIENT_HEIGHT = 400;
    const ITEM_HEIGHT = 40;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
        // Geometry: message N sits at top = N * 100 inside a container whose top is 0.
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            const id = this.getAttribute('data-message-id');
            const top = id === null ? 0 : Number(id) * 100 - (this.parentElement?.scrollTop ?? 0);
            const h = id === null ? CLIENT_HEIGHT : ITEM_HEIGHT;
            return { top, bottom: top + h, left: 0, right: 0, width: 0, height: h, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
        });
        height = 5000;
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    const base: Omit<HarnessProps, 'onContainer'> = {
        chatKey: 'A', ids: [8, 9, 10, 11, 12], hasMore: false, loadingOlder: false, loadOlder: vi.fn(),
        detached: true, hasMoreNewer: false, loadingNewer: false, loadNewer: vi.fn(), scrollTarget: { id: 10, seq: 1 },
    };

    const render = (over: Partial<Omit<HarnessProps, 'onContainer'>> = {}) => {
        act(() => {
            root.render(<Harness {...base} {...over} onContainer={(node) => {
                if (el !== node) {
                    el = node;
                    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => height });
                    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => CLIENT_HEIGHT });
                }
            }} />);
        });
    };

    const scrollTo = (top: number) => {
        el.scrollTop = top;
        act(() => { el.dispatchEvent(new Event('scroll')); });
    };
    const bubble = (id: number) => el.querySelector<HTMLElement>(`[data-message-id="${id}"]`);

    it('opens on the target (centered), not at the bottom, and flashes it temporarily', () => {
        render();
        // top 1000, height 40 in a 400px viewport -> 1000 - (400 - 40) / 2
        expect(el.scrollTop).toBe(820);
        expect(bubble(10)?.getAttribute('data-search-flash')).toBe('true');
        expect(bubble(9)?.hasAttribute('data-search-flash')).toBe(false);

        act(() => { vi.advanceTimersByTime(FLASH_MS + 10); });
        expect(bubble(10)?.hasAttribute('data-search-flash')).toBe(false);
    });

    it('does not follow the tail while detached (new last message keeps the scroll position)', () => {
        render();
        el.scrollTop = 300;
        render({ ids: [8, 9, 10, 11, 12, 13] });
        expect(el.scrollTop).toBe(300);
    });

    it('a new seq for the same target scrolls and flashes again; an unrelated re-render does not', () => {
        render();
        act(() => { vi.advanceTimersByTime(FLASH_MS + 10); });
        el.scrollTop = 0;

        render(); // same target and seq
        expect(el.scrollTop).toBe(0);

        render({ scrollTarget: { id: 10, seq: 2 } });
        expect(el.scrollTop).toBe(820);
        expect(bubble(10)?.getAttribute('data-search-flash')).toBe('true');
    });

    it('moving the target within the window scrolls to the new one and moves the flash', () => {
        render();
        render({ scrollTarget: { id: 12, seq: 2 } });
        expect(el.scrollTop).toBe(1200 - (CLIENT_HEIGHT - ITEM_HEIGHT) / 2);
        expect(bubble(12)?.getAttribute('data-search-flash')).toBe('true');
        expect(bubble(10)?.hasAttribute('data-search-flash')).toBe(false);
    });

    it('waits for the target bubble to be rendered before scrolling', () => {
        render({ ids: [] });
        expect(el.scrollTop).toBe(0);
        render({ ids: [8, 9, 10, 11, 12] });
        expect(el.scrollTop).toBe(820);
    });

    it('asks for newer messages near the bottom, only while detached with more newer and not loading', () => {
        const loadNewer = vi.fn();
        render({ loadNewer, hasMoreNewer: true });
        // maximum scrollTop = 5000 - 400 = 4600; within the 80px threshold of the bottom
        scrollTo(4560);
        expect(loadNewer).toHaveBeenCalledTimes(1);

        scrollTo(2000);
        expect(loadNewer).toHaveBeenCalledTimes(1);

        render({ loadNewer, hasMoreNewer: true, loadingNewer: true });
        scrollTo(4600);
        render({ loadNewer, hasMoreNewer: false });
        scrollTo(4600);
        expect(loadNewer).toHaveBeenCalledTimes(1);

        render({ loadNewer, hasMoreNewer: true, detached: false, scrollTarget: null });
        scrollTo(4600);
        expect(loadNewer).toHaveBeenCalledTimes(1);
    });

    it('still loads older near the top and anchors the view when older messages are prepended', () => {
        const loadOlder = vi.fn();
        render({ loadOlder, hasMore: true });
        scrollTo(10);
        expect(loadOlder).toHaveBeenCalledTimes(1);

        height = 5400; // +400px prepended above
        render({ loadOlder, hasMore: true, ids: [6, 7, 8, 9, 10, 11, 12] });
        expect(el.scrollTop).toBe(410);
    });

    it('returning to the latest messages (detached -> attached) jumps to the bottom instantly', () => {
        render();
        height = 6000;
        render({ detached: false, scrollTarget: null, ids: [90, 91, 92] });
        expect(el.scrollTop).toBe(6000);
    });

    it('switching to another chat while detached scrolls to that chat\'s target', () => {
        render();
        render({ chatKey: 'B', ids: [20, 21, 22], scrollTarget: { id: 21, seq: 1 } });
        expect(el.scrollTop).toBe(2100 - (CLIENT_HEIGHT - ITEM_HEIGHT) / 2);
    });

    it('attached mode is unchanged: opens at the bottom and ignores scrollTarget', () => {
        render({ detached: false, scrollTarget: null });
        expect(el.scrollTop).toBe(5000);
    });

    it('clears the flash timer on unmount without throwing', () => {
        render();
        act(() => root.unmount());
        expect(() => vi.advanceTimersByTime(FLASH_MS + 10)).not.toThrow();
        root = createRoot(host);
    });
});
