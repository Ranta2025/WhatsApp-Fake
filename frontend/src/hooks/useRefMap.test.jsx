// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useRefMap } from './useRefMap';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ onReady }) {
    const getRef = useRefMap();
    onReady(getRef);
    return null;
}

function renderHarness() {
    let getRef;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(<Harness onReady={(g) => { getRef = g; }} />);
    });
    return { getRef, root, container };
}

describe('useRefMap', () => {
    it('devuelve el mismo objeto ref para la misma clave entre llamadas', () => {
        const { getRef } = renderHarness();
        expect(getRef('a')).toBe(getRef('a'));
    });

    // R3-refmap-unbounded: las entradas nunca se borraban (un mensaje o
    // miembro que desaparece de la lista dejaba su ref colgando en el Map
    // para siempre). release(key) debe borrar la entrada: pedir la misma
    // clave después debe devolver un ref NUEVO, no el mismo objeto arrastrado
    // (que además, sin el fix, podría conservar un valor .current obsoleto).
    it('release(key) borra la entrada: una nueva petición de la misma clave devuelve un ref nuevo', () => {
        const { getRef } = renderHarness();
        const first = getRef('msg-1');
        first.current = document.createElement('button');

        getRef.release('msg-1');

        const second = getRef('msg-1');
        expect(second).not.toBe(first);
        expect(second.current).toBeNull();
    });
});
