// Etiqueta de "Respondiendo a X" en MessageInput (1:1) y, a futuro, en el
// reply de GroupChatWindow (M7). `Message` (types/api.ts) no tiene ni tuvo
// nunca `SenderUsername`, así que en 1:1 se lee el nombre desde `selected`; en
// grupo, desde la lista de miembros (cualquier miembro puede ser el remitente).

/** Remitente del mensaje al que se responde (solo el campo que realmente existe). */
export interface ReplySender {
    SenderTelephon: string;
}

/** Fuente de nombre para un chat 1:1 (`selected` o un contacto). */
export interface ReplyNameSource {
    contactName?: string | null;
    username: string;
}

/** Miembro de grupo mínimo para resolver el nombre del remitente. */
export interface ReplyGroupMember {
    Telephon: string;
    Username?: string;
    ContactName?: string | null;
}

/**
 * Resuelve la etiqueta "Respondiendo a X".
 *
 * - 1:1: el remitente soy yo o el contacto `selected`.
 * - Grupo (`members` presente): el remitente puede ser cualquier miembro, así
 *   que se busca por teléfono en la lista. Si no aparece, se muestra el
 *   teléfono en vez de un nombre de chat 1:1 que no aplica.
 *
 * `myTelephon` puede ser `undefined` mientras carga el perfil: el chequeo de
 * "ti mismo" exige un teléfono propio real para no comparar `undefined` contra
 * datos de red ausentes y etiquetar mal el mensaje.
 */
export function replySenderLabel(
    replyingTo: ReplySender,
    myTelephon: string | undefined,
    selected: ReplyNameSource | null | undefined,
    members?: readonly ReplyGroupMember[],
): string {
    if (myTelephon && replyingTo.SenderTelephon === myTelephon) return 'ti mismo';

    if (members) {
        const member = members.find((m) => m.Telephon === replyingTo.SenderTelephon);
        if (member) return member.ContactName || member.Username || replyingTo.SenderTelephon || 'mensaje';
        return replyingTo.SenderTelephon || 'mensaje';
    }

    return selected?.contactName || selected?.username || 'mensaje';
}
