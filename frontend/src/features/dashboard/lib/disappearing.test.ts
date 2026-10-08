import { describe, it, expect } from 'vitest';
import type { GroupMessageResponse, Message } from '../../../types/api';
import {
    isDisappearSeconds, normalizeDisappearSeconds, formatDisappearDuration, describeDisappearingChange,
    describeDirectSystemMessage, parseExpiresAt, removeMessagesByIds, removeExpiredMessages, earliestExpiry,
    expiryDelay, isSystemDirectMessage, countUnreadFrom, hasUnreadFrom, latestPreviewable, MAX_EXPIRY_DELAY_MS,
    removeExpiredFromWindow, removeIdsFromWindow, formatDisappearShort, disappearOptionLabel,
} from './disappearing';
import { describeGroupSystemMessage } from './groupAdminEvents';
import { createFocusedWindow } from './focusedWindow';

const msg = (id: number, over: Partial<Message> = {}): Message => ({
    messageID: id, senderTelephon: 'B', receptor: 'me', message: `m${id}`, status: 'enviado',
    time: '2026-01-01T10:00:00Z', edited: false, ...over,
});
const sys = (id: number, seconds: string, over: Partial<Message> = {}): Message => msg(id, {
    kind: 'system', systemEvent: 'disappearing_changed', message: seconds, status: 'visto', ...over,
});

describe('seconds guards', () => {
    it('accepts only the four allowed values', () => {
        for (const v of [0, 86400, 604800, 7776000]) expect(isDisappearSeconds(v)).toBe(true);
        for (const v of [1, -1, 3600, '86400', null, undefined, NaN, 86400.5]) expect(isDisappearSeconds(v)).toBe(false);
    });

    it('normalizes an absent/invalid chat timer to 0 and keeps a valid one', () => {
        expect(normalizeDisappearSeconds(undefined)).toBe(0);
        expect(normalizeDisappearSeconds('x')).toBe(0);
        expect(normalizeDisappearSeconds(-5)).toBe(0);
        expect(normalizeDisappearSeconds(604800)).toBe(604800);
    });
});

describe('formatDisappearDuration', () => {
    it('names each allowed duration in Spanish', () => {
        expect(formatDisappearDuration(86400)).toBe('24 horas');
        expect(formatDisappearDuration(604800)).toBe('7 días');
        expect(formatDisappearDuration(7776000)).toBe('90 días');
    });
});

describe('describeDisappearingChange', () => {
    it('words activation and deactivation for another actor', () => {
        expect(describeDisappearingChange(86400, false, 'Ana')).toBe('Ana activó los mensajes temporales: 24 horas');
        expect(describeDisappearingChange(604800, false, 'Ana')).toBe('Ana activó los mensajes temporales: 7 días');
        expect(describeDisappearingChange(7776000, false, 'Ana')).toBe('Ana activó los mensajes temporales: 90 días');
        expect(describeDisappearingChange(0, false, 'Ana')).toBe('Ana desactivó los mensajes temporales');
    });

    it('words them in second person when the actor is the viewer', () => {
        expect(describeDisappearingChange(86400, true, 'Ana')).toBe('Activaste los mensajes temporales: 24 horas');
        expect(describeDisappearingChange(0, true, 'Ana')).toBe('Desactivaste los mensajes temporales');
    });
});

