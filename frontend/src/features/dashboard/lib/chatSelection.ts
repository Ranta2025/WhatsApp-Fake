import type { ContactChat, ContactStatus } from '../../../types/api';

/**
 * Forma reducida que `allChatGroups` guarda por número de teléfono (ver
 * `fetchAllChats`/`handleIncomingMessage`/`handleUsernameChanged` en
 * DashboardContext.tsx): un subconjunto de `ChatGroup` (types/api.ts) sin
 * `ContactAvatarUrl` (va a `avatarMap`) ni `Messages` (va a `messagesByChat`).
 */
export interface DashboardChatGroupEntry {
    ContactTelephon: string;
    ContactUsername: string;
    ContactName: string;
    IsContact: boolean;
}

/**
 * Objetivo de chat 1:1 seleccionado (`selected` en DashboardContext). Puede
 * ser un `ContactChat` real o, para remitentes que aún no son contactos, un
 * objeto mínimo construido a mano — de ahí que solo se declaren aquí los
 * campos que los consumidores de `selected` realmente leen (ver
 * `rg -n 'selected\??\.'` sobre los componentes: solo `telephon`, `username`,
 * `contactName` y `status`).
 */
export interface SelectedChatTarget {
    telephon: string;
    username: string;
    contactName?: string | null;
    status?: ContactStatus | 'unknown';
}

/**
 * Reconstruye el objetivo de chat a seleccionar para `telephon`: el contacto
 * real si ya lo tenemos, o si no un objeto mínimo pero con `telephon` siempre
 * presente (a diferencia de usar directamente una entrada de `allChatGroups`,
 * que no tiene ese campo — ver Sidebar.jsx `openChat`, que sigue el mismo
 * patrón para el mismo motivo).
 */
export function resolveChatTarget(
    telephon: string,
    contacts: ContactChat[],
    allChatGroups: Record<string, DashboardChatGroupEntry>,
    fallbackName?: string
): SelectedChatTarget {
    const contact = contacts.find((c) => c.telephon === telephon);
    if (contact) return contact;

    const group = allChatGroups[telephon];
    if (group) {
        return {
            telephon,
            username: group.ContactUsername || telephon,
            contactName: group.ContactName || null,
            status: 'unknown',
        };
    }

    // `fallbackName` (p.ej. el `senderName` de una notificación) only applies to
    // the last resort, where there is no contact/group data to name the target.
    return { telephon, username: telephon, contactName: fallbackName, status: 'unknown' };
}
