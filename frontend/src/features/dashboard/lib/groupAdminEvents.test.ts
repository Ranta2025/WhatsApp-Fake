import { describe, it, expect } from 'vitest';
import type { GroupMessageResponse } from '../../../types/api';
import {
    parseSystemMessage, parseGroupMemberRole, parseGroupMemberRemoved, parseGroupSettings, parseGroupInfo,
    isSystemGroupMessage, describeGroupSystemMessage,
} from './groupAdminEvents';

const sysMsg = (over: Partial<GroupMessageResponse> = {}): GroupMessageResponse => ({
    MessageID: 10, GroupID: 9, SenderTelephon: '222', SenderUsername: 'Ana', Message: '',
    Time: '2026-01-01T09:00:00Z', Edited: false, Kind: 'system', ...over,
});

const names: Record<string, string> = { '222': 'Ana', '333': 'Luis', '444': 'Marta' };
const resolveName = (t: string): string | undefined => names[t];

describe('parseSystemMessage', () => {
    it('accepts a persisted system row and normalizes its fields', () => {
        const parsed = parseSystemMessage({
            MessageID: 10, GroupID: 9, SenderTelephon: '222', SenderUsername: 'Ana',
            Kind: 'system', SystemEvent: 'admin_granted', SystemTargets: ['333', '', 7],
        });
        expect(parsed).toMatchObject({
            MessageID: 10, GroupID: 9, SenderTelephon: '222', SenderUsername: 'Ana',
            Kind: 'system', SystemEvent: 'admin_granted', SystemTargets: ['333'],
        });
    });

    it('rejects absent, non-system and malformed messages', () => {
        expect(parseSystemMessage(undefined)).toBeUndefined();
        expect(parseSystemMessage(null)).toBeUndefined();
        expect(parseSystemMessage({ Kind: 'user' })).toBeUndefined();
        expect(parseSystemMessage(sysMsg({ MessageID: 0 }))).toBeUndefined();
        expect(parseSystemMessage(sysMsg({ GroupID: 0 }))).toBeUndefined();
        expect(parseSystemMessage(sysMsg({ SenderTelephon: '' }))).toBeUndefined();
    });

    it('drops an unknown SystemEvent instead of inventing one', () => {
        const parsed = parseSystemMessage(sysMsg({ SystemEvent: 'nope' as never }));
        expect(parsed?.SystemEvent).toBeUndefined();
    });

    it('isSystemGroupMessage only matches Kind === "system"', () => {
        expect(isSystemGroupMessage(sysMsg())).toBe(true);
        expect(isSystemGroupMessage(sysMsg({ Kind: undefined }))).toBe(false);
    });
});

describe('event guards', () => {
    it('parseGroupMemberRole validates group/telephon/role and keeps a valid system message', () => {
        expect(parseGroupMemberRole({ groupID: 9, telephon: '333', role: 'admin', systemMessage: sysMsg() }))
            .toEqual({ groupID: 9, telephon: '333', role: 'admin', systemMessage: expect.objectContaining({ MessageID: 10 }) });
        expect(parseGroupMemberRole({ groupID: 9, telephon: '333', role: 'admin', systemMessage: { Kind: 'system' } }))
            .toEqual({ groupID: 9, telephon: '333', role: 'admin' });
        expect(parseGroupMemberRole({ groupID: 9, telephon: '333', role: 'owner' })).toBeNull();
        expect(parseGroupMemberRole({ groupID: 0, telephon: '333', role: 'admin' })).toBeNull();
        expect(parseGroupMemberRole({ groupID: 9, telephon: '', role: 'admin' })).toBeNull();
        expect(parseGroupMemberRole(null)).toBeNull();
    });

    it('parseGroupMemberRemoved requires group/telephon; username and count are optional', () => {
        expect(parseGroupMemberRemoved({ groupID: 9, telephon: '333', username: 'Luis', newMemberCount: 2 }))
            .toEqual({ groupID: 9, telephon: '333', username: 'Luis', newMemberCount: 2 });
        expect(parseGroupMemberRemoved({ groupID: 9, telephon: '333' }))
            .toEqual({ groupID: 9, telephon: '333', username: '' });
        expect(parseGroupMemberRemoved({ groupID: 9, telephon: '333', newMemberCount: -1 }))
            .toEqual({ groupID: 9, telephon: '333', username: '' });
        expect(parseGroupMemberRemoved({ telephon: '333' })).toBeNull();
    });

    it('parseGroupSettings requires all three flags', () => {
        expect(parseGroupSettings({ groupID: 9, onlyAdminsCanSend: true, onlyAdminsCanEditInfo: false, onlyAdminsCanAddMembers: true }))
            .toEqual({ groupID: 9, onlyAdminsCanSend: true, onlyAdminsCanEditInfo: false, onlyAdminsCanAddMembers: true });
        expect(parseGroupSettings({ groupID: 9, onlyAdminsCanSend: true, onlyAdminsCanEditInfo: false })).toBeNull();
        expect(parseGroupSettings({ groupID: 9, onlyAdminsCanSend: 'yes', onlyAdminsCanEditInfo: false, onlyAdminsCanAddMembers: false })).toBeNull();
    });

    it('parseGroupInfo requires groupID plus string name/description', () => {
        expect(parseGroupInfo({ groupID: 9, name: 'Equipo', description: '' }))
            .toEqual({ groupID: 9, name: 'Equipo', description: '' });
        expect(parseGroupInfo({ groupID: 9, name: 'Equipo' })).toBeNull();
        expect(parseGroupInfo({ groupID: 9 })).toBeNull();
    });
});

