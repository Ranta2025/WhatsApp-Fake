// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import type { RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import StickerPanel from './StickerPanel';
import { BUILTIN_PACKS } from './builtinPack';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// SB4: the panel is a Popover grid of the built-in basic pack. A click both
// sends (via `onSelect`) and closes; Escape and an outside press close it too.
// The buttons are native, focusable and labelled with the sticker's alt.
describe('StickerPanel', () => {
    let container: HTMLDivElement;
    let root: Root;
    let anchor: HTMLButtonElement;
    let anchorRef: RefObject<HTMLElement | null>;
    const onSelect = vi.fn();
    const onClose = vi.fn();

    const stickers = BUILTIN_PACKS.find((pack) => pack.id === 'basic')!.stickers;

    const render = () => {
        act(() => {
            root.render(<StickerPanel anchorRef={anchorRef} onSelect={onSelect} onClose={onClose} />);
        });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // The popover repositions through requestAnimationFrame; run it
        // synchronously so the test observes the final paint in one act().
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
        anchor = document.createElement('button');
        document.body.appendChild(anchor);
        anchorRef = { current: anchor };
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        vi.unstubAllGlobals();
        document.body.innerHTML = '';
    });

    it('renders the basic pack as 4-column thumbnails with alt labels', () => {
        render();

        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label]'));
        expect(buttons).toHaveLength(stickers.length);

        stickers.forEach((sticker) => {
            const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${sticker.alt}"]`);
            expect(button).not.toBeNull();
            expect(button!.className).toContain('w-16');
            expect(button!.querySelector('img')?.getAttribute('src')).toBe(sticker.url);
        });
    });

    it('selects a sticker with one click, sending its url and closing', () => {
        render();
        const first = stickers[0]!;

        act(() => {
            document.querySelector<HTMLButtonElement>(`button[aria-label="${first.alt}"]`)?.click();
        });

        expect(onSelect).toHaveBeenCalledWith(first.url);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('sticker buttons are focusable native buttons (keyboard accessible)', () => {
        render();
        const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${stickers[0]!.alt}"]`)!;

        act(() => { button.focus(); });

        expect(document.activeElement).toBe(button);
        expect(button.getAttribute('type')).toBe('button');
    });

    it('closes on Escape', () => {
        render();

        act(() => {
            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        });

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on an outside pointerdown', () => {
        render();

        act(() => {
            document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        });

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
