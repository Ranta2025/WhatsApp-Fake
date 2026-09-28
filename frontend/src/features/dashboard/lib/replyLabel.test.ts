import { describe, it, expect } from 'vitest';
import { replySenderLabel } from './replyLabel';

// MessageInput.jsx read `replyingTo.SenderUsername`, a field `Message`
// (types/api.ts) never has (pre-existing, flagged in M5/M6 notes) — always
// `undefined` at runtime, silently falling back to the generic 'mensaje'
// even when replying to a real contact. In a 1:1 chat the only two possible
// senders are "me" and the currently `selected` contact, so the fix reads
// the display name off `selected` instead.
describe('replySenderLabel', () => {
    it('devuelve "ti mismo" cuando el remitente soy yo', () => {
        expect(replySenderLabel({ SenderTelephon: '111' }, '111', { ContactName: 'Ana', Username: 'ana' })).toBe('ti mismo');
    });

    it('usa el ContactName del contacto seleccionado cuando el remitente es otro', () => {
        expect(replySenderLabel({ SenderTelephon: '222' }, '111', { ContactName: 'Ana', Username: 'ana' })).toBe('Ana');
    });

    it('cae a Username si el contacto no tiene ContactName', () => {
        expect(replySenderLabel({ SenderTelephon: '222' }, '111', { ContactName: null, Username: 'ana' })).toBe('ana');
    });

    it('cae a "mensaje" si no hay ContactName ni Username', () => {
        expect(replySenderLabel({ SenderTelephon: '222' }, '111', { ContactName: null, Username: '' })).toBe('mensaje');
    });
});
