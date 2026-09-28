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
    ID: 0,
    Type: 'text',
    CreatedAt: '2024-01-01T00:00:00Z',
    ExpiresAt: '2024-01-02T00:00:00Z',
    Viewed: false,
    ViewCount: 0,
    ...overrides,
});

const makeOwner = (overrides: Partial<StatusOwnerBrief> = {}): StatusOwnerBrief => ({
    Telephon: '000',
    Username: 'owner',
    ...overrides,
});

const makeGroup = (overrides: Partial<StatusContactGroup> = {}): StatusContactGroup => ({
    Telephon: '000',
    Username: 'contact',
    Statuses: [],
    AllViewed: false,
    LastUpdated: '2024-01-01T00:00:00Z',
    ...overrides,
});

describe('sortContacts', () => {
    it('pone primero los grupos con estados sin ver', () => {
        const list = [
            { Telephon: 'a', AllViewed: true, LastUpdated: '2024-01-02T00:00:00Z' },
            { Telephon: 'b', AllViewed: false, LastUpdated: '2024-01-01T00:00:00Z' },
        ];
        expect(sortContacts(list).map(g => g.Telephon)).toEqual(['b', 'a']);
    });

    it('dentro del mismo estado de visto, ordena por LastUpdated descendente', () => {
        const list = [
            { Telephon: 'old', AllViewed: false, LastUpdated: '2024-01-01T00:00:00Z' },
            { Telephon: 'new', AllViewed: false, LastUpdated: '2024-01-05T00:00:00Z' },
        ];
        expect(sortContacts(list).map(g => g.Telephon)).toEqual(['new', 'old']);
    });

    it('no muta la lista original', () => {
        const list = [{ Telephon: 'a', AllViewed: true, LastUpdated: '2024-01-01T00:00:00Z' }];
        const sorted = sortContacts(list);
        expect(sorted).not.toBe(list);
    });
});

describe('applyStatusNew', () => {
    const owner = makeOwner({ Telephon: '111', Username: 'ana', ContactName: 'Ana', AvatarUrl: 'a.png' });
    const status = makeStatus({ ID: 1, CreatedAt: '2024-01-01T00:00:00Z' });

    it('crea un grupo nuevo si el dueño no tenía estados', () => {
        const feed: StatusFeed = { Mine: [], Contacts: [] };
        const next = applyStatusNew(feed, owner, status);
        expect(next.Contacts).toHaveLength(1);
        expect(next.Contacts[0]).toMatchObject({ Telephon: '111', AllViewed: false, Statuses: [status] });
    });

    it('agrega el estado a un grupo existente y lo marca como no-todo-visto', () => {
        const feed: StatusFeed = {
            Mine: [],
            Contacts: [makeGroup({ Telephon: '111', Username: 'ana', Statuses: [makeStatus({ ID: 0 })], AllViewed: true, LastUpdated: '2023-12-31T00:00:00Z' })],
        };
        const next = applyStatusNew(feed, owner, status);
        expect(next.Contacts[0]?.Statuses).toHaveLength(2);
        expect(next.Contacts[0]?.AllViewed).toBe(false);
    });
});

describe('applyStatusDeleted', () => {
    it('quita el estado de Mine', () => {
        const feed: StatusFeed = { Mine: [makeStatus({ ID: 1 }), makeStatus({ ID: 2 })], Contacts: [] };
        const next = applyStatusDeleted(feed, 'x', 1);
        expect(next.Mine.map(s => s.ID)).toEqual([2]);
    });

    it('elimina el grupo entero si era su único estado', () => {
        const feed: StatusFeed = {
            Mine: [],
            Contacts: [makeGroup({ Telephon: '111', Statuses: [makeStatus({ ID: 5, Viewed: true })], AllViewed: true, LastUpdated: '2024-01-01T00:00:00Z' })],
        };
        const next = applyStatusDeleted(feed, '111', 5);
        expect(next.Contacts).toHaveLength(0);
    });

    it('si quedan otros estados, recalcula AllViewed', () => {
        const feed: StatusFeed = {
            Mine: [],
            Contacts: [makeGroup({
                Telephon: '111',
                Statuses: [makeStatus({ ID: 5, Viewed: true }), makeStatus({ ID: 6, Viewed: false })],
                AllViewed: false,
                LastUpdated: '2024-01-01T00:00:00Z',
            })],
        };
        const next = applyStatusDeleted(feed, '111', 6);
        expect(next.Contacts[0]?.Statuses.map(s => s.ID)).toEqual([5]);
        expect(next.Contacts[0]?.AllViewed).toBe(true);
    });
});

describe('applyStatusViewedForOwner', () => {
    it('actualiza el ViewCount del estado propio correspondiente', () => {
        const feed: StatusFeed = { Mine: [makeStatus({ ID: 1, ViewCount: 0 }), makeStatus({ ID: 2, ViewCount: 3 })], Contacts: [] };
        const next = applyStatusViewedForOwner(feed, { statusId: 1, viewCount: 4 });
        expect(next.Mine).toEqual([makeStatus({ ID: 1, ViewCount: 4 }), makeStatus({ ID: 2, ViewCount: 3 })]);
    });
});

describe('contactsByTelephon', () => {
    it('indexa por teléfono', () => {
        const map = contactsByTelephon([{ Telephon: 'a', x: 1 }, { Telephon: 'b', x: 2 }]);
        expect(map).toEqual({ a: { Telephon: 'a', x: 1 }, b: { Telephon: 'b', x: 2 } });
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
            { Telephon: 'a', AllViewed: true },
            { Telephon: 'b', AllViewed: true },
            { Telephon: 'c', AllViewed: false },
        ]);
        expect(nextTarget(orderSnapshot, contacts, 'a')).toEqual({ telephon: 'c', statusIndex: 0 });
    });

    it('no hace wrap-around: si no hay nada sin ver después del actual, devuelve null', () => {
        const orderSnapshot = ['a', 'b', 'c'];
        const contacts = contactsByTelephon([
            { Telephon: 'a', AllViewed: false }, // sin ver, pero está ANTES del actual
            { Telephon: 'b', AllViewed: true },
            { Telephon: 'c', AllViewed: true },
        ]);
        expect(nextTarget(orderSnapshot, contacts, 'b')).toBeNull();
    });

    it('reproduce el bug real: marcar visto el último estado reordena el feed en vivo, pero la navegación sigue el snapshot congelado', () => {
        // Al abrir el visor el feed tenía este orden: b (sin ver), a (sin ver), c (todo visto).
        const orderSnapshot = ['b', 'a', 'c'];
        // El usuario terminó de ver "b": el feed EN VIVO ya reordenó a b al final
        // (porque sortContacts pone los AllViewed al final), así que en el array
        // en vivo "a" ahora aparece ANTES que "b". Si goNext buscara el índice de
        // "b" en ese array en vivo, i+1 apuntaría a "c" (todo visto) y cerraría el
        // visor saltándose "a", que todavía tiene estados sin ver.
        const liveContactsInNewOrder = contactsByTelephon([
            { Telephon: 'a', AllViewed: false },
            { Telephon: 'c', AllViewed: true },
            { Telephon: 'b', AllViewed: true },
        ]);
        expect(nextTarget(orderSnapshot, liveContactsInNewOrder, 'b')).toEqual({ telephon: 'a', statusIndex: 0 });
    });

    it('si el contacto actual no está en el snapshot, no encuentra nada (no revienta)', () => {
        expect(nextTarget(['a', 'b'], contactsByTelephon([{ Telephon: 'a', AllViewed: false }]), 'zzz')).toBeNull();
    });
});
