import { describe, it, expect } from 'vitest';
import type { ReactionSummary } from '../../../types/api';
import { mergeLatestWindow, prependOlder, oldestRealMessageId, isContiguousWindow } from './mergeMessages';

interface Entry { messageID: number | string; time: string; message?: string; reactions?: ReactionSummary[] }

const e = (id: number, iso: string, message = `m${id}`): Entry => ({ messageID: id, time: iso, message });
const sys = (id: string, iso: string): Entry => ({ messageID: id, time: iso, message: 'sistema' });
const ids = (list: Entry[]) => list.map(m => m.messageID);

describe('oldestRealMessageId', () => {
    it('returns null for an empty list', () => {
        expect(oldestRealMessageId([])).toBeNull();
        expect(oldestRealMessageId(undefined)).toBeNull();
    });

    it('ignores synthetic (string id) entries and picks the smallest numeric id', () => {
        const list = [sys('system_1', '2024-01-01T00:00:00Z'), e(9, '2024-01-01T00:00:09Z'), e(4, '2024-01-01T00:00:04Z')];
        expect(oldestRealMessageId(list)).toBe(4);
    });

    it('returns null when only synthetic entries exist', () => {
        expect(oldestRealMessageId([sys('system_1', '2024-01-01T00:00:00Z')])).toBeNull();
    });
});

describe('prependOlder', () => {
    it('places older messages before the loaded ones, chronologically', () => {
        const prev = [e(5, '2024-01-01T00:00:05Z'), e(6, '2024-01-01T00:00:06Z')];
        const older = [e(3, '2024-01-01T00:00:03Z'), e(4, '2024-01-01T00:00:04Z')];
        expect(ids(prependOlder(prev, older))).toEqual([3, 4, 5, 6]);
    });

    it('dedupes by messageID keeping the already-loaded copy', () => {
        const prev = [e(5, '2024-01-01T00:00:05Z', 'editado')];
        const older = [e(5, '2024-01-01T00:00:05Z', 'viejo'), e(4, '2024-01-01T00:00:04Z')];
        const merged = prependOlder(prev, older);
        expect(ids(merged)).toEqual([4, 5]);
        expect(merged[1]?.message).toBe('editado');
    });

    it('breaks timestamp ties by numeric id', () => {
        const t = '2024-01-01T00:00:00Z';
        const merged = prependOlder([e(12, t), e(11, t)], [e(10, t)]);
        expect(ids(merged)).toEqual([10, 11, 12]);
    });

    it('keeps synthetic entries in place', () => {
        const prev = [e(5, '2024-01-01T00:00:05Z'), sys('system_x', '2024-01-01T00:00:06Z')];
        const merged = prependOlder(prev, [e(4, '2024-01-01T00:00:04Z')]);
        expect(ids(merged)).toEqual([4, 5, 'system_x']);
    });

    it('handles an undefined previous list', () => {
        expect(ids(prependOlder(undefined, [e(1, '2024-01-01T00:00:01Z')]))).toEqual([1]);
    });
});

describe('mergeLatestWindow', () => {
    it('keeps already-loaded pages older than the fresh window', () => {
        const prev = [e(1, '2024-01-01T00:00:01Z'), e(2, '2024-01-01T00:00:02Z'), e(5, '2024-01-01T00:00:05Z'), e(6, '2024-01-01T00:00:06Z')];
        const fresh = [e(5, '2024-01-01T00:00:05Z'), e(6, '2024-01-01T00:00:06Z'), e(7, '2024-01-01T00:00:07Z')];
        expect(ids(mergeLatestWindow(prev, fresh))).toEqual([1, 2, 5, 6, 7]);
    });

    it('takes server truth inside the window (drops messages deleted server-side, refreshes edits)', () => {
        const prev = [e(5, '2024-01-01T00:00:05Z', 'a'), e(6, '2024-01-01T00:00:06Z', 'b'), e(7, '2024-01-01T00:00:07Z', 'c')];
        const fresh = [e(5, '2024-01-01T00:00:05Z', 'a2'), e(7, '2024-01-01T00:00:07Z', 'c')];
        const merged = mergeLatestWindow(prev, fresh);
        expect(ids(merged)).toEqual([5, 7]);
        expect(merged[0]?.message).toBe('a2');
    });

    it('returns [] when the server window is empty (chat cleared)', () => {
        expect(mergeLatestWindow([e(1, '2024-01-01T00:00:01Z')], [])).toEqual([]);
    });

    it('drops in-window synthetic entries but keeps ones older than the window', () => {
        const prev = [
            sys('system_old', '2024-01-01T00:00:01Z'),
            e(5, '2024-01-01T00:00:05Z'),
            sys('system_new', '2024-01-01T00:00:06Z'),
        ];
        const fresh = [e(5, '2024-01-01T00:00:05Z'), e(6, '2024-01-01T00:00:06Z')];
        expect(ids(mergeLatestWindow(prev, fresh))).toEqual(['system_old', 5, 6]);
    });

    it('works from an undefined previous list', () => {
        expect(ids(mergeLatestWindow(undefined, [e(2, '2024-01-01T00:00:02Z'), e(1, '2024-01-01T00:00:01Z')]))).toEqual([1, 2]);
    });
});

