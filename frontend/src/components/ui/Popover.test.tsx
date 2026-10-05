// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import type { RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import Popover from './Popover';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// R3-popover-null-anchor-invisible-open: si el ancla desaparece (o nunca se
// asignó) mientras open=true, el popover no debe quedar "abierto" pero
// invisible para siempre (con su listener de Escape/click-fuera atrapado sin
// forma de cerrarlo); debe cerrarse solo.
describe('Popover', () => {
    it('se cierra a sí mismo si anchorRef.current es null mientras open=true', () => {
        const onClose = vi.fn();
        const anchorRef: RefObject<HTMLElement | null> = { current: null };
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(
                <Popover open onClose={onClose} anchorRef={anchorRef}>
                    <div>menu</div>
                </Popover>
            );
        });

        expect(onClose).toHaveBeenCalledTimes(1);

        act(() => { root.unmount(); });
        container.remove();
    });

    describe('menuNavigation (opt-in)', () => {
        afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

        const renderMenu = (menuNavigation: boolean | undefined) => {
            vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
            const anchor = document.createElement('button');
            document.body.appendChild(anchor);
            const anchorRef: RefObject<HTMLElement | null> = { current: anchor };
            const container = document.createElement('div');
            document.body.appendChild(container);
            const root = createRoot(container);
            const onClose = vi.fn();
            act(() => {
                root.render(
                    <Popover open onClose={onClose} anchorRef={anchorRef} menuNavigation={menuNavigation}>
                        <button type="button" role="menuitem">uno</button>
                        <button type="button" role="menuitem">dos</button>
                    </Popover>
                );
            });
            return { root, onClose };
        };
        const press = (key: string) => {
            act(() => { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
        };

        it('focuses the first menuitem once positioned and roves with the arrow keys', () => {
            const { root, onClose } = renderMenu(true);
            expect(document.activeElement?.textContent).toBe('uno');
            press('ArrowDown');
            expect(document.activeElement?.textContent).toBe('dos');
            press('ArrowDown');
            expect(document.activeElement?.textContent).toBe('uno');
            press('End');
            expect(document.activeElement?.textContent).toBe('dos');
            press('Escape');
            expect(onClose).toHaveBeenCalledTimes(1);
            act(() => { root.unmount(); });
        });

        it('is off by default (other popovers keep their focus behaviour)', () => {
            const { root } = renderMenu(undefined);
            expect(document.activeElement?.textContent).not.toBe('uno');
            act(() => { root.unmount(); });
        });
    });
});
