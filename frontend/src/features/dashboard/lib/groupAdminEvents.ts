import type { GroupMessageResponse, GroupRole, GroupSystemEvent } from '../../../types/api';
import { describeDisappearingSystemText } from './disappearing';

/**
 * Runtime guards for the admin WS payloads and the persisted system messages,
 * plus the per-viewer wording used to render a system message. Network payloads
 * are untrusted: every handler validates before touching state (same principle
 * as `parseGroupReceipt` in `lib/groupReceipts.ts`).
 */

export interface GroupMemberRoleEvent {
    groupID: number;
    telephon: string;
    role: GroupRole;
    systemMessage?: GroupMessageResponse;
}

export interface GroupMemberRemovedEvent {
    groupID: number;
    telephon: string;
    username: string;
    newMemberCount?: number;
    systemMessage?: GroupMessageResponse;
}

export interface GroupSettingsEvent {
    groupID: number;
    onlyAdminsCanSend: boolean;
    onlyAdminsCanEditInfo: boolean;
    onlyAdminsCanAddMembers: boolean;
    systemMessage?: GroupMessageResponse;
}

export interface GroupInfoEvent {
    groupID: number;
    name: string;
    description: string;
    systemMessage?: GroupMessageResponse;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const asPositiveInt = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;

const asNonEmptyString = (value: unknown): string | undefined =>
    typeof value === 'string' && value !== '' ? value : undefined;

const asRole = (value: unknown): GroupRole | undefined =>
    value === 'admin' || value === 'member' ? value : undefined;

const SYSTEM_EVENTS: ReadonlySet<string> = new Set<GroupSystemEvent>([
    'member_added', 'member_removed', 'member_left', 'admin_granted', 'admin_revoked', 'settings_changed', 'info_changed',
    'disappearing_changed',
]);

const asSystemEvent = (value: unknown): GroupSystemEvent | undefined =>
    typeof value === 'string' && SYSTEM_EVENTS.has(value) ? (value as GroupSystemEvent) : undefined;

/**
 * Validates the persisted system message embedded in an event. Returns undefined
 * when absent (e.g. an idempotent settings PATCH) or malformed, so the caller
 * simply skips the append instead of injecting garbage.
 */
export function parseSystemMessage(raw: unknown): GroupMessageResponse | undefined {
    if (!isRecord(raw) || raw.Kind !== 'system') return undefined;
    const messageID = asPositiveInt(raw.MessageID);
    const groupID = asPositiveInt(raw.GroupID);
    const senderTelephon = asNonEmptyString(raw.SenderTelephon);
    if (messageID === undefined || groupID === undefined || senderTelephon === undefined) return undefined;
    const targets = Array.isArray(raw.SystemTargets)
        ? raw.SystemTargets.filter((t): t is string => typeof t === 'string' && t !== '')
        : [];
    return {
        MessageID: messageID,
        GroupID: groupID,
        SenderTelephon: senderTelephon,
        SenderUsername: typeof raw.SenderUsername === 'string' ? raw.SenderUsername : '',
        Message: typeof raw.Message === 'string' ? raw.Message : '',
        Time: typeof raw.Time === 'string' ? raw.Time : '',
        Edited: raw.Edited === true,
        Kind: 'system',
        SystemEvent: asSystemEvent(raw.SystemEvent),
        ...(targets.length > 0 ? { SystemTargets: targets } : {}),
    };
}

/** `group_member_role` guard. */
export function parseGroupMemberRole(payload: unknown): GroupMemberRoleEvent | null {
    if (!isRecord(payload)) return null;
    const groupID = asPositiveInt(payload.groupID);
    const telephon = asNonEmptyString(payload.telephon);
    const role = asRole(payload.role);
    if (groupID === undefined || telephon === undefined || role === undefined) return null;
    const systemMessage = parseSystemMessage(payload.systemMessage);
    return { groupID, telephon, role, ...(systemMessage ? { systemMessage } : {}) };
}

/** `group_member_removed` guard. */
export function parseGroupMemberRemoved(payload: unknown): GroupMemberRemovedEvent | null {
    if (!isRecord(payload)) return null;
    const groupID = asPositiveInt(payload.groupID);
    const telephon = asNonEmptyString(payload.telephon);
    if (groupID === undefined || telephon === undefined) return null;
    const newMemberCount = typeof payload.newMemberCount === 'number' && Number.isFinite(payload.newMemberCount)
        && payload.newMemberCount >= 0 ? payload.newMemberCount : undefined;
    const systemMessage = parseSystemMessage(payload.systemMessage);
    return {
        groupID,
        telephon,
        username: typeof payload.username === 'string' ? payload.username : '',
        ...(newMemberCount !== undefined ? { newMemberCount } : {}),
        ...(systemMessage ? { systemMessage } : {}),
    };
}

/** `group_settings` guard: all three flags are required state. */
export function parseGroupSettings(payload: unknown): GroupSettingsEvent | null {
    if (!isRecord(payload)) return null;
    const groupID = asPositiveInt(payload.groupID);
    const onlyAdminsCanSend = typeof payload.onlyAdminsCanSend === 'boolean' ? payload.onlyAdminsCanSend : undefined;
    const onlyAdminsCanEditInfo = typeof payload.onlyAdminsCanEditInfo === 'boolean' ? payload.onlyAdminsCanEditInfo : undefined;
    const onlyAdminsCanAddMembers = typeof payload.onlyAdminsCanAddMembers === 'boolean' ? payload.onlyAdminsCanAddMembers : undefined;
    if (groupID === undefined
        || onlyAdminsCanSend === undefined
        || onlyAdminsCanEditInfo === undefined
        || onlyAdminsCanAddMembers === undefined) return null;
    const systemMessage = parseSystemMessage(payload.systemMessage);
    return {
        groupID, onlyAdminsCanSend, onlyAdminsCanEditInfo, onlyAdminsCanAddMembers,
        ...(systemMessage ? { systemMessage } : {}),
    };
}

/** `group_info` guard. */
export function parseGroupInfo(payload: unknown): GroupInfoEvent | null {
    if (!isRecord(payload)) return null;
    const groupID = asPositiveInt(payload.groupID);
    if (groupID === undefined || typeof payload.name !== 'string' || typeof payload.description !== 'string') return null;
    const systemMessage = parseSystemMessage(payload.systemMessage);
    return { groupID, name: payload.name, description: payload.description, ...(systemMessage ? { systemMessage } : {}) };
}

/** True for a persisted system event (rendered as a centered notice, not a bubble). */
export const isSystemGroupMessage = (msg: GroupMessageResponse): boolean => msg.Kind === 'system';

const joinNames = (names: string[]): string => {
    if (names.length === 0) return '';
    if (names.length === 1) return names[0]!;
    if (names.length === 2) return `${names[0]} y ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
};

/**
 * Renders a persisted system message for one viewer without storing per-recipient
 * text: the actor is "Tú" for themselves, a target that is the viewer reads as
 * "te" (or "a ti" inside a list). `resolveName` maps a telephon to a display name
 * (members list + names cached from events); unknown names fall back to the telephon.
 */
export function describeGroupSystemMessage(
    msg: GroupMessageResponse,
    viewerTelephon: string | undefined,
    resolveName: (telephon: string) => string | undefined,
): string {
    const actor = msg.SenderTelephon;
    const actorIsViewer = viewerTelephon !== undefined && actor === viewerTelephon;
    const actorName = actorIsViewer ? 'Tú' : (msg.SenderUsername || resolveName(actor) || actor);
    const targets = (msg.SystemTargets ?? []).filter(t => t !== '');
    const viewerIsSoleTarget = viewerTelephon !== undefined
        && targets.length === 1 && targets[0] === viewerTelephon;
    const targetList = joinNames(targets.map(t => (t === viewerTelephon ? 'a ti' : (resolveName(t) || t))));

    switch (msg.SystemEvent) {
        case 'member_added':
            if (actorIsViewer) return `Tú añadiste a ${targetList}`;
            if (viewerIsSoleTarget) return `${actorName} te añadió al grupo`;
            return `${actorName} añadió a ${targetList}`;
        case 'admin_granted':
            if (actorIsViewer) return `Tú designaste a ${targetList} como admin`;
            if (viewerIsSoleTarget) return `${actorName} te designó como admin`;
            return `${actorName} designó a ${targetList} como admin`;
        case 'admin_revoked':
            if (actorIsViewer) return `Tú descartaste a ${targetList} como admin`;
            if (viewerIsSoleTarget) return `${actorName} te descartó como admin`;
            return `${actorName} descartó a ${targetList} como admin`;
        case 'member_removed':
            if (actorIsViewer) return `Tú eliminaste a ${targetList}`;
            if (viewerIsSoleTarget) return `${actorName} te eliminó del grupo`;
            return `${actorName} eliminó a ${targetList}`;
        case 'member_left':
            if (actorIsViewer) return 'Tú saliste del grupo';
            return `${msg.SenderUsername || resolveName(actor) || actor} salió del grupo`;
        case 'settings_changed':
            return actorIsViewer
                ? 'Tú cambiaste la configuración del grupo'
                : `${actorName} cambió la configuración del grupo`;
        case 'info_changed':
            return actorIsViewer
                ? 'Tú actualizaste la información del grupo'
                : `${actorName} actualizó la información del grupo`;
        case 'disappearing_changed':
            return describeDisappearingSystemText(
                msg.Message, actor, msg.SenderUsername || resolveName(actor), viewerTelephon,
            );
        default:
            return 'Evento del grupo';
    }
}
