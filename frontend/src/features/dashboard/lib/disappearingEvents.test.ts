import { describe, it, expect } from 'vitest';
import { parseDirectSystemMessage, parseDisappearingChanged, parseMessagesExpired } from './disappearingEvents';

const directSys = {
    MessageID: 7, SenderTelephon: '111', Receptor: 'B', Message: '86400', Status: 'visto',
    Time: '2026-01-01T10:00:00Z', Edited: false, Kind: 'system', SystemEvent: 'disappearing_changed',
};
const groupSys = {
    MessageID: 8, GroupID: 9, SenderTelephon: '111', SenderUsername: 'ana', Message: '604800',
    Time: '2026-01-01T10:00:00Z', Edited: false, Kind: 'system', SystemEvent: 'disappearing_changed',
};

describe('parseDirectSystemMessage', () => {
    it('accepts a persisted 1:1 system message', () => {
        expect(parseDirectSystemMessage(directSys)).toMatchObject({
            MessageID: 7, SenderTelephon: '111', Receptor: 'B', Message: '86400', Kind: 'system', SystemEvent: 'disappearing_changed', Status: 'visto',
        });
    });

    it('rejects absent, non-system and malformed input', () => {
        expect(parseDirectSystemMessage(undefined)).toBeUndefined();
        expect(parseDirectSystemMessage(null)).toBeUndefined();
        expect(parseDirectSystemMessage({ ...directSys, Kind: '' })).toBeUndefined();
        expect(parseDirectSystemMessage({ ...directSys, MessageID: 0 })).toBeUndefined();
        expect(parseDirectSystemMessage({ ...directSys, MessageID: '7' })).toBeUndefined();
        expect(parseDirectSystemMessage({ ...directSys, SenderTelephon: '' })).toBeUndefined();
        expect(parseDirectSystemMessage({ ...directSys, Receptor: 5 })).toBeUndefined();
        expect(parseDirectSystemMessage([])).toBeUndefined();
    });

    it('never carries ExpiresAt even if the payload had one', () => {
        expect(parseDirectSystemMessage({ ...directSys, ExpiresAt: '2030-01-01T00:00:00Z' })).not.toHaveProperty('ExpiresAt');
    });
});

describe('parseDisappearingChanged', () => {
    it('parses a direct event with a system message', () => {
        expect(parseDisappearingChanged({ kind: 'direct', key: 'B', seconds: 86400, byTelephon: '111', systemMessage: directSys }))
            .toMatchObject({ kind: 'direct', key: 'B', seconds: 86400, byTelephon: '111', systemMessage: { MessageID: 7 } });
    });

    it('parses a group event with numeric key and a group system message', () => {
        const ev = parseDisappearingChanged({ kind: 'group', key: 9, seconds: 604800, byTelephon: '111', systemMessage: groupSys });
        expect(ev).toMatchObject({ kind: 'group', key: 9, seconds: 604800 });
        expect(ev?.systemMessage).toMatchObject({ MessageID: 8, GroupID: 9 });
    });

    it('treats a null/absent/invalid systemMessage as "unchanged" (no message)', () => {
        for (const systemMessage of [null, undefined, {}, { ...directSys, Kind: '' }]) {
            const ev = parseDisappearingChanged({ kind: 'direct', key: 'B', seconds: 0, byTelephon: '111', systemMessage });
            expect(ev).not.toBeNull();
            expect(ev).not.toHaveProperty('systemMessage');
        }
    });

    it('rejects malformed payloads', () => {
        const ok = { kind: 'direct', key: 'B', seconds: 86400, byTelephon: '111' };
        expect(parseDisappearingChanged(null)).toBeNull();
        expect(parseDisappearingChanged('x')).toBeNull();
        expect(parseDisappearingChanged({ ...ok, kind: 'other' })).toBeNull();
        expect(parseDisappearingChanged({ ...ok, key: '' })).toBeNull();
        expect(parseDisappearingChanged({ ...ok, key: 5 })).toBeNull();
        expect(parseDisappearingChanged({ ...ok, kind: 'group', key: 'B' })).toBeNull();
        expect(parseDisappearingChanged({ ...ok, kind: 'group', key: 0 })).toBeNull();
        expect(parseDisappearingChanged({ ...ok, seconds: 3600 })).toBeNull();
        expect(parseDisappearingChanged({ ...ok, seconds: '86400' })).toBeNull();
        expect(parseDisappearingChanged({ ...ok, byTelephon: '' })).toBeNull();
    });
});

describe('parseMessagesExpired', () => {
    it('parses direct and group payloads', () => {
        expect(parseMessagesExpired({ kind: 'direct', key: 'B', messageIDs: [1, 2] })).toEqual({ kind: 'direct', key: 'B', messageIDs: [1, 2] });
        expect(parseMessagesExpired({ kind: 'group', key: 9, messageIDs: [3] })).toEqual({ kind: 'group', key: 9, messageIDs: [3] });
    });

    it('keeps only positive integer ids and rejects an empty result', () => {
        expect(parseMessagesExpired({ kind: 'direct', key: 'B', messageIDs: [1, 'x', -1, 0, 2.5, 4] }))
            .toEqual({ kind: 'direct', key: 'B', messageIDs: [1, 4] });
        expect(parseMessagesExpired({ kind: 'direct', key: 'B', messageIDs: [] })).toBeNull();
        expect(parseMessagesExpired({ kind: 'direct', key: 'B', messageIDs: ['x'] })).toBeNull();
    });

    it('rejects malformed payloads', () => {
        expect(parseMessagesExpired(null)).toBeNull();
        expect(parseMessagesExpired({ kind: 'direct', key: 'B' })).toBeNull();
        expect(parseMessagesExpired({ kind: 'direct', key: 9, messageIDs: [1] })).toBeNull();
        expect(parseMessagesExpired({ kind: 'group', key: 'B', messageIDs: [1] })).toBeNull();
        expect(parseMessagesExpired({ kind: 'x', key: 'B', messageIDs: [1] })).toBeNull();
    });
});
