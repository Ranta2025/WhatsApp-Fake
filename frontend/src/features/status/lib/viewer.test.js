import { describe, it, expect } from 'vitest';
import { computeVideoProgressPercent, shouldResumeClockAfterDeleteAttempt } from './viewer';

// ==================== R3-video-wallclock ====================

describe('computeVideoProgressPercent', () => {
    it('calcula el porcentaje a partir de currentTime/duration', () => {
        expect(computeVideoProgressPercent(5, 10)).toBe(50);
        expect(computeVideoProgressPercent(0, 10)).toBe(0);
        expect(computeVideoProgressPercent(10, 10)).toBe(100);
    });

    it('nunca supera 100 aunque currentTime exceda duration (por redondeos del navegador)', () => {
        expect(computeVideoProgressPercent(10.5, 10)).toBe(100);
    });

    it('devuelve 0 si la duración todavía no es válida (NaN/0/Infinity, metadata no cargó aún)', () => {
        expect(computeVideoProgressPercent(3, NaN)).toBe(0);
        expect(computeVideoProgressPercent(3, 0)).toBe(0);
        expect(computeVideoProgressPercent(3, Infinity)).toBe(0);
    });

    it('devuelve 0 con currentTime inválido en vez de propagar NaN', () => {
        expect(computeVideoProgressPercent(NaN, 10)).toBe(0);
        expect(computeVideoProgressPercent(-1, 10)).toBe(0);
    });
});

// ==================== R3-delete-timer-race ====================

describe('shouldResumeClockAfterDeleteAttempt', () => {
    it('reanuda si el usuario canceló el diálogo de confirmación', () => {
        expect(shouldResumeClockAfterDeleteAttempt({ confirmed: false, deleteSucceeded: false })).toBe(true);
    });

    it('reanuda si se confirmó pero el borrado falló (sigue viendo el mismo estado)', () => {
        expect(shouldResumeClockAfterDeleteAttempt({ confirmed: true, deleteSucceeded: false })).toBe(true);
    });

    it('NO reanuda si se confirmó y el borrado tuvo éxito (evita el stale tick tras borrar)', () => {
        expect(shouldResumeClockAfterDeleteAttempt({ confirmed: true, deleteSucceeded: true })).toBe(false);
    });
});
