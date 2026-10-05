// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useMenuNavigation } from './useMenuNavigation';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Menu keyboard model (WAI-ARIA menu pattern): focus the first menuitem on open, then
// ArrowDown/ArrowUp rove (wrapping) and Home/End jump, skipping disabled items.

function Menu({ initiallyOpen = true }: { initiallyOpen?: boolean }) {
    const [open, setOpen] = useState(initiallyOpen);
    const ref = useRef<HTMLDivElement>(null);
    const onKeyDown = useMenuNavigation(ref, open);
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>abrir</button>
            {open && (
                <div role="menu" ref={ref} onKeyDown={onKeyDown}>
                    <button type="button" role="menuitem">uno</button>
                    <div className="border-t" />
                    <button type="button" role="menuitem" disabled>dos</button>
                    <button type="button" role="menuitem">tres</button>
                    <button type="button" role="menuitem">cuatro</button>
                </div>
            )}
        </>
    );
}

describe('useMenuNavigation', () => {
    let container: HTMLDivElement;
    let root: Root;
    const focused = () => document.activeElement?.textContent;
    const press = (key: string) => {
        const target = document.activeElement ?? document.body;
        const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        act(() => { target.dispatchEvent(ev); });
        return ev;
    };

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('focuses the first menuitem when it becomes active', () => {
        act(() => { root.render(<Menu initiallyOpen={false} />); });
        expect(focused()).not.toBe('uno');
        act(() => { container.querySelector('button')?.click(); });
        expect(focused()).toBe('uno');
    });

    it('ArrowDown / ArrowUp rove between enabled items and wrap; Home / End jump', () => {
        act(() => { root.render(<Menu />); });
        expect(focused()).toBe('uno');
        const ev = press('ArrowDown');
        expect(ev.defaultPrevented).toBe(true);
        expect(focused()).toBe('tres');
        press('ArrowDown');
        expect(focused()).toBe('cuatro');
        press('ArrowDown');
        expect(focused()).toBe('uno');
        press('ArrowUp');
        expect(focused()).toBe('cuatro');
        press('Home');
        expect(focused()).toBe('uno');
        press('End');
        expect(focused()).toBe('cuatro');
    });

    it('leaves other keys alone', () => {
        act(() => { root.render(<Menu />); });
        const ev = press('a');
        expect(ev.defaultPrevented).toBe(false);
        expect(focused()).toBe('uno');
    });
});
