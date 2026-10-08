import type { GroupMemberResponse } from '../../../types/api';

/**
 * Sender label for a group message's reply preview. The backend only sends
 * `replyToTelephon` (never a sender name), so it is resolved against the
 * group's members; the telephon itself is the last resort.
 */
export function groupReplySenderLabel(
    replyToTelephon: string | undefined,
    myTelephon: string | undefined,
    members: GroupMemberResponse[] | undefined,
): string {
    if (!replyToTelephon) return '';
    if (replyToTelephon === myTelephon) return 'Tú';
    return members?.find(m => m.telephon === replyToTelephon)?.username || replyToTelephon;
}
