// Etiqueta de "Respondiendo a X" en MessageInput. En un chat 1:1 el único
// remitente posible además de mí mismo es el contacto `selected` (Message,
// types/api.ts, no tiene ni tuvo nunca `SenderUsername`) — se lee el nombre
// desde `selected` en vez de un campo del mensaje que nunca existió.
export function replySenderLabel(
    replyingTo: { SenderTelephon: string },
    myTelephon: string | undefined,
    selected: { ContactName?: string | null; Username: string },
): string {
    if (replyingTo.SenderTelephon === myTelephon) return 'ti mismo';
    return selected.ContactName || selected.Username || 'mensaje';
}
