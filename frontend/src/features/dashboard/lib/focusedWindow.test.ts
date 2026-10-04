import { describe, it, expect } from 'vitest';
import type { ReactionSummary } from '../../../types/api';
import {
    createFocusedWindow, refocus, windowHasMessage, extendOlder, extendNewer, composeFocusedMessages,
    updateFocusedMessages, removeFocusedMessage,
} from './focusedWindow';

interface Msg { MessageID: number | string; Time: string; Message?: string; Reactions?: ReactionSummary[] }
const iso = (n: number) => new Date(Date.UTC(2024, 0, 1, 0, 0, n)).toISOString();
const msg = (id: number, extra: Partial<Msg> = {}): Msg => ({ MessageID: id, Time: iso(id), Message: `m${id}`, ...extra });
const ids = (list: readonly Msg[]) => list.map(m => m.MessageID);
const win = (from: number, to: number, over: Partial<{ older: boolean; newer: boolean; target: number; seq: number }> = {}) => createFocusedWindow<Msg>(
    Array.from({ length: to - from + 1 }, (_, i) => msg(from + i)),
    { hasMoreOlder: over.older ?? true, hasMoreNewer: over.newer ?? true },
    over.target ?? from,
    over.seq ?? 1,
);

describe('createFocusedWindow', () => {
    it('sorts and dedupes the server window and starts idle', () => {
        const w = createFocusedWindow<Msg>([msg(3), msg(1), msg(3), msg(2)], { hasMoreOlder: false, hasMoreNewer: true }, 2, 7);
        expect(ids(w.messages)).toEqual([1, 2, 3]);
        expect(w).toMatchObject({ hasMoreOlder: false, hasMoreNewer: true, targetId: 2, seq: 7, loadingOlder: false, loadingNewer: false });
    });
});

describe('windowHasMessage / refocus', () => {
    it('finds real ids and refocus bumps target and seq without touching messages', () => {
        const w = win(10, 20);
        expect(windowHasMessage(w, 15)).toBe(true);
        expect(windowHasMessage(w, 9)).toBe(false);
        const r = refocus(w, 15);
        expect(r.targetId).toBe(15);
        expect(r.seq).toBe(w.seq + 1);
        expect(r.messages).toBe(w.messages);
    });

    it('refocusing the same target still bumps seq (re-scroll)', () => {
        const w = win(10, 20, { target: 15 });
        expect(refocus(w, 15).seq).toBe(w.seq + 1);
    });
});