describe('mergeLatestWindow contiguity (no silent gaps)', () => {
    const old = [e(1, '2024-01-01T00:00:01Z'), e(2, '2024-01-01T00:00:02Z'), e(3, '2024-01-01T00:00:03Z')];
    const gapped = [e(10, '2024-01-01T00:00:10Z'), e(11, '2024-01-01T00:00:11Z')];

    it('drops the older block when the fresh window does not overlap it', () => {
        expect(ids(mergeLatestWindow(old, gapped))).toEqual([10, 11]);
    });

    it('drops older synthetic entries too when not contiguous', () => {
        const prev = [sys('system_old', '2024-01-01T00:00:01Z'), ...old];
        expect(ids(mergeLatestWindow(prev, gapped))).toEqual([10, 11]);
    });

    it('keeps the older block when the fresh window overlaps or touches it', () => {
        expect(ids(mergeLatestWindow(old, [e(3, '2024-01-01T00:00:03Z'), e(4, '2024-01-01T00:00:04Z')]))).toEqual([1, 2, 3, 4]);
    });

    it('keeps older entries when the fresh window is the complete history (hasMore=false)', () => {
        expect(ids(mergeLatestWindow(old, gapped, false))).toEqual([1, 2, 3, 10, 11]);
    });

    it('isContiguousWindow: empty/undefined prev is contiguous; overlap yes; gap no', () => {
        expect(isContiguousWindow(undefined, gapped)).toBe(true);
        expect(isContiguousWindow([], gapped)).toBe(true);
        expect(isContiguousWindow(old, gapped)).toBe(false);
        expect(isContiguousWindow([...old, e(10, '2024-01-01T00:00:10Z')], gapped)).toBe(true);
        expect(isContiguousWindow(old, gapped, false)).toBe(true);
    });

    it('isContiguousWindow: a newer realtime id alone does not bridge a gap', () => {
        // Reconnect: a live message (12) landed before the resync; ids 4..9 are missing.
        const prev = [...old, e(12, '2024-01-01T00:00:12Z')];
        expect(isContiguousWindow(prev, gapped)).toBe(false);
        expect(ids(mergeLatestWindow(prev, gapped))).toEqual([10, 11]);
    });

    it('keeps a live-appended sender echo newer than a stale full-history window (hasMore=false)', () => {
        // Reconnect: history 90..100 is loaded, the sender's own live echo 101 is
        // appended by the WS handler, then a stale no-more-pages chats refetch
        // (still 90..100) lands. The echo is newer than the whole window and must
        // survive; today it is silently dropped.
        const at = (n: number) => new Date(Date.UTC(2024, 0, 1, 0, 0, n)).toISOString();
        const window = Array.from({ length: 11 }, (_, i) => e(90 + i, at(90 + i)));
        const prev = [...window, e(101, at(101))];
        expect(ids(mergeLatestWindow(prev, window, false))).toContain(101);
    });

    it('keeps a live id newer than the window when the window still has older pages (hasMore=true)', () => {
        const at = (n: number) => new Date(Date.UTC(2024, 0, 1, 0, 0, n)).toISOString();
        const window = Array.from({ length: 11 }, (_, i) => e(90 + i, at(90 + i)));
        const prev = [...window, e(101, at(101))];
        // The page overlaps at 90 (contiguous) but is not the full history.
        expect(ids(mergeLatestWindow(prev, window, true))).toContain(101);
    });

    it('keeps a newer live id when a non-contiguous window has no loaded older page (hasMore=true)', () => {
        // Reconnect/reload: only the sender's own live echo (101) is loaded. The
        // stale short window (90..100) does not carry the window's oldest id (90)
        // in prev, so it is non-contiguous. The echo is newer than the whole
        // window and the function's own doc promises it is always preserved;
        // today the non-contiguous early return drops it.
        const at = (n: number) => new Date(Date.UTC(2024, 0, 1, 0, 0, n)).toISOString();
        const window = Array.from({ length: 11 }, (_, i) => e(90 + i, at(90 + i)));
        const prev = [e(101, at(101))];
        expect(isContiguousWindow(prev, window, true)).toBe(false);
        expect(ids(mergeLatestWindow(prev, window, true))).toContain(101);
    });

    it('keeps a non-numeric live entry newer than the window by time', () => {
        const at = (n: number) => new Date(Date.UTC(2024, 0, 1, 0, 0, n)).toISOString();
        const prev = [e(90, at(90)), sys('system_live', at(101))];
        const fresh = [e(90, at(90)), e(91, at(91))];
        expect(ids(mergeLatestWindow(prev, fresh, false))).toContain('system_live');
    });
});

