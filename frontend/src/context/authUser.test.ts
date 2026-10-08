import { describe, it, expect } from 'vitest';
import { toUser } from './authUser';

// R3-toUser-null-body-guard-removed: el backend puede devolver un cuerpo
// vacío/null en `/api/v1/user` (204, sesión recién creada, respuesta
// malformada); la versión JS toleraba eso con `data?.Username` etc. y
// devolvía un usuario "vacío" en vez de lanzar. Tipar `data: UserGet`
// (no-nulo) quitó ese guard. `toUser` ahora toma `data: unknown` y hace el
// narrowing a mano.

describe('toUser', () => {
    it('returns an empty tolerant user for a null body (does not throw)', () => {
        expect(toUser(null)).toEqual({ username: '', telephon: '', avatar: '' });
    });

    it('returns an empty tolerant user for an undefined body', () => {
        expect(toUser(undefined)).toEqual({ username: '', telephon: '', avatar: '' });
    });

    it('returns an empty tolerant user for an empty object body', () => {
        expect(toUser({})).toEqual({ username: '', telephon: '', avatar: '' });
    });

    it('maps a real UserGet body', () => {
        expect(toUser({ username: 'ana', telephon: '5551234', avatarUrl: 'x.png' }))
            .toEqual({ username: 'ana', telephon: '5551234', avatar: 'x.png' });
    });
});