describe('extendOlder / extendNewer', () => {
    it('prepends an older page, dedupes overlap and updates the flag', () => {
        const w = { ...win(10, 20), loadingOlder: true };
        const out = extendOlder(w, [msg(8), msg(9), msg(10)], false);
        expect(ids(out.messages)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
        expect(out.hasMoreOlder).toBe(false);
        expect(out.loadingOlder).toBe(false);
        expect(out.hasMoreNewer).toBe(true);
    });

    it('appends a newer page and updates the flag', () => {
        const w = { ...win(10, 12), loadingNewer: true };
        const out = extendNewer(w, [msg(12), msg(13), msg(14)], false);
        expect(ids(out.messages)).toEqual([10, 11, 12, 13, 14]);
        expect(out.hasMoreNewer).toBe(false);
        expect(out.loadingNewer).toBe(false);
        expect(out.hasMoreOlder).toBe(true);
    });

    it('an empty older/newer page ends that direction', () => {
        expect(extendOlder(win(10, 12), [], true).hasMoreOlder).toBe(false);
        expect(extendNewer(win(10, 12), [], true).hasMoreNewer).toBe(false);
    });

    it('keeps existing copies of already-loaded messages (edits are not reverted by an overlapping page)', () => {
        const w = createFocusedWindow<Msg>([msg(10, { Message: 'editado' }), msg(11)], { hasMoreOlder: true, hasMoreNewer: true }, 10, 1);
        const out = extendOlder(w, [msg(9), msg(10, { Message: 'viejo' })], true);
        expect(out.messages.find(m => m.MessageID === 10)?.Message).toBe('editado');
    });
});

describe('composeFocusedMessages', () => {
    it('shows only the window while there are newer messages on the server', () => {
        const w = win(10, 12, { newer: true });
        expect(ids(composeFocusedMessages(w, [msg(11), msg(50)]))).toEqual([10, 11, 12]);
    });

    it('appends live messages newer than the window once it reached the tail', () => {
        const w = win(10, 12, { newer: false });
        expect(ids(composeFocusedMessages(w, [msg(11), msg(12), msg(13), msg(14)]))).toEqual([10, 11, 12, 13, 14]);
    });

    it('appends synthetic (system) entries that happened after the window end, not before', () => {
        const w = win(10, 12, { newer: false });
        const late: Msg = { MessageID: 'system_late', Time: iso(30) };
        const early: Msg = { MessageID: 'system_early', Time: iso(5) };
        expect(ids(composeFocusedMessages(w, [early, msg(13), late]))).toEqual([10, 11, 12, 13, 'system_late']);
    });

    it('does not duplicate and keeps the window copy of shared ids', () => {
        const w = createFocusedWindow<Msg>([msg(10), msg(11, { Message: 'ventana' })], { hasMoreOlder: false, hasMoreNewer: false }, 10, 1);
        const out = composeFocusedMessages(w, [msg(11, { Message: 'vivo' }), msg(12)]);
        expect(ids(out)).toEqual([10, 11, 12]);
        expect(out.find(m => m.MessageID === 11)?.Message).toBe('ventana');
    });
});

describe('updateFocusedMessages / removeFocusedMessage', () => {
    it('maps messages preserving identity when nothing changes', () => {
        const w = win(1, 3);
        expect(updateFocusedMessages(w, m => m)).toBe(w);
        const out = updateFocusedMessages(w, m => (m.MessageID === 2 ? { ...m, Message: 'x' } : m));
        expect(out.messages[1]?.Message).toBe('x');
        expect(out.messages[0]).toBe(w.messages[0]);
    });

    it('removes a message by id (server-side delete) and is a no-op for unknown ids', () => {
        const w = win(1, 3);
        expect(ids(removeFocusedMessage(w, 2).messages)).toEqual([1, 3]);
        expect(removeFocusedMessage(w, 99)).toBe(w);
    });
});

describe('reactions preservation', () => {
    const chip = (Emoji: string, Count = 1, Mine = false): ReactionSummary => ({ Emoji, Count, Mine });

    it('extendOlder: an overlapping server copy replaces the stale Reactions of the loaded one', () => {
        const w = createFocusedWindow<Msg>([msg(10, { Reactions: [chip('👍', 1, true)] }), msg(11)], { hasMoreOlder: true, hasMoreNewer: false }, 10, 1);
        const next = extendOlder(w, [msg(9), msg(10, { Reactions: [chip('❤️', 2)] })], true);
        expect(next.messages.find(m => m.MessageID === 10)?.Reactions).toEqual([chip('❤️', 2)]);
    });

    it('extendNewer: an overlapping server copy without Reactions clears the loaded chips', () => {
        const w = createFocusedWindow<Msg>([msg(10, { Reactions: [chip('👍')] })], { hasMoreOlder: false, hasMoreNewer: true }, 10, 1);
        const next = extendNewer(w, [msg(10), msg(11)], true);
        expect(next.messages.find(m => m.MessageID === 10)?.Reactions).toBeUndefined();
        expect(ids(next.messages)).toEqual([10, 11]);
    });

    it('extendNewer: chips of new messages in the page are kept', () => {
        const w = createFocusedWindow<Msg>([msg(10)], { hasMoreOlder: false, hasMoreNewer: true }, 10, 1);
        const next = extendNewer(w, [msg(11, { Reactions: [chip('😂', 3, true)] })], false);
        expect(next.messages[1]?.Reactions).toEqual([chip('😂', 3, true)]);
    });
});