describe('reactions preservation', () => {
    const chip = (emoji: string, count = 1, mine = false): ReactionSummary => ({ emoji, count, mine });
    const withChips = (id: number, iso: string, reactions?: ReactionSummary[]): Entry => ({ ...e(id, iso), ...(reactions ? { reactions } : {}) });

    it('mergeLatestWindow: the server copy wins, replacing a stale local optimistic value', () => {
        const prev = [withChips(10, '2024-01-01T00:00:10Z', [chip('👍', 1, true)])];
        const fresh = [withChips(10, '2024-01-01T00:00:10Z', [chip('❤️', 2, false)])];
        expect(mergeLatestWindow(prev, fresh)[0]?.reactions).toEqual([chip('❤️', 2, false)]);
    });

    it('mergeLatestWindow: a refetch keeps the chips carried by the fresh window', () => {
        const prev = [e(9, '2024-01-01T00:00:09Z'), withChips(10, '2024-01-01T00:00:10Z', [chip('👍')])];
        const fresh = [withChips(10, '2024-01-01T00:00:10Z', [chip('👍')]), withChips(11, '2024-01-01T00:00:11Z', [chip('😂', 3, true)])];
        const merged = mergeLatestWindow(prev, fresh);
        expect(merged.map(m => m.reactions)).toEqual([undefined, [chip('👍')], [chip('😂', 3, true)]]);
    });

    it('mergeLatestWindow: a fresh copy without reactions clears the local ones (all reactions removed)', () => {
        const prev = [withChips(10, '2024-01-01T00:00:10Z', [chip('👍')])];
        const merged = mergeLatestWindow(prev, [e(10, '2024-01-01T00:00:10Z')]);
        expect(merged[0]?.reactions).toBeUndefined();
    });

    it('prependOlder: an older page overlapping a loaded message replaces its reactions with the server value', () => {
        const prev = [withChips(10, '2024-01-01T00:00:10Z', [chip('👍', 1, true)]), e(11, '2024-01-01T00:00:11Z')];
        const older = [withChips(9, '2024-01-01T00:00:09Z', [chip('🙏')]), withChips(10, '2024-01-01T00:00:10Z', [chip('👍', 2, false)])];
        const merged = prependOlder(prev, older);
        expect(ids(merged)).toEqual([9, 10, 11]);
        expect(merged[0]?.reactions).toEqual([chip('🙏')]);
        expect(merged[1]?.reactions).toEqual([chip('👍', 2, false)]);
    });

    it('prependOlder: keeps the loaded copy for every other field (edits are not rolled back)', () => {
        const prev = [{ ...withChips(10, '2024-01-01T00:00:10Z', [chip('👍')]), message: 'edited' }];
        const older = [withChips(10, '2024-01-01T00:00:10Z', [chip('👍')])];
        expect(prependOlder(prev, older)[0]?.message).toBe('edited');
    });
});
