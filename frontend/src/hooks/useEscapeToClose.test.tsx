// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useEscapeToClose, ESCAPE_HANDLED_FLAG, isEscapeHandled } from './useEscapeToClose';

type FlaggedKeyboardEvent = KeyboardEvent & Record<string, unknown>;

// React exige esta marca global para reconocer el entorno de test como
// compatible con act(...) (createRoot no la detecta sola bajo Vitest+jsdom).
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// R3-escape-stack-untested: cubre, con un DOM real, la semántica de pila que
// antes solo vivía (sin tests) dentro del listener de captura del hook:
// topmost-only, reactivación de la capa de abajo, capas deshabilitadas y
// desmontaje. También cubre R3-escape-capture-swallows-unregistered-handlers:
// el hook ya no debe usar stopPropagation para "silenciar" handlers propios
// del componente (p. ej. cancelar respuesta/edición) que no pasan por la
// pila; en su lugar marca el evento con ESCAPE_HANDLED_FLAG para que ese
// código decida.

interface TwoLayersProps {
    aEnabled?: boolean;
    bEnabled?: boolean;
    onCloseA: () => void;
    onCloseB: () => void;
}

function TwoLayers({ aEnabled, bEnabled, onCloseA, onCloseB }: TwoLayersProps) {
    useEscapeToClose(onCloseA, aEnabled);
    useEscapeToClose(onCloseB, bEnabled);
    return null;
}

function pressEscape(): boolean {
    let handledFlag = false;
    act(() => {
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        document.dispatchEvent(event);
        handledFlag = Boolean((event as FlaggedKeyboardEvent)[ESCAPE_HANDLED_FLAG]);
    });
    return handledFlag;
}

describe('useEscapeToClose', () => {
    let container!: HTMLDivElement;
    let root!: Root;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('Escape cierra solo la capa superior (topmost only)', () => {
        const onCloseA = vi.fn();
        const onCloseB = vi.fn();
        act(() => {
            root.render(<TwoLayers aEnabled bEnabled onCloseA={onCloseA} onCloseB={onCloseB} />);
        });

        pressEscape();

        expect(onCloseB).toHaveBeenCalledTimes(1);
        expect(onCloseA).not.toHaveBeenCalled();
    });

    it('al cerrar la capa superior, la de abajo reacciona en la siguiente pulsación', () => {
        const onCloseA = vi.fn();
        let bEnabled = true;
        const onCloseB = vi.fn(() => {
            bEnabled = false;
            act(() => {
                root.render(<TwoLayers aEnabled bEnabled={bEnabled} onCloseA={onCloseA} onCloseB={onCloseB} />);
            });
        });
        act(() => {
            root.render(<TwoLayers aEnabled bEnabled={bEnabled} onCloseA={onCloseA} onCloseB={onCloseB} />);
        });

        pressEscape(); // cierra B (y B se deshabilita/desmonta)
        pressEscape(); // ahora debe cerrar A

        expect(onCloseB).toHaveBeenCalledTimes(1);
        expect(onCloseA).toHaveBeenCalledTimes(1);
    });

    it('una capa con enabled=false no participa en la pila', () => {
        const onCloseA = vi.fn();
        act(() => {
            root.render(<TwoLayers aEnabled={false} bEnabled={false} onCloseA={onCloseA} onCloseB={vi.fn()} />);
        });

        const handled = pressEscape();

        expect(handled).toBeFalsy();
        expect(onCloseA).not.toHaveBeenCalled();
    });

    it('al desmontar el componente, su capa deja de reaccionar a Escape', () => {
        const onCloseA = vi.fn();
        const onCloseB = vi.fn();
        act(() => {
            root.render(<TwoLayers aEnabled bEnabled onCloseA={onCloseA} onCloseB={onCloseB} />);
        });
        act(() => { root.unmount(); });
        root = createRoot(container); // nada montado: la pila debe estar vacía

        const handled = pressEscape();

        expect(handled).toBeFalsy();
        expect(onCloseA).not.toHaveBeenCalled();
        expect(onCloseB).not.toHaveBeenCalled();
    });

    it('no detiene la propagación: un listener ajeno (no registrado vía el hook) igual recibe Escape, marcado como manejado', () => {
        const onCloseA = vi.fn();
        const unrelatedListener = vi.fn();
        document.addEventListener('keydown', unrelatedListener);
        act(() => {
            root.render(<TwoLayers aEnabled bEnabled={false} onCloseA={onCloseA} onCloseB={vi.fn()} />);
        });

        const handled = pressEscape();

        expect(onCloseA).toHaveBeenCalledTimes(1);
        expect(handled).toBe(true);
        // El listener ajeno igual se ejecuta: el hook no llama stopPropagation.
        expect(unrelatedListener).toHaveBeenCalledTimes(1);
        const receivedEvent = unrelatedListener.mock.calls[0]?.[0] as FlaggedKeyboardEvent;
        expect(receivedEvent[ESCAPE_HANDLED_FLAG]).toBe(true);

        document.removeEventListener('keydown', unrelatedListener);
    });
});

// R3-escape-flag-read-on-synthetic-event: el flag se marca en el evento
// NATIVO; los handlers de React reciben un evento sintético que no lo tiene.
describe('isEscapeHandled', () => {
    it('lee el flag desde nativeEvent en un evento sintético de React', () => {
        expect(isEscapeHandled({ nativeEvent: { [ESCAPE_HANDLED_FLAG]: true } })).toBe(true);
    });

    it('lee el flag directamente de un evento nativo', () => {
        expect(isEscapeHandled({ [ESCAPE_HANDLED_FLAG]: true })).toBe(true);
    });

    it('es false cuando ninguna capa manejó la tecla', () => {
        expect(isEscapeHandled({ nativeEvent: {} })).toBe(false);
    });
});
