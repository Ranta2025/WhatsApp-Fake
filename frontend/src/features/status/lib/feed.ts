// Lógica pura del feed de Estados: reducers sobre el estado del feed y
// navegación entre estados. Extraído de StatusContext.jsx para poder
// testearlo sin React ni DOM (ver R3-missing-tests / R3-goNext-reorder).

import type { StatusFeed, StatusItem, StatusContactGroup, StatusOwnerBrief } from '../../../types/api';

/** Contactos con al menos un estado sin ver primero; dentro de cada grupo, el más reciente primero. */
export const sortContacts = <G extends { allViewed: boolean; lastUpdated: string | number | Date }>(
    list: G[],
): G[] => [...list].sort((a, b) => {
    if (a.allViewed !== b.allViewed) return a.allViewed ? 1 : -1;
    return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
});

/**
 * Aplica el evento WS "status_new": agrega el estado al grupo del dueño (o
 * crea el grupo). El contrato (types/ws.ts) declara `owner` no-nulo, pero el
 * runtime no lo garantiza (R3-status-new-owner-fallback-unproved): sin
 * `owner.telephon` no hay a qué grupo de contacto agregar el estado, así que
 * el evento se ignora sin cambiar el feed en vez de crear un grupo fantasma
 * con teléfono vacío.
 */
export const applyStatusNew = (
    prevFeed: StatusFeed,
    owner: StatusOwnerBrief | null | undefined,
    status: StatusItem,
): StatusFeed => {
    if (!owner?.telephon) return prevFeed;
    const contacts = prevFeed.contacts || [];
    const idx = contacts.findIndex(g => g.telephon === owner.telephon);
    let nextContacts: StatusContactGroup[];
    if (idx === -1) {
        nextContacts = [...contacts, {
            telephon: owner.telephon,
            username: owner.username,
            contactName: owner.contactName,
            avatarUrl: owner.avatarUrl,
            statuses: [status],
            allViewed: false,
            lastUpdated: status.createdAt,
        }];
    } else {
        nextContacts = contacts.map((g, i) => i !== idx ? g : {
            ...g,
            // Refrescar datos públicos del dueño por si cambiaron (avatar, nombre).
            username: owner.username || g.username,
            contactName: owner.contactName ?? g.contactName,
            avatarUrl: owner.avatarUrl ?? g.avatarUrl,
            statuses: [...g.statuses, status],
            allViewed: false,
            lastUpdated: status.createdAt,
        });
    }
    return { ...prevFeed, contacts: sortContacts(nextContacts) };
};

/** Aplica el evento WS "status_deleted": quita el estado y, si era el último del grupo, el grupo entero. */
export const applyStatusDeleted = (
    prevFeed: StatusFeed,
    ownerTelephon: string,
    statusId: number,
): StatusFeed => {
    const mine = (prevFeed.mine || []).filter(s => s.id !== statusId);
    const contacts = (prevFeed.contacts || [])
        .map(g => g.telephon !== ownerTelephon ? g : { ...g, statuses: g.statuses.filter(s => s.id !== statusId) })
        .filter(g => g.statuses.length > 0)
        .map(g => ({ ...g, allViewed: g.statuses.every(s => s.viewed) }));
    return { ...prevFeed, mine, contacts: sortContacts(contacts) };
};

/** Aplica el evento WS "status_viewed" sobre "mine" (actualiza el viewCount del propio estado). */
export const applyStatusViewedForOwner = (
    prevFeed: StatusFeed,
    payload: { statusID: number; viewCount: number },
): StatusFeed => {
    const mine = (prevFeed.mine || []).map(s => s.id === payload.statusID ? { ...s, viewCount: payload.viewCount } : s);
    return { ...prevFeed, mine };
};

export interface NextTargetResult {
    telephon: string;
    statusIndex: number;
}

/**
 * Calcula a qué contacto debe saltar goNext() al agotar los estados del
 * contacto actual, sin depender del orden *en vivo* de feed.contacts (que
 * puede haber cambiado de posición justo antes de este cálculo, porque
 * marcar el último estado como visto reordena allViewed al final de la
 * lista: ver R3-goNext-reorder). En su lugar usa orderSnapshot, una copia
 * congelada de los teléfonos en el orden que tenía el feed cuando se abrió
 * el visor, y solo consulta contactsByTelephon (el feed en vivo, indexado
 * por teléfono) para saber si ese contacto sigue teniendo algo sin ver.
 *
 * No hace wrap-around: solo avanza hacia adelante en el snapshot, igual que
 * el comportamiento original. Devuelve null si no queda ningún contacto con
 * estados sin ver después del actual (el visor debe cerrarse).
 */
export const nextTarget = <G extends { allViewed: boolean }>(
    orderSnapshot: string[],
    contactsByTelephon: Record<string, G>,
    currentTelephon: string,
): NextTargetResult | null => {
    const idx = orderSnapshot.indexOf(currentTelephon);
    if (idx === -1) return null;
    for (let i = idx + 1; i < orderSnapshot.length; i++) {
        const telephon = orderSnapshot[i];
        if (telephon === undefined) continue;
        const group = contactsByTelephon[telephon];
        if (group && !group.allViewed) {
            return { telephon, statusIndex: 0 };
        }
    }
    return null;
};

/** Indexa una lista de grupos de contacto por teléfono, para lookups O(1). */
export const contactsByTelephon = <G extends { telephon: string }>(
    contacts: G[] | undefined,
): Record<string, G> =>
    (contacts || []).reduce<Record<string, G>>((acc, g) => { acc[g.telephon] = g; return acc; }, {});
