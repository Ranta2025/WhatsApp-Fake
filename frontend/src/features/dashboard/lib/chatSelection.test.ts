import { describe, it, expect } from 'vitest';
import { resolveChatTarget, type DashboardChatGroupEntry } from './chatSelection';
import type { ContactChat } from '../../../types/api';

// resolveChatTarget reconstruye el objetivo de chat a abrir (usado por el
// click en notificación) cuando el remitente aún no está en `contacts` pero
// ya existe un historial de chat para él en `allChatGroups`. Antes de
// extraer esta función, DashboardContext.jsx hacía
// `contact || allChatGroups[telephon] || {...}` directamente: una entrada
// de `allChatGroups` no tiene campo `Number` (tiene `ContactTelephon`), así
// que `selected.Number` quedaba `undefined` y rompía todas las comparaciones
// posteriores (p.ej. "¿el chat abierto es este remitente?").
const makeContact = (overrides: Partial<ContactChat> = {}): ContactChat => ({
    Username: 'contact-user',
    Number: '111',
    Status: 'accepted',
    ContactName: 'Contact Name',
    last_seen: null,
    avatar_url: '',
    wallpaper_url: '',
    ...overrides,
});

const makeGroupEntry = (overrides: Partial<DashboardChatGroupEntry> = {}): DashboardChatGroupEntry => ({
    ContactTelephon: '222',
    ContactUsername: 'group-user',
    ContactName: 'Group Contact Name',
    IsContact: false,
    ...overrides,
});

describe('resolveChatTarget', () => {
    it('returns the matching contact when the telephon is a known contact', () => {
        const contact = makeContact({ Number: '111' });
        const result = resolveChatTarget('111', [contact], {});
        expect(result).toBe(contact);
    });

    it('builds a Number-bearing target from allChatGroups when there is no contact match', () => {
        const group = makeGroupEntry({ ContactUsername: 'group-user', ContactName: 'Group Contact Name' });
        const result = resolveChatTarget('222', [], { '222': group });

        expect(result.Number).toBe('222');
        expect(result.Username).toBe('group-user');
        expect(result.ContactName).toBe('Group Contact Name');
        expect(result.Status).toBe('unknown');
    });

    it('falls back to a minimal telephon-only target when neither contact nor chat group exist', () => {
        const result = resolveChatTarget('333', [], {});

        expect(result).toEqual({ Number: '333', Username: '333', Status: 'unknown' });
    });

    it('uses the provided fallback name as ContactName when neither contact nor chat group exist', () => {
        // Original ToastContainer.jsx: `... || { Number: notif.telephon,
        // ContactName: notif.senderName }` — the M6 refactor dropped
        // senderName, so an unknown sender showed as their raw number.
        const result = resolveChatTarget('333', [], {}, 'Sender Name');

        expect(result.Number).toBe('333');
        expect(result.ContactName).toBe('Sender Name');
    });

    it('does not use the fallback name when a contact or chat group matches', () => {
        const contact = makeContact({ Number: '111', ContactName: 'Contact Name' });
        expect(resolveChatTarget('111', [contact], {}, 'Fallback').ContactName).toBe('Contact Name');

        const group = makeGroupEntry({ ContactName: 'Group Contact Name' });
        expect(resolveChatTarget('222', [], { '222': group }, 'Fallback').ContactName).toBe('Group Contact Name');
    });
});
