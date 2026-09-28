// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
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
        const anchorRef = { current: null };
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
});