describe('describeDirectSystemMessage / group case', () => {
    it('renders a 1:1 system message per viewer', () => {
        const resolve = (t: string) => (t === 'B' ? 'Bea' : undefined);
        expect(describeDirectSystemMessage(sys(5, '86400'), 'me', resolve)).toBe('Bea activó los mensajes temporales: 24 horas');
        expect(describeDirectSystemMessage(sys(5, '0', { senderTelephon: 'me' }), 'me', resolve))
            .toBe('Desactivaste los mensajes temporales');
        expect(describeDirectSystemMessage(sys(5, 'zzz'), 'me', resolve)).toBe('Bea cambió los mensajes temporales');
    });

    it('falls back to the telephon when the actor name is unknown', () => {
        expect(describeDirectSystemMessage(sys(5, '604800'), 'me', () => undefined))
            .toBe('B activó los mensajes temporales: 7 días');
    });

    it('describeGroupSystemMessage handles disappearing_changed', () => {
        const g = (text: string, actor: string): GroupMessageResponse => ({
            MessageID: 3, GroupID: 9, SenderTelephon: actor, SenderUsername: 'Ana', Message: text,
            Time: '2026-01-01T10:00:00Z', Edited: false, Kind: 'system', SystemEvent: 'disappearing_changed',
        });
        expect(describeGroupSystemMessage(g('86400', '222'), '111', () => undefined)).toBe('Ana activó los mensajes temporales: 24 horas');
        expect(describeGroupSystemMessage(g('0', '222'), '111', () => undefined)).toBe('Ana desactivó los mensajes temporales');
        expect(describeGroupSystemMessage(g('7776000', '111'), '111', () => undefined)).toBe('Activaste los mensajes temporales: 90 días');
        expect(describeGroupSystemMessage(g('0', '111'), '111', () => undefined)).toBe('Desactivaste los mensajes temporales');
    });
});

describe('parseExpiresAt', () => {
    it('parses RFC 3339 to epoch ms and ignores anything invalid', () => {
        expect(parseExpiresAt('2026-01-02T10:00:00Z')).toBe(Date.parse('2026-01-02T10:00:00Z'));
        expect(parseExpiresAt('not a date')).toBeUndefined();
        expect(parseExpiresAt('')).toBeUndefined();
        expect(parseExpiresAt(undefined)).toBeUndefined();
        expect(parseExpiresAt(12345)).toBeUndefined();
        expect(parseExpiresAt(null)).toBeUndefined();
    });
});

describe('removal reducers', () => {
    it('removeMessagesByIds drops ids, scrubs replies to them, and keeps the same array when nothing matches', () => {
        const list = [msg(1), msg(2), msg(3, { replyToMessageID: 2, replyToTelephon: 'B', replyToMessage: 'm2' })];
        const out = removeMessagesByIds(list, new Set([2]));
        expect(out.map(m => m.messageID)).toEqual([1, 3]);
        expect(out[1]).not.toHaveProperty('replyToMessageID');
        expect(out[1]).not.toHaveProperty('replyToMessage');
        expect(out[1]).not.toHaveProperty('replyToTelephon');
        expect(removeMessagesByIds(list, new Set([99]))).toBe(list);
        expect(removeMessagesByIds(list, new Set())).toBe(list);
    });

    it('removeExpiredMessages uses >= (a message expiring exactly now is gone) and ignores invalid ExpiresAt', () => {
        const now = Date.parse('2026-01-01T12:00:00Z');
        const list = [
            msg(1, { expiresAt: '2026-01-01T11:59:59Z' }),
            msg(2, { expiresAt: '2026-01-01T12:00:00Z' }),
            msg(3, { expiresAt: '2026-01-01T12:00:01Z' }),
            msg(4, { expiresAt: 'garbage' }),
            msg(5),
        ];
        expect(removeExpiredMessages(list, now).map(m => m.messageID)).toEqual([3, 4, 5]);
        expect(removeExpiredMessages([msg(5)], now)).toHaveLength(1);
        const same = [msg(5)];
        expect(removeExpiredMessages(same, now)).toBe(same);
    });

    it('never removes system messages, even with a past ExpiresAt', () => {
        const now = Date.parse('2026-01-01T12:00:00Z');
        const list = [sys(1, '86400', { expiresAt: '2026-01-01T11:00:00Z' }), msg(2, { expiresAt: '2026-01-01T11:00:00Z' })];
        const out = removeExpiredMessages(list, now);
        expect(out.map(m => m.messageID)).toEqual([1]);
    });

    it('windows: same object when nothing changes, filtered messages otherwise', () => {
        const win = createFocusedWindow([msg(1, { expiresAt: '2026-01-01T11:00:00Z' }), msg(2)], { hasMoreOlder: true, hasMoreNewer: false }, 2, 1);
        const now = Date.parse('2026-01-01T12:00:00Z');
        const out = removeExpiredFromWindow(win, now);
        expect(out.messages.map(m => m.messageID)).toEqual([2]);
        expect(out.hasMoreOlder).toBe(true);
        expect(removeExpiredFromWindow(out, now)).toBe(out);
        expect(removeIdsFromWindow(out, new Set([2])).messages).toEqual([]);
        expect(removeIdsFromWindow(out, new Set([42]))).toBe(out);
    });
});

