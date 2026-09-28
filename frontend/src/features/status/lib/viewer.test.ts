import { describe, it, expect } from 'vitest';
import {
    computeVideoProgressPercent,
    shouldResumeClockAfterDeleteAttempt,
    resetViewerStateForStatusChange,
    DEFAULT_DURATION_MS,
} from './viewer';

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

// ==================== R3-viewer-resume-untested ====================

describe('resetViewerStateForStatusChange', () => {
    it('siempre reanuda el reloj (paused:false) y reinicia progreso/hoja de vistos al cambiar de estado mostrado', () => {
        expect(resetViewerStateForStatusChange()).toEqual({
            showViewers: false,
            paused: false,
            elapsed: 0,
            progress: 0,
            durationMs: DEFAULT_DURATION_MS,
        });
    });

    it('reanuda incluso si el estado previo había quedado pausado a propósito tras un borrado exitoso (R3-delete-success-leaves-viewer-paused)', () => {
        // handleDelete deja paused=true tras un borrado exitoso a propósito
        // (shouldResumeClockAfterDeleteAttempt devuelve false ahí); es este
        // reset -- disparado por el cambio de currentStatus.ID que sigue al
        // borrado -- el que debe reanudarlo, no handleDelete.
        const resumesByItself = shouldResumeClockAfterDeleteAttempt({ confirmed: true, deleteSucceeded: true });
        expect(resumesByItself).toBe(false);

        expect(resetViewerStateForStatusChange().paused).toBe(false);
    });
});
