import { describe, it, expect } from 'vitest';
import type { ReactionSummary } from '../../../types/api';
import type { ReactionEventPayload } from '../../../types/ws';
import {
    applyReaction, applyOptimisticReaction, revertMine, currentMine, enqueuePending, shiftPending, PENDING_REACTION_TTL_MS, type PendingReactions, reactionsOf, toggledEmoji,
    parseReactionEvent, parseReactionErrorContext, reactionPendingKey,
} from './reactions';

interface Msg { MessageID: number | string; Time: string; Reactions?: ReactionSummary[] }
const chip = (Emoji: string, Count = 1, Mine = false): ReactionSummary => ({ Emoji, Count, Mine });
const msg = (id: number, Reactions?: ReactionSummary[]): Msg => ({ MessageID: id, Time: '2024-01-01T00:00:00Z', ...(Reactions ? { Reactions } : {}) });
const ev = (over: Partial<ReactionEventPayload> = {}): ReactionEventPayload => ({
    kind: 'direct', messageID: 1, telephon: '222', username: 'luis', emoji: '👍', previousEmoji: '',
    authorTelephon: '111', preview: 'hola', ...over,
});
const ME = '111';

describe('applyReaction: another user', () => {
    it('adds a new chip when the actor had no reaction', () => {
        const out = applyReaction([msg(1)], ev(), ME);
        expect(out[0]?.Reactions).toEqual([chip('👍', 1, false)]);
    });

    it('increments an existing chip without touching Mine', () => {
        const out = applyReaction([msg(1, [chip('👍', 1, true)])], ev(), ME);
        expect(out[0]?.Reactions).toEqual([chip('👍', 2, true)]);
    });

    it('replace: decrements previousEmoji and increments the new emoji', () => {
        const out = applyReaction([msg(1, [chip('👍', 2), chip('🙏', 1)])], ev({ emoji: '❤️', previousEmoji: '👍' }), ME);
        expect(out[0]?.Reactions).toEqual([chip('👍', 1), chip('🙏', 1), chip('❤️', 1)]);
    });

    it('replace: removes the previous chip when its count reaches zero', () => {
        const out = applyReaction([msg(1, [chip('👍', 1)])], ev({ emoji: '❤️', previousEmoji: '👍' }), ME);
        expect(out[0]?.Reactions).toEqual([chip('❤️', 1)]);
    });

    it('removal: decrements previousEmoji and drops the field when nothing is left', () => {
        const out = applyReaction([msg(1, [chip('👍', 1)])], ev({ emoji: '', previousEmoji: '👍' }), ME);
        expect('Reactions' in (out[0] ?? {})).toBe(false);
    });

    it('ignores a stale previousEmoji with no matching chip (never goes negative)', () => {
        const out = applyReaction([msg(1, [chip('🙏', 1)])], ev({ emoji: '❤️', previousEmoji: '👍' }), ME);
        expect(out[0]?.Reactions).toEqual([chip('🙏', 1), chip('❤️', 1)]);
    });

    it('previousEmoji equal to emoji is a no-op (same array)', () => {
        const list = [msg(1, [chip('👍', 1)])];
        expect(applyReaction(list, ev({ emoji: '👍', previousEmoji: '👍' }), ME)).toBe(list);
    });

    it('removal with nothing to remove is a no-op (same array)', () => {
        const list = [msg(1)];
        expect(applyReaction(list, ev({ emoji: '', previousEmoji: '' }), ME)).toBe(list);
    });

    it('keeps chips ordered by count (stable)', () => {
        const out = applyReaction([msg(1, [chip('👍', 1), chip('❤️', 1)])], ev({ emoji: '❤️' }), ME);
        expect(out[0]?.Reactions?.map(r => r.Emoji)).toEqual(['❤️', '👍']);
    });
});