describe('earliestExpiry / expiryDelay', () => {
    it('finds the earliest valid expiry across lists', () => {
        const a = [msg(1, { expiresAt: '2026-01-01T12:00:10Z' }), msg(2)];
        const b = [msg(3, { expiresAt: '2026-01-01T12:00:05Z' }), msg(4, { expiresAt: 'bad' })];
        expect(earliestExpiry([a, b])).toBe(Date.parse('2026-01-01T12:00:05Z'));
        expect(earliestExpiry([[msg(1)], []])).toBeNull();
        expect(earliestExpiry([])).toBeNull();
    });

    it('ignores entries the sweep cannot remove (non-numeric id, system) so they cannot stall the timer', () => {
        const unremovable = [
            msg(1, { messageID: 'tmp-1' as unknown as number, expiresAt: '2026-01-01T11:00:00Z' }),
            sys(2, '86400', { expiresAt: '2026-01-01T11:00:00Z' }),
            msg(3, { expiresAt: '2026-01-01T12:00:09Z' }),
        ];
        expect(earliestExpiry([unremovable])).toBe(Date.parse('2026-01-01T12:00:09Z'));
        expect(earliestExpiry([[unremovable[0]!, unremovable[1]!]])).toBeNull();
        // a later removable one still gets swept
        const now = Date.parse('2026-01-01T12:00:10Z');
        expect(removeExpiredMessages(unremovable, now).map(m => m.messageID)).toEqual(['tmp-1', 2]);
    });

    it('delay is never negative and capped', () => {
        expect(expiryDelay(null, 1000)).toBeNull();
        expect(expiryDelay(5000, 1000)).toBe(4000);
        expect(expiryDelay(500, 1000)).toBe(0);
        expect(expiryDelay(1000 + 10 * MAX_EXPIRY_DELAY_MS, 1000)).toBe(MAX_EXPIRY_DELAY_MS);
        expect(expiryDelay(1000 + 100, 1000, 50)).toBe(50);
    });
});

describe('system message exclusions', () => {
    it('isSystemDirectMessage is true only for Kind system', () => {
        expect(isSystemDirectMessage(sys(1, '0'))).toBe(true);
        expect(isSystemDirectMessage(msg(1))).toBe(false);
    });

    it('unread never counts system messages', () => {
        const list = [msg(1), sys(2, '86400', { status: 'enviado' }), msg(3, { status: 'visto' }), msg(4, { senderTelephon: 'me' })];
        expect(countUnreadFrom(list, 'B')).toBe(1);
        expect(hasUnreadFrom(list, 'B')).toBe(true);
        expect(hasUnreadFrom([sys(2, '0', { status: 'enviado' })], 'B')).toBe(false);
        expect(countUnreadFrom(undefined, 'B')).toBe(0);
    });

    it('preview is the latest non-system message', () => {
        expect(latestPreviewable([msg(1), msg(2), sys(3, '86400')])?.messageID).toBe(2);
        expect(latestPreviewable([sys(3, '0')])).toBeNull();
        expect(latestPreviewable(undefined)).toBeNull();
    });
});

describe('selector/chip labels', () => {
    it('short and option labels', () => {
        expect(formatDisappearShort(86400)).toBe('24 h');
        expect(formatDisappearShort(604800)).toBe('7 d');
        expect(formatDisappearShort(7776000)).toBe('90 d');
        expect(disappearOptionLabel(0)).toBe('Desactivados');
        expect(disappearOptionLabel(604800)).toBe('7 días');
    });
});
