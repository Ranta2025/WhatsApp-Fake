/**
 * Group read-receipt state (marcas de agua por miembro).
 *
 * The backend keeps, per member, the highest group message id delivered/read
 * (`LastDeliveredMessageID` / `LastReadMessageID`) plus `JoinedMessageID`
 * (max message id when the member joined). Message ids are global serials, so
 * they are only comparable inside one group. Marks only ever advance.
 */
import type { GroupMemberResponse, MessageStatus } from '../../../types/api';

export interface GroupReceiptMark {
    joined: number;
    delivered: number;
    read: number;
}

/** telephon -> marks, for one group. */
export type GroupReceiptMarks = Record<string, GroupReceiptMark>;
/** groupID -> telephon -> marks. */
export type GroupReceiptsState = Record<number, GroupReceiptMarks>;

/** Validated `group_receipt` push (`{groupID, telephon, deliveredUpTo, readUpTo}`). */
export interface GroupReceiptEvent {
    groupID: number;
    telephon: string;
    deliveredUpTo: number;
    readUpTo: number;
}

/** Non-negative finite number, else 0 (absent fields mean "nothing yet"). */
const mark = (value: unknown): number => (
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
);

export function marksFromMembers(members: readonly GroupMemberResponse[] | null | undefined): GroupReceiptMarks {
    const out: GroupReceiptMarks = {};
    if (!Array.isArray(members)) return out;
    for (const m of members) {
        if (!m || typeof m.Telephon !== 'string' || m.Telephon === '') continue;
        out[m.Telephon] = {
            joined: mark(m.JoinedMessageID),
            delivered: mark(m.LastDeliveredMessageID),
            read: mark(m.LastReadMessageID),
        };
    }
    return out;
}

/**
 * Applies a fresh server snapshot over local state: the member set follows the
 * snapshot, but each watermark keeps the highest value seen (a push may have
 * arrived after the snapshot was computed).
 */
export function mergeMarks(local: GroupReceiptMarks | undefined, fresh: GroupReceiptMarks): GroupReceiptMarks {
    if (!local) return fresh;
    const out: GroupReceiptMarks = {};
    for (const [tel, f] of Object.entries(fresh)) {
        const l = local[tel];
        out[tel] = l
            ? { joined: f.joined, delivered: Math.max(l.delivered, f.delivered), read: Math.max(l.read, f.read) }
            : f;
    }
    return out;
}

/** Runtime guard for the untrusted WS payload; null when malformed. */
export function parseGroupReceipt(payload: unknown): GroupReceiptEvent | null {
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as Record<string, unknown>;
    if (typeof p.groupID !== 'number' || !Number.isInteger(p.groupID) || p.groupID <= 0) return null;
    if (typeof p.telephon !== 'string' || p.telephon === '') return null;
    const readMark = (v: unknown): number | null => {
        if (v === undefined) return 0;
        return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
    };
    const deliveredUpTo = readMark(p.deliveredUpTo);
    const readUpTo = readMark(p.readUpTo);
    if (deliveredUpTo === null || readUpTo === null) return null;
    return { groupID: p.groupID, telephon: p.telephon, deliveredUpTo, readUpTo };
}

/**
 * Advances one member's marks. Unknown groups/members are ignored on purpose:
 * the detail snapshot (or the member-added event) provides them, and guessing
 * `joined` here could tick old messages as read.
 */
export function applyReceiptEvent(state: GroupReceiptsState, event: GroupReceiptEvent): GroupReceiptsState {
    const current = state[event.groupID]?.[event.telephon];
    if (!current) return state;
    const read = Math.max(current.read, event.readUpTo);
    const delivered = Math.max(current.delivered, event.deliveredUpTo, read);
    if (delivered === current.delivered && read === current.read) return state;
    return {
        ...state,
        [event.groupID]: { ...state[event.groupID], [event.telephon]: { ...current, delivered, read } },
    };
}

/** Highest real (numeric) message id; synthetic client-only entries use string ids.
 * Acepta el 1:1 camel (`messageID`) y el grupo Pascal (`MessageID`). */
export function latestRealMessageId(
    messages: ReadonlyArray<{ MessageID?: number | string; messageID?: number | string }> | undefined,
): number {
    let max = 0;
    for (const m of messages ?? []) {
        const id = m.messageID !== undefined ? m.messageID : m.MessageID;
        if (typeof id === 'number' && Number.isFinite(id) && id > max) max = id;
    }
    return max;
}

/** A member added while the group is loaded: they only count for later messages. */
export function addMemberMark(
    state: GroupReceiptsState, groupID: number, telephon: string, latestMessageId: number,
): GroupReceiptsState {
    const group = state[groupID];
    if (!group || group[telephon]) return state;
    return { ...state, [groupID]: { ...group, [telephon]: { joined: latestMessageId, delivered: 0, read: 0 } } };
}

export function removeMemberMark(state: GroupReceiptsState, groupID: number, telephon: string): GroupReceiptsState {
    const group = state[groupID];
    if (!group || !(telephon in group)) return state;
    const rest = Object.fromEntries(Object.entries(group).filter(([tel]) => tel !== telephon));
    return { ...state, [groupID]: rest };
}

/**
 * Status of a message we sent, derived from the other members' marks
 * (mirrors backend `GroupMessageStatus`): "visto" when every eligible member
 * read it, "entregado" when every one received it, else "enviado" (also when
 * nobody else is eligible). Eligible = not the sender and joined before the message.
 */
export function deriveGroupMessageStatus(
    messageId: number, senderTelephon: string, marks: GroupReceiptMarks | undefined,
): MessageStatus {
    let eligible = 0;
    let delivered = 0;
    let read = 0;
    for (const [tel, m] of Object.entries(marks ?? {})) {
        if (tel === senderTelephon || m.joined >= messageId) continue;
        eligible++;
        if (m.read >= messageId) {
            read++;
            delivered++;
        } else if (m.delivered >= messageId) {
            delivered++;
        }
    }
    if (eligible === 0 || delivered < eligible) return 'enviado';
    return read === eligible ? 'visto' : 'entregado';
}
