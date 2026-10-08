import { describe, it, expect } from 'vitest';
import type { GroupMemberResponse } from '../../../types/api';
import {
    marksFromMembers, mergeMarks, parseGroupReceipt, applyReceiptEvent,
    latestRealMessageId, addMemberMark, removeMemberMark, deriveGroupMessageStatus, type GroupReceiptMarks,
} from './groupReceipts';

const member = (telephon: string, extra: Partial<GroupMemberResponse> = {}): GroupMemberResponse => ({
    telephon, username: telephon, role: 'member', ...extra,
});

describe('marksFromMembers', () => {
    it('maps watermarks and defaults missing/invalid values to 0', () => {
        const marks = marksFromMembers([
            member('a', { joinedMessageID: 3, lastDeliveredMessageID: 9, lastReadMessageID: 7 }),
            member('b'),
            member('c', { lastReadMessageID: Number.NaN, lastDeliveredMessageID: -4 }),
        ]);
        expect(marks).toEqual({
            a: { joined: 3, delivered: 9, read: 7 },
            b: { joined: 0, delivered: 0, read: 0 },
            c: { joined: 0, delivered: 0, read: 0 },
        });
    });

    it('tolerates non-array input', () => {
        expect(marksFromMembers(undefined)).toEqual({});
        expect(marksFromMembers(null)).toEqual({});
    });

    it('skips entries without a telephon', () => {
        expect(marksFromMembers([{ username: 'x' } as unknown as GroupMemberResponse])).toEqual({});
    });
});

describe('mergeMarks', () => {
    it('keeps the highest watermark per member and drops members missing from the fresh snapshot', () => {
        const local: GroupReceiptMarks = {
            a: { joined: 0, delivered: 10, read: 5 },
            gone: { joined: 0, delivered: 1, read: 1 },
        };
        const fresh: GroupReceiptMarks = {
            a: { joined: 0, delivered: 8, read: 6 },
            b: { joined: 4, delivered: 0, read: 0 },
        };
        expect(mergeMarks(local, fresh)).toEqual({
            a: { joined: 0, delivered: 10, read: 6 },
            b: { joined: 4, delivered: 0, read: 0 },
        });
    });

    it('returns the fresh snapshot when there is no local state', () => {
        const fresh = { a: { joined: 0, delivered: 1, read: 0 } };
        expect(mergeMarks(undefined, fresh)).toEqual(fresh);
    });
});

describe('parseGroupReceipt', () => {
    it('accepts a well-formed payload', () => {
        expect(parseGroupReceipt({ groupID: 7, telephon: '+1', deliveredUpTo: 12, readUpTo: 9 }))
            .toEqual({ groupID: 7, telephon: '+1', deliveredUpTo: 12, readUpTo: 9 });
    });

    it('defaults omitted marks to 0 but rejects malformed payloads', () => {
        expect(parseGroupReceipt({ groupID: 7, telephon: '+1', deliveredUpTo: 4 }))
            .toEqual({ groupID: 7, telephon: '+1', deliveredUpTo: 4, readUpTo: 0 });
        for (const bad of [null, undefined, 'x', 3, {}, { groupID: 0, telephon: '+1' }, { groupID: 7 },
            { groupID: '7', telephon: '+1' }, { groupID: 7, telephon: '' },
            { groupID: 7, telephon: '+1', deliveredUpTo: 'x' }, { groupID: 7, telephon: '+1', readUpTo: -1 },
            { groupID: 7, telephon: '+1', readUpTo: Number.POSITIVE_INFINITY }]) {
            expect(parseGroupReceipt(bad)).toBeNull();
        }
    });
});

