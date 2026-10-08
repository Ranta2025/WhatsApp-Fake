import { describe, it, expect } from 'vitest';
import { resolveChatTarget, type DashboardChatGroupEntry } from './chatSelection';
import type { ContactChat } from '../../../types/api';

// resolveChatTarget reconstruye el objetivo de chat a abrir (usado por el
// click en notificación) cuando el remitente aún no está en `contacts` pero
// ya existe un historial de chat para él en `allChatGroups`. Antes de
// extraer esta función, DashboardContext.jsx hacía
// `contact || allChatGroups[telephon] || {...}` directamente: una entrada
// de `allChatGroups` no tiene campo `telephon` (tiene `contactTelephon`), así
// que `selected.telephon` quedaba `undefined` y rompía todas las comparaciones
// posteriores (p.ej. "¿el chat abierto es este remitente?").
const makeContact = (overrides: Partial<ContactChat> = {}): ContactChat => ({
    username: 'contact-user',
    telephon: '111',
    status: 'accepted',
    contactName: 'Contact Name',
    lastSeen: null,
    avatarUrl: '',
    wallpaperUrl: '',
    ...overrides,
});

const makeGroupEntry = (overrides: Partial<DashboardChatGroupEntry> = {}): DashboardChatGroupEntry => ({
    contactTelephon: '222',
    contactUsername: 'group-user',
    contactName: 'Group Contact Name',
    isContact: false,
    ...overrides,
});

describe('resolveChatTarget', () => {
    it('returns the matching contact when the telephon is a known contact', () => {
        const contact = makeContact({ telephon: '111' });
        const result = resolveChatTarget('111', [contact], {});
        expect(result).toBe(contact);
    });

    it('builds a telephon-bearing target from allChatGroups when there is no contact match', () => {
        const group = makeGroupEntry({ contactUsername: 'group-user', contactName: 'Group Contact Name' });
        const result = resolveChatTarget('222', [], { '222': group });

        expect(result.telephon).toBe('222');
        expect(result.username).toBe('group-user');
        expect(result.contactName).toBe('Group Contact Name');
        expect(result.status).toBe('unknown');
    });

    it('falls back to a minimal telephon-only target when neither contact nor chat group exist', () => {
        const result = resolveChatTarget('333', [], {});

        expect(result).toEqual({ telephon: '333', username: '333', status: 'unknown' });
    });

    it('uses the provided fallback name as contactName when neither contact nor chat group exist', () => {
        // Original ToastContainer.jsx: `... || { telephon: notif.telephon,
        // contactName: notif.senderName }` — the M6 refactor dropped
        // senderName, so an unknown sender showed as their raw number.
        const result = resolveChatTarget('333', [], {}, 'Sender Name');

        expect(result.telephon).toBe('333');
        expect(result.contactName).toBe('Sender Name');
    });

    it('does not use the fallback name when a contact or chat group matches', () => {
        const contact = makeContact({ telephon: '111', contactName: 'Contact Name' });
        expect(resolveChatTarget('111', [contact], {}, 'Fallback').contactName).toBe('Contact Name');

        const group = makeGroupEntry({ contactName: 'Group Contact Name' });
        expect(resolveChatTarget('222', [], { '222': group }, 'Fallback').contactName).toBe('Group Contact Name');
    });
});
