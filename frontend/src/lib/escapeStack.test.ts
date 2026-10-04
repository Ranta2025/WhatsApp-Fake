import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pushEscapeLayer, popEscapeLayer, triggerTopEscapeLayer, hasEscapeLayers, __resetEscapeStackForTests } from './escapeStack';

// R3-escape-stack-untested: la pila de "capas cerrables con Escape" (antes
// enterrada dentro de useEscapeToClose.js con stopPropagation) no tenía
// ningún test de su semántica. Se extrajo a este módulo puro (sin DOM) para
// poder probar topmost-only, reactivación de la capa de abajo, capas nunca
// agregadas (deshabilitadas) y remoción (desmontaje) sin renderizar nada.
describe('escapeStack', () => {
    beforeEach(() => {
        __resetEscapeStackForTests();
    });

    it('Escape cierra solo la capa superior (topmost only)', () => {
        const closeA = vi.fn();
        const closeB = vi.fn();
        pushEscapeLayer(closeA);
        pushEscapeLayer(closeB);

        const handled = triggerTopEscapeLayer();

        expect(handled).toBe(true);
        expect(closeB).toHaveBeenCalledTimes(1);
        expect(closeA).not.toHaveBeenCalled();
    });

    it('al quitar la capa superior (equivalente a que se cierre/desmonte), la de abajo vuelve a reaccionar', () => {
        const closeA = vi.fn();
        const closeB = vi.fn();
        pushEscapeLayer(closeA);
        const idB = pushEscapeLayer(closeB);

        triggerTopEscapeLayer(); // cierra B
        popEscapeLayer(idB); // B se desmonta/deshabilita tras cerrarse

        const handled = triggerTopEscapeLayer(); // ahora debe cerrar A

        expect(handled).toBe(true);
        expect(closeA).toHaveBeenCalledTimes(1);
        expect(closeB).toHaveBeenCalledTimes(1); // sigue en 1, no se volvió a llamar
    });

    it('una capa nunca agregada (deshabilitada) no participa en la pila', () => {
        // Simula useEscapeToClose(onClose, false): el hook nunca llama a
        // pushEscapeLayer si enabled es false, así que no hay nada que cerrar.
        expect(hasEscapeLayers()).toBe(false);
        expect(triggerTopEscapeLayer()).toBe(false);
    });

    it('quitar una capa (equivalente a desmontar el componente) hace que deje de participar', () => {
        const closeA = vi.fn();
        const idA = pushEscapeLayer(closeA);
        expect(hasEscapeLayers()).toBe(true);

        popEscapeLayer(idA);

        expect(hasEscapeLayers()).toBe(false);
        expect(triggerTopEscapeLayer()).toBe(false);
        expect(closeA).not.toHaveBeenCalled();
    });
});