describe('applyReaction: my own reaction (echo / other session)', () => {
    const mine = ev({ telephon: ME, username: 'ana', authorTelephon: '222' });

    it('is idempotent against the optimistic value: the echo does not double count', () => {
        const optimistic = applyOptimisticReaction([msg(1)], 1, '👍');
        expect(optimistic[0]?.Reactions).toEqual([chip('👍', 1, true)]);
        const list = applyReaction(optimistic, mine, ME);
        expect(list).toBe(optimistic);
    });

    it('applies a reaction made from another session of mine', () => {
        const out = applyReaction([msg(1, [chip('👍', 1)])], mine, ME);
        expect(out[0]?.Reactions).toEqual([chip('👍', 2, true)]);
    });

    it('replace uses Mine, not previousEmoji, to find what to decrement', () => {
        const out = applyReaction([msg(1, [chip('🙏', 1, true), chip('👍', 3)])], ev({ ...mine, emoji: '👍', previousEmoji: '🙏' }), ME);
        expect(out[0]?.Reactions).toEqual([chip('👍', 4, true)]);
    });

    it('removal clears Mine and the empty chip', () => {
        const out = applyReaction([msg(1, [chip('👍', 2, true)])], ev({ ...mine, emoji: '', previousEmoji: '👍' }), ME);
        expect(out[0]?.Reactions).toEqual([chip('👍', 1, false)]);
    });

    it('a duplicated event for my own reaction changes nothing', () => {
        const once = applyReaction([msg(1)], mine, ME);
        expect(applyReaction(once, mine, ME)).toBe(once);
    });
});

describe('applyReaction: targeting', () => {
    it('unknown message id is a no-op (same array)', () => {
        const list = [msg(2)];
        expect(applyReaction(list, ev({ messageID: 99 }), ME)).toBe(list);
    });

    it('only touches the matching message and keeps the others by reference', () => {
        const a = msg(1); const b = msg(2);
        const out = applyReaction([a, b], ev({ messageID: 2 }), ME);
        expect(out[0]).toBe(a);
        expect(out[1]?.Reactions).toEqual([chip('👍')]);
    });
});

describe('optimistic update, toggle and rollback', () => {
    it('replaces my own reaction', () => {
        const out = applyOptimisticReaction([msg(1, [chip('👍', 2, true)])], 1, '❤️');
        expect(out[0]?.Reactions).toEqual([chip('👍', 1, false), chip('❤️', 1, true)]);
    });

    it('empty emoji removes my reaction', () => {
        const out = applyOptimisticReaction([msg(1, [chip('👍', 1, true)])], 1, '');
        expect('Reactions' in (out[0] ?? {})).toBe(false);
    });

    it('unknown id is a no-op', () => {
        const list = [msg(2)];
        expect(applyOptimisticReaction(list, 1, '👍')).toBe(list);
    });

    it('toggledEmoji: tapping my current emoji removes it, anything else sets it', () => {
        expect(toggledEmoji([chip('👍', 1, true)], '👍')).toBe('');
        expect(toggledEmoji([chip('👍', 1, true)], '❤️')).toBe('❤️');
        expect(toggledEmoji([chip('👍', 2, false)], '👍')).toBe('👍');
        expect(toggledEmoji(undefined, '👍')).toBe('👍');
    });

    it('revertMine puts my previous emoji back and keeps other users', () => {
        const live = [chip('👍', 2, true), chip('😂', 1)];
        expect(revertMine([msg(1, live)], 1, '😂')[0]?.Reactions).toEqual([chip('😂', 2, true), chip('👍', 1)]);
    });

    it('revertMine with null removes only my reaction and the field when empty', () => {
        const sent = applyOptimisticReaction([msg(1)], 1, '👍');
        expect('Reactions' in (revertMine(sent, 1, null)[0] ?? {})).toBe(false);
    });

    it('revertMine never goes negative and is a no-op on an unknown id or when already there', () => {
        const list = [msg(2, [chip('👍', 1, true)])];
        expect(revertMine(list, 1, null)).toBe(list);
        expect(revertMine(list, 2, '👍')).toBe(list);
    });

    it('currentMine reads my emoji or null', () => {
        expect(currentMine([chip('👍', 2, true)])).toBe('👍');
        expect(currentMine([chip('👍')])).toBeNull();
        expect(currentMine(undefined)).toBeNull();
    });

    it('pending queue is FIFO per key and drops entries older than the TTL', () => {
        const q: PendingReactions = new Map();
        enqueuePending(q, 'direct:1', null, 0);
        enqueuePending(q, 'direct:1', '👍', 1_000);
        enqueuePending(q, 'direct:2', '❤️', 1_000);
        expect(shiftPending(q, 'direct:1', 2_000)?.prevMine).toBeNull();
        expect(shiftPending(q, 'direct:1', 2_000)?.prevMine).toBe('👍');
        expect(shiftPending(q, 'direct:1', 2_000)).toBeUndefined();
        expect(q.has('direct:1')).toBe(false);
        expect(shiftPending(q, 'direct:2', 1_000 + PENDING_REACTION_TTL_MS + 1)).toBeUndefined();
    });

    it('reactionsOf reads the reactions of a message id across lists', () => {
        expect(reactionsOf([[msg(1)], [msg(2, [chip('👍')])]], 2)).toEqual([chip('👍')]);
        expect(reactionsOf([[msg(1)]], 5)).toBeUndefined();
    });

    it('reactionPendingKey separates direct and group ids', () => {
        expect(reactionPendingKey('direct', 5)).not.toBe(reactionPendingKey('group', 5));
    });
});

