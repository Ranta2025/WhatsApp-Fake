// Lógica pura del feed de Estados: reducers sobre el estado del feed y
// navegación entre estados. Extraído de StatusContext.jsx para poder
// testearlo sin React ni DOM (ver R3-missing-tests / R3-goNext-reorder).

import type { StatusFeed, StatusItem, StatusContactGroup, StatusOwnerBrief } from '../../../types/api';

/** Contactos con al menos un estado sin ver primero; dentro de cada grupo, el más reciente primero. */
export const sortContacts = <G extends { AllViewed: boolean; LastUpdated: string | number | Date }>(
    list: G[],
): G[] => [...list].sort((a, b) => {
    if (a.AllViewed !== b.AllViewed) return a.AllViewed ? 1 : -1;
    return new Date(b.LastUpdated).getTime() - new Date(a.LastUpdated).getTime();
});

/** Aplica el evento WS "status_new": agrega el estado al grupo del dueño (o crea el grupo). */
export const applyStatusNew = (
    prevFeed: StatusFeed,
    owner: StatusOwnerBrief,
    status: StatusItem,
): StatusFeed => {
    const contacts = prevFeed.Contacts || [];
    const idx = contacts.findIndex(g => g.Telephon === owner.Telephon);
    let nextContacts: StatusContactGroup[];
    if (idx === -1) {
        nextContacts = [...contacts, {
            Telephon: owner.Telephon,
            Username: owner.Username,
            ContactName: owner.ContactName,
            AvatarUrl: owner.AvatarUrl,
            Statuses: [status],
            AllViewed: false,
            LastUpdated: status.CreatedAt,
        }];
    } else {
        nextContacts = contacts.map((g, i) => i !== idx ? g : {
            ...g,
            // Refrescar datos públicos del dueño por si cambiaron (avatar, nombre).
            Username: owner.Username || g.Username,
            ContactName: owner.ContactName ?? g.ContactName,
            AvatarUrl: owner.AvatarUrl ?? g.AvatarUrl,
            Statuses: [...g.Statuses, status],
            AllViewed: false,
            LastUpdated: status.CreatedAt,
        });
    }
    return { ...prevFeed, Contacts: sortContacts(nextContacts) };
};

/** Aplica el evento WS "status_deleted": quita el estado y, si era el último del grupo, el grupo entero. */
export const applyStatusDeleted = (
    prevFeed: StatusFeed,
    ownerTelephon: string,
    statusId: number,
): StatusFeed => {
    const mine = (prevFeed.Mine || []).filter(s => s.ID !== statusId);
    const contacts = (prevFeed.Contacts || [])
        .map(g => g.Telephon !== ownerTelephon ? g : { ...g, Statuses: g.Statuses.filter(s => s.ID !== statusId) })
        .filter(g => g.Statuses.length > 0)
        .map(g => ({ ...g, AllViewed: g.Statuses.every(s => s.Viewed) }));
    return { ...prevFeed, Mine: mine, Contacts: sortContacts(contacts) };
};

/** Aplica el evento WS "status_viewed" sobre "Mine" (actualiza el ViewCount del propio estado). */
export const applyStatusViewedForOwner = (
    prevFeed: StatusFeed,
    payload: { statusId: number; viewCount: number },
): StatusFeed => {
    const mine = (prevFeed.Mine || []).map(s => s.ID === payload.statusId ? { ...s, ViewCount: payload.viewCount } : s);
    return { ...prevFeed, Mine: mine };
};

export interface NextTargetResult {
    telephon: string;
    statusIndex: number;
}

/**
 * Calcula a qué contacto debe saltar goNext() al agotar los estados del
 * contacto actual, sin depender del orden *en vivo* de feed.Contacts (que
 * puede haber cambiado de posición justo antes de este cálculo, porque
 * marcar el último estado como visto reordena AllViewed al final de la
 * lista: ver R3-goNext-reorder). En su lugar usa orderSnapshot, una copia
 * congelada de los teléfonos en el orden que tenía el feed cuando se abrió
 * el visor, y solo consulta contactsByTelephon (el feed en vivo, indexado
 * por teléfono) para saber si ese contacto sigue teniendo algo sin ver.
 *
 * No hace wrap-around: solo avanza hacia adelante en el snapshot, igual que
 * el comportamiento original. Devuelve null si no queda ningún contacto con
 * estados sin ver después del actual (el visor debe cerrarse).
 */
export const nextTarget = <G extends { AllViewed: boolean }>(
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
        if (group && !group.AllViewed) {
            return { telephon, statusIndex: 0 };
        }
    }
    return null;
};

/** Indexa una lista de grupos de contacto por teléfono, para lookups O(1). */
export const contactsByTelephon = <G extends { Telephon: string }>(
    contacts: G[] | undefined,
): Record<string, G> =>
    (contacts || []).reduce<Record<string, G>>((acc, g) => { acc[g.Telephon] = g; return acc; }, {});
