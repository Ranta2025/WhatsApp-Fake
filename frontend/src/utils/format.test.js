import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatStatusTimestamp, formatTime } from './format';

// El entorno de test (Node) puede tener un locale por defecto distinto al del
// navegador (p. ej. en-US con reloj 12h, en vez de es con reloj 24h). Estos
// tests verifican el BRANCH elegido (hoy/ayer/más antiguo) y la hora exacta
// delegando el formato de hora/fecha a las mismas funciones que usa la fuente
// (formatTime / toLocaleDateString), en vez de asumir un locale concreto.
const shortDate = (date) => date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });

// ==================== R3-missing-tests (formatStatusTimestamp) ====================

describe('formatStatusTimestamp', () => {
    beforeEach(() => {
        // "Ahora" fijo: 15 de marzo de 2024, 14:30 local.
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2024, 2, 15, 14, 30, 0));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('devuelve cadena vacía sin valor', () => {
        expect(formatStatusTimestamp(null)).toBe('');
        expect(formatStatusTimestamp(undefined)).toBe('');
        expect(formatStatusTimestamp('')).toBe('');
    });

    it('"Hoy a las HH:mm" si es el mismo día', () => {
        const today9am = new Date(2024, 2, 15, 9, 5, 0);
        expect(formatStatusTimestamp(today9am)).toBe(`Hoy a las ${formatTime(today9am)}`);
    });

    it('el límite justo antes de medianoche del mismo día sigue siendo "Hoy"', () => {
        const todayLate = new Date(2024, 2, 15, 23, 59, 59);
        expect(formatStatusTimestamp(todayLate)).toContain('Hoy a las');
    });

    it('"Ayer a las HH:mm" si es el día calendario anterior', () => {
        const yesterday = new Date(2024, 2, 14, 20, 0, 0);
        expect(formatStatusTimestamp(yesterday)).toBe(`Ayer a las ${formatTime(yesterday)}`);
    });

    it('el límite justo después de medianoche de ayer ya no es "Hoy" ni "Ayer" si cae dos días atrás', () => {
        const twoDaysAgoLate = new Date(2024, 2, 13, 23, 59, 59);
        const formatted = formatStatusTimestamp(twoDaysAgoLate);
        expect(formatted).not.toContain('Hoy');
        expect(formatted).not.toContain('Ayer');
    });

    it('fecha corta con hora para cualquier día anterior a ayer', () => {
        const older = new Date(2024, 2, 10, 8, 15, 0);
        const formatted = formatStatusTimestamp(older);
        expect(formatted).toBe(`${shortDate(older)} a las ${formatTime(older)}`);
    });

    it('funciona también cruzando el cambio de mes/año (más antiguo)', () => {
        const lastYear = new Date(2023, 11, 31, 23, 0, 0);
        expect(formatStatusTimestamp(lastYear)).toBe(`${shortDate(lastYear)} a las ${formatTime(lastYear)}`);
    });
});