describe('parseReactionEvent', () => {
    const wire = { kind: 'group', messageID: 4, groupID: 9, telephon: '222', username: 'luis', emoji: '🙏', previousEmoji: '👍', authorTelephon: '111', preview: 'p' };

    it('accepts a full valid payload', () => {
        expect(parseReactionEvent(wire)).toEqual(wire);
    });

    it('defaults optional strings (previousEmoji, username, authorTelephon, preview)', () => {
        expect(parseReactionEvent({ kind: 'direct', messageID: 4, telephon: '222', emoji: '' })).toEqual({
            kind: 'direct', messageID: 4, telephon: '222', username: '', emoji: '', previousEmoji: '', authorTelephon: '', preview: '',
        });
    });

    it('drops malformed payloads without throwing', () => {
        for (const bad of [
            null, undefined, 'x', 4, [],
            { ...wire, kind: 'status' },
            { ...wire, messageID: '4' },
            { ...wire, messageID: 0 },
            { ...wire, messageID: 1.5 },
            { ...wire, telephon: '' },
            { ...wire, telephon: 5 },
            { ...wire, emoji: 5 },
            { ...wire, emoji: undefined },
            { ...wire, groupID: undefined },
            { ...wire, groupID: 'a' },
        ]) {
            expect(parseReactionEvent(bad)).toBeNull();
        }
    });
});

describe('parseReactionErrorContext', () => {
    it('extracts a react context', () => {
        expect(parseReactionErrorContext({ type: 'error', error: 'x', context: { action: 'react', kind: 'group', messageID: 4, groupID: 9, status: 403 } }))
            .toEqual({ kind: 'group', messageID: 4, groupID: 9 });
        expect(parseReactionErrorContext({ type: 'error', context: { action: 'react', kind: 'direct', messageID: 4 } }))
            .toEqual({ kind: 'direct', messageID: 4 });
    });

    it('returns null for other actions or malformed contexts', () => {
        for (const bad of [
            null, {}, { context: null }, { context: { action: 'chat', kind: 'direct', messageID: 4 } },
            { context: { action: 'react', kind: 'x', messageID: 4 } },
            { context: { action: 'react', kind: 'direct', messageID: '4' } },
            { context: { action: 'react', kind: 'group', messageID: 4 } },
        ]) {
            expect(parseReactionErrorContext(bad)).toBeNull();
        }
    });
});
