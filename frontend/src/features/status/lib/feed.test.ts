import { describe, it, expect } from 'vitest';
import {
    sortContacts,
    applyStatusNew,
    applyStatusDeleted,
    applyStatusViewedForOwner,
    nextTarget,
    contactsByTelephon,
} from './feed';
import type { StatusItem, StatusContactGroup, StatusOwnerBrief, StatusFeed } from '../../../types/api';

// applyStatusNew/applyStatusDeleted/applyStatusViewedForOwner operan sobre
// StatusFeed/StatusItem/StatusContactGroup reales: estas fábricas completan
// los campos que estos tests no ejercitan, para que los fixtures sigan
// siendo objetos StatusItem/StatusContactGroup válidos bajo `strict`.
const makeStatus = (overrides: Partial<StatusItem> = {}): StatusItem => ({
    id: 0,
    type: 'text',
    createdAt: '2024-01-01T00:00:00Z',
    expiresAt: '2024-01-02T00:00:00Z',
    viewed: false,
    viewCount: 0,
    ...overrides,
});

const makeOwner = (overrides: Partial<StatusOwnerBrief> = {}): StatusOwnerBrief => ({
    telephon: '000',
    username: 'owner',
    ...overrides,
});

const makeGroup = (overrides: Partial<StatusContactGroup> = {}): StatusContactGroup => ({
    telephon: '000',
    username: 'contact',
    statuses: [],
    allViewed: false,
    lastUpdated: '2024-01-01T00:00:00Z',
    ...overrides,
});

describe('sortContacts', () => {
    it('pone primero los grupos con estados sin ver', () => {
        const list = [
            { telephon: 'a', allViewed: true, lastUpdated: '2024-01-02T00:00:00Z' },
            { telephon: 'b', allViewed: false, lastUpdated: '2024-01-01T00:00:00Z' },
        ];
        expect(sortContacts(list).map(g => g.telephon)).toEqual(['b', 'a']);
    });

    it('dentro del mismo estado de visto, ordena por lastUpdated descendente', () => {
        const list = [
            { telephon: 'old', allViewed: false, lastUpdated: '2024-01-01T00:00:00Z' },
            { telephon: 'new', allViewed: false, lastUpdated: '2024-01-05T00:00:00Z' },
        ];
        expect(sortContacts(list).map(g => g.telephon)).toEqual(['new', 'old']);
    });

    it('no muta la lista original', () => {
        const list = [{ telephon: 'a', allViewed: true, lastUpdated: '2024-01-01T00:00:00Z' }];
        const sorted = sortContacts(list);
        expect(sorted).not.toBe(list);
    });
});

describe('applyStatusNew', () => {
    const owner = makeOwner({ telephon: '111', username: 'ana', contactName: 'Ana', avatarUrl: 'a.png' });
    const status = makeStatus({ id: 1, createdAt: '2024-01-01T00:00:00Z' });

    it('crea un grupo nuevo si el dueño no tenía estados', () => {
        const feed: StatusFeed = { mine: [], contacts: [] };
        const next = applyStatusNew(feed, owner, status);
        expect(next.contacts).toHaveLength(1);
        expect(next.contacts[0]).toMatchObject({ telephon: '111', allViewed: false, statuses: [status] });
    });

    it('agrega el estado a un grupo existente y lo marca como no-todo-visto', () => {
        const feed: StatusFeed = {
            mine: [],
            contacts: [makeGroup({ telephon: '111', username: 'ana', statuses: [makeStatus({ id: 0 })], allViewed: true, lastUpdated: '2023-12-31T00:00:00Z' })],
        };
        const next = applyStatusNew(feed, owner, status);
        expect(next.contacts[0]?.statuses).toHaveLength(2);
        expect(next.contacts[0]?.allViewed).toBe(false);
    });

    // R3-status-new-owner-fallback-unproved: el contrato (types/ws.ts) declara
    // `owner` no-nulo, pero el runtime no lo garantiza. Sin `owner.telephon` no
    // hay grupo de contacto al que agregar el estado — se ignora el evento en
    // vez de crear un grupo fantasma con teléfono vacío.
    it('ignora el evento (no cambia el feed) si owner no tiene telephon', () => {
        const feed: StatusFeed = { mine: [], contacts: [] };
        const next = applyStatusNew(feed, { telephon: '', username: '' }, status);
        expect(next).toBe(feed);
        expect(next.contacts).toHaveLength(0);
    });

    it('ignora el evento (no cambia el feed) si owner es null o undefined', () => {
        const feed: StatusFeed = { mine: [], contacts: [] };
        expect(applyStatusNew(feed, null, status)).toBe(feed);
        expect(applyStatusNew(feed, undefined, status)).toBe(feed);
    });
});