describe('describeGroupSystemMessage (per-viewer wording)', () => {
    it('admin_granted: the target reads "te", others read the target name, the actor "Tú"', () => {
        expect(describeGroupSystemMessage(sysMsg({ SystemEvent: 'admin_granted', SystemTargets: ['333'] }), '333', resolveName))
            .toBe('Ana te designó como admin');
        expect(describeGroupSystemMessage(sysMsg({ SystemEvent: 'admin_granted', SystemTargets: ['333'] }), '111', resolveName))
            .toBe('Ana designó a Luis como admin');
        expect(describeGroupSystemMessage(sysMsg({ SystemEvent: 'admin_granted', SystemTargets: ['333'] }), '222', resolveName))
            .toBe('Tú designaste a Luis como admin');
    });

    it('admin_revoked wording', () => {
        expect(describeGroupSystemMessage(sysMsg({ SystemEvent: 'admin_revoked', SystemTargets: ['333'] }), '333', resolveName))
            .toBe('Ana te descartó como admin');
        expect(describeGroupSystemMessage(sysMsg({ SystemEvent: 'admin_revoked', SystemTargets: ['333'] }), '111', resolveName))
            .toBe('Ana descartó a Luis como admin');
    });

    it('member_added wording', () => {
        expect(describeGroupSystemMessage(sysMsg({ SystemEvent: 'member_added', SystemTargets: ['333'] }), '333', resolveName))
            .toBe('Ana te añadió al grupo');
        expect(describeGroupSystemMessage(sysMsg({ SystemEvent: 'member_added', SystemTargets: ['333', '444'] }), '111', resolveName))
            .toBe('Ana añadió a Luis y Marta');
        expect(describeGroupSystemMessage(sysMsg({ SystemEvent: 'member_added', SystemTargets: ['444', '333', '999'] }), '111', resolveName))
            .toBe('Ana añadió a Marta, Luis y 999');
    });

    it('member_removed wording: "Tú eliminaste" for the actor, "te eliminó" for the target', () => {
        expect(describeGroupSystemMessage(sysMsg({ SystemEvent: 'member_removed', SystemTargets: ['333'] }), '222', resolveName))
            .toBe('Tú eliminaste a Luis');
        expect(describeGroupSystemMessage(sysMsg({ SystemEvent: 'member_removed', SystemTargets: ['333'] }), '333', resolveName))
            .toBe('Ana te eliminó del grupo');
        expect(describeGroupSystemMessage(sysMsg({ SystemEvent: 'member_removed', SystemTargets: ['333'] }), '111', resolveName))
            .toBe('Ana eliminó a Luis');
    });

    it('member_left wording', () => {
        expect(describeGroupSystemMessage(sysMsg({ SystemEvent: 'member_left', SystemTargets: ['222'], SenderUsername: 'Ana' }), '111', resolveName))
            .toBe('Ana salió del grupo');
        expect(describeGroupSystemMessage(sysMsg({ SystemEvent: 'member_left', SystemTargets: ['222'], SenderUsername: 'Ana' }), '222', resolveName))
            .toBe('Tú saliste del grupo');
    });

    it('settings_changed / info_changed and an unknown event fallback', () => {
        expect(describeGroupSystemMessage(sysMsg({ SystemEvent: 'settings_changed' }), '111', resolveName))
            .toBe('Ana cambió la configuración del grupo');
        expect(describeGroupSystemMessage(sysMsg({ SystemEvent: 'settings_changed' }), '222', resolveName))
            .toBe('Tú cambiaste la configuración del grupo');
        expect(describeGroupSystemMessage(sysMsg({ SystemEvent: 'info_changed' }), '111', resolveName))
            .toBe('Ana actualizó la información del grupo');
        expect(describeGroupSystemMessage(sysMsg({ SystemEvent: undefined }), '111', resolveName))
            .toBe('Evento del grupo');
    });

    it('falls back to the telephon when no name resolves', () => {
        expect(describeGroupSystemMessage(sysMsg({ SystemEvent: 'admin_granted', SystemTargets: ['999'] }), '111', resolveName))
            .toBe('Ana designó a 999 como admin');
    });
});