describe('applyReceiptEvent', () => {
    const base = { 7: { a: { joined: 0, delivered: 5, read: 2 } } };

    it('advances marks monotonically', () => {
        const next = applyReceiptEvent(base, { groupID: 7, telephon: 'a', deliveredUpTo: 9, readUpTo: 4 });
        expect(next[7]?.a).toEqual({ joined: 0, delivered: 9, read: 4 });
    });

    it('never goes backwards and returns the same reference when nothing changes', () => {
        expect(applyReceiptEvent(base, { groupID: 7, telephon: 'a', deliveredUpTo: 3, readUpTo: 1 })).toBe(base);
    });

    it('a read mark also lifts delivered', () => {
        const next = applyReceiptEvent(base, { groupID: 7, telephon: 'a', deliveredUpTo: 0, readUpTo: 8 });
        expect(next[7]?.a).toEqual({ joined: 0, delivered: 8, read: 8 });
    });

    it('ignores unknown groups and unknown members (detail will provide them)', () => {
        expect(applyReceiptEvent(base, { groupID: 99, telephon: 'a', deliveredUpTo: 9, readUpTo: 9 })).toBe(base);
        expect(applyReceiptEvent(base, { groupID: 7, telephon: 'zzz', deliveredUpTo: 9, readUpTo: 9 })).toBe(base);
    });
});

describe('latestRealMessageId', () => {
    it('returns the highest numeric id and ignores synthetic string ids', () => {
        expect(latestRealMessageId([{ messageID: 3 }, { messageID: 'system_1' }, { messageID: 9 }, { messageID: 5 }])).toBe(9);
    });
    it('returns 0 when there is nothing real', () => {
        expect(latestRealMessageId(undefined)).toBe(0);
        expect(latestRealMessageId([{ messageID: 'system_1' }])).toBe(0);
    });
});

describe('addMemberMark / removeMemberMark', () => {
    const base = { 7: { a: { joined: 0, delivered: 5, read: 5 } } };

    it('adds a new member joined at the latest known message id', () => {
        const next = addMemberMark(base, 7, 'b', 42);
        expect(next[7]?.b).toEqual({ joined: 42, delivered: 0, read: 0 });
        expect(next[7]?.a).toEqual(base[7]?.a);
    });

    it('does not overwrite an existing member and ignores unknown groups', () => {
        expect(addMemberMark(base, 7, 'a', 42)).toBe(base);
        expect(addMemberMark(base, 99, 'b', 42)).toBe(base);
    });

    it('removes a member', () => {
        expect(removeMemberMark(base, 7, 'a')[7]).toEqual({});
        expect(removeMemberMark(base, 7, 'nobody')).toBe(base);
        expect(removeMemberMark(base, 99, 'a')).toBe(base);
    });
});

describe('deriveGroupMessageStatus', () => {
    const marks = (entries: Record<string, [number, number, number]>): GroupReceiptMarks => Object.fromEntries(
        Object.entries(entries).map(([tel, [joined, delivered, read]]) => [tel, { joined, delivered, read }]),
    );

    it('is "enviado" without marks or without other members', () => {
        expect(deriveGroupMessageStatus(10, 'me', undefined)).toBe('enviado');
        expect(deriveGroupMessageStatus(10, 'me', {})).toBe('enviado');
        expect(deriveGroupMessageStatus(10, 'me', marks({ me: [0, 10, 10] }))).toBe('enviado');
    });

    it('is "enviado" until EVERY other member has it delivered', () => {
        expect(deriveGroupMessageStatus(10, 'me', marks({ a: [0, 10, 0], b: [0, 9, 0] }))).toBe('enviado');
    });

    it('is "entregado" when all received it but not all read it (read implies delivered)', () => {
        expect(deriveGroupMessageStatus(10, 'me', marks({ a: [0, 10, 0], b: [0, 0, 10] }))).toBe('entregado');
        expect(deriveGroupMessageStatus(10, 'me', marks({ a: [0, 10, 10], b: [0, 10, 9] }))).toBe('entregado');
    });

    it('is "visto" when all others read it', () => {
        expect(deriveGroupMessageStatus(10, 'me', marks({ a: [0, 10, 10], b: [0, 12, 11] }))).toBe('visto');
    });

    it('ignores the sender and members that joined at or after the message', () => {
        expect(deriveGroupMessageStatus(10, 'me', marks({ me: [0, 0, 0], a: [0, 10, 10], late: [10, 0, 0] }))).toBe('visto');
        expect(deriveGroupMessageStatus(10, 'me', marks({ a: [0, 10, 10], early: [9, 0, 0] }))).toBe('enviado');
    });
});