describe('applyStatusDeleted', () => {
    it('quita el estado de mine', () => {
        const feed: StatusFeed = { mine: [makeStatus({ id: 1 }), makeStatus({ id: 2 })], contacts: [] };
        const next = applyStatusDeleted(feed, 'x', 1);
        expect(next.mine.map(s => s.id)).toEqual([2]);
    });

    it('elimina el grupo entero si era su único estado', () => {
        const feed: StatusFeed = {
            mine: [],
            contacts: [makeGroup({ telephon: '111', statuses: [makeStatus({ id: 5, viewed: true })], allViewed: true, lastUpdated: '2024-01-01T00:00:00Z' })],
        };
        const next = applyStatusDeleted(feed, '111', 5);
        expect(next.contacts).toHaveLength(0);
    });

    it('si quedan otros estados, recalcula allViewed', () => {
        const feed: StatusFeed = {
            mine: [],
            contacts: [makeGroup({
                telephon: '111',
                statuses: [makeStatus({ id: 5, viewed: true }), makeStatus({ id: 6, viewed: false })],
                allViewed: false,
                lastUpdated: '2024-01-01T00:00:00Z',
            })],
        };
        const next = applyStatusDeleted(feed, '111', 6);
        expect(next.contacts[0]?.statuses.map(s => s.id)).toEqual([5]);
        expect(next.contacts[0]?.allViewed).toBe(true);
    });
});

describe('applyStatusViewedForOwner', () => {
    it('actualiza el viewCount del estado propio correspondiente', () => {
        const feed: StatusFeed = { mine: [makeStatus({ id: 1, viewCount: 0 }), makeStatus({ id: 2, viewCount: 3 })], contacts: [] };
        const next = applyStatusViewedForOwner(feed, { statusID: 1, viewCount: 4 });
        expect(next.mine).toEqual([makeStatus({ id: 1, viewCount: 4 }), makeStatus({ id: 2, viewCount: 3 })]);
    });
});

describe('contactsByTelephon', () => {
    it('indexa por teléfono', () => {
        const map = contactsByTelephon([{ telephon: 'a', x: 1 }, { telephon: 'b', x: 2 }]);
        expect(map).toEqual({ a: { telephon: 'a', x: 1 }, b: { telephon: 'b', x: 2 } });
    });

    it('con lista vacía o undefined devuelve objeto vacío', () => {
        expect(contactsByTelephon([])).toEqual({});
        expect(contactsByTelephon(undefined)).toEqual({});
    });
});

// ==================== R3-goNext-reorder ====================

describe('nextTarget', () => {
    it('salta al siguiente contacto con estados sin ver, según el snapshot de apertura', () => {
        const orderSnapshot = ['a', 'b', 'c'];
        const contacts = contactsByTelephon([
            { telephon: 'a', allViewed: true },
            { telephon: 'b', allViewed: true },
            { telephon: 'c', allViewed: false },
        ]);
        expect(nextTarget(orderSnapshot, contacts, 'a')).toEqual({ telephon: 'c', statusIndex: 0 });
    });

    it('no hace wrap-around: si no hay nada sin ver después del actual, devuelve null', () => {
        const orderSnapshot = ['a', 'b', 'c'];
        const contacts = contactsByTelephon([
            { telephon: 'a', allViewed: false }, // sin ver, pero está ANTES del actual
            { telephon: 'b', allViewed: true },
            { telephon: 'c', allViewed: true },
        ]);
        expect(nextTarget(orderSnapshot, contacts, 'b')).toBeNull();
    });

    it('reproduce el bug real: marcar visto el último estado reordena el feed en vivo, pero la navegación sigue el snapshot congelado', () => {
        // Al abrir el visor el feed tenía este orden: b (sin ver), a (sin ver), c (todo visto).
        const orderSnapshot = ['b', 'a', 'c'];
        // El usuario terminó de ver "b": el feed EN VIVO ya reordenó a b al final
        // (porque sortContacts pone los allViewed al final), así que en el array
        // en vivo "a" ahora aparece ANTES que "b". Si goNext buscara el índice de
        // "b" en ese array en vivo, i+1 apuntaría a "c" (todo visto) y cerraría el
        // visor saltándose "a", que todavía tiene estados sin ver.
        const liveContactsInNewOrder = contactsByTelephon([
            { telephon: 'a', allViewed: false },
            { telephon: 'c', allViewed: true },
            { telephon: 'b', allViewed: true },
        ]);
        expect(nextTarget(orderSnapshot, liveContactsInNewOrder, 'b')).toEqual({ telephon: 'a', statusIndex: 0 });
    });

    it('si el contacto actual no está en el snapshot, no encuentra nada (no revienta)', () => {
        expect(nextTarget(['a', 'b'], contactsByTelephon([{ telephon: 'a', allViewed: false }]), 'zzz')).toBeNull();
    });
});
