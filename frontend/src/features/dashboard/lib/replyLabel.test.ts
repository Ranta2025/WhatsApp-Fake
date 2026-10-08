import { describe, it, expect } from 'vitest';
import { replySenderLabel } from './replyLabel';

// MessageInput.jsx read `replyingTo.SenderUsername`, a field `Message`
// (types/api.ts) never has (pre-existing, flagged in M5/M6 notes) — always
// `undefined` at runtime, silently falling back to the generic 'mensaje'
// even when replying to a real contact. In a 1:1 chat the only two possible
// senders are "me" and the currently `selected` contact, so the fix reads
// the display name off `selected` instead.
//
// M6b item 3: the helper must not assume a 1:1 chat. A group reply can come
// from any member, so `members` (the group member list) resolves the sender
// name when provided; and `myTelephon` may be undefined while the profile
// loads, which must not be mistaken for "me".
describe('replySenderLabel (1:1)', () => {
    it('devuelve "ti mismo" cuando el remitente soy yo', () => {
        expect(replySenderLabel({ senderTelephon: '111' }, '111', { contactName: 'Ana', username: 'ana' })).toBe('ti mismo');
    });

    it('usa el ContactName del contacto seleccionado cuando el remitente es otro', () => {
        expect(replySenderLabel({ senderTelephon: '222' }, '111', { contactName: 'Ana', username: 'ana' })).toBe('Ana');
    });

    it('cae a Username si el contacto no tiene ContactName', () => {
        expect(replySenderLabel({ senderTelephon: '222' }, '111', { contactName: null, username: 'ana' })).toBe('ana');
        expect(replySenderLabel({ senderTelephon: '222' }, '111', { contactName: undefined, username: 'ana' })).toBe('ana');
    });

    it('cae a "mensaje" si no hay ContactName ni Username', () => {
        expect(replySenderLabel({ senderTelephon: '222' }, '111', { contactName: null, username: '' })).toBe('mensaje');
    });

    it('cae a "mensaje" si no hay chat seleccionado', () => {
        expect(replySenderLabel({ senderTelephon: '222' }, '111', null)).toBe('mensaje');
        expect(replySenderLabel({ senderTelephon: '222' }, '111', undefined)).toBe('mensaje');
    });

    it('no dice "ti mismo" cuando myTelephon es undefined y el mensaje no trae senderTelephon', () => {
        // profile may still be loading; senderTelephon can be missing on
        // untrusted network data — the two undefineds must not compare equal.
        const sender = {} as { senderTelephon: string };
        expect(replySenderLabel(sender, undefined, { contactName: 'Ana', username: 'ana' })).toBe('Ana');
    });
});

describe('replySenderLabel (group)', () => {
    const members = [
        { Telephon: '222', Username: 'bob', ContactName: 'Bob' },
        { Telephon: '333', Username: 'carol', ContactName: null },
    ];

    it('resuelve el nombre desde la lista de miembros', () => {
        expect(replySenderLabel({ senderTelephon: '222' }, '111', null, members)).toBe('Bob');
    });

    it('cae al Username del miembro si no tiene ContactName', () => {
        expect(replySenderLabel({ senderTelephon: '333' }, '111', null, members)).toBe('carol');
    });

    it('cae al teléfono si el remitente no está en la lista de miembros', () => {
        expect(replySenderLabel({ senderTelephon: '999' }, '111', null, members)).toBe('999');
    });

    it('devuelve "ti mismo" para mis propios mensajes en un grupo', () => {
        expect(replySenderLabel({ senderTelephon: '111' }, '111', null, members)).toBe('ti mismo');
    });
});
