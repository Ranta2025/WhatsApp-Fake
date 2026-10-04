import { describe, it, expect } from 'vitest';
import {
    normalizeGroupsResponse, normalizeGroupMessagesResponse, normalizeGroupDetailMessages,
    normalizeChatMessagesResponse, normalizeHasMore, normalizeGroupReceipts,
    normalizeReactions, normalizeReactionUsers,
} from './normalizeResponses';

// R3-dashboard-null-body-guards-removed: fetchUserGroups/fetchGroupMessages/
// fetchGroupDetail read `data.groups`/`data.messages`/`data.Messages`
// straight off the axios response. The JS version guarded with
// `data?.groups` etc. (empty/null body -> reset to []); typing `data` as the
// non-nullable REST shape dropped that guard. These normalizers restore the
// tolerant behavior and are pure/testable independent of axios or React.

describe('normalizeGroupsResponse', () => {
    it('returns [] for a null body', () => {
        expect(normalizeGroupsResponse(null)).toEqual([]);
    });

    it('returns [] for an undefined body', () => {
        expect(normalizeGroupsResponse(undefined)).toEqual([]);
    });

    it('returns [] when groups is missing from the body', () => {
        expect(normalizeGroupsResponse({})).toEqual([]);
    });

    it('returns the groups array when present', () => {
        const groups = [{ ID: 1 }];
        expect(normalizeGroupsResponse({ groups })).toBe(groups);
    });
});

describe('normalizeGroupMessagesResponse', () => {
    it('returns [] for a null body', () => {
        expect(normalizeGroupMessagesResponse(null)).toEqual([]);
    });

    it('returns [] when messages is missing from the body', () => {
        expect(normalizeGroupMessagesResponse({})).toEqual([]);
    });

    it('returns the messages array when present', () => {
        const messages = [{ MessageID: 'a' }];
        expect(normalizeGroupMessagesResponse({ messages })).toBe(messages);
    });
});

describe('normalizeGroupDetailMessages', () => {
    it('returns [] for a null body', () => {
        expect(normalizeGroupDetailMessages(null)).toEqual([]);
    });

    it('returns [] when Messages is missing from the body', () => {
        expect(normalizeGroupDetailMessages({ ID: 1 })).toEqual([]);
    });

    it('returns Messages when present', () => {
        const Messages = [{ MessageID: 'a' }];
        expect(normalizeGroupDetailMessages({ Messages })).toBe(Messages);
    });
});

describe('normalizeChatMessagesResponse', () => {
    it('returns [] for null, undefined and non-array bodies', () => {
        expect(normalizeChatMessagesResponse(null)).toEqual([]);
        expect(normalizeChatMessagesResponse(undefined)).toEqual([]);
        expect(normalizeChatMessagesResponse({ messages: [] })).toEqual([]);
    });

    it('drops entries without a numeric MessageID (they cannot be cursors or dedupe keys)', () => {
        const ok = { MessageID: 3, Message: 'hola' };
        expect(normalizeChatMessagesResponse([ok, null, 'x', { MessageID: '4' }, {}])).toEqual([ok]);
    });
});

describe('normalizeHasMore', () => {
    it('reads a boolean hasMore off an object body', () => {
        expect(normalizeHasMore({ hasMore: true })).toBe(true);
        expect(normalizeHasMore({ hasMore: false })).toBe(false);
    });

    it('returns undefined when absent or not a boolean', () => {
        expect(normalizeHasMore(null)).toBeUndefined();
        expect(normalizeHasMore({})).toBeUndefined();
        expect(normalizeHasMore({ hasMore: 'true' })).toBeUndefined();
    });
});

describe('normalizeGroupReceipts', () => {
    it('keeps well-formed member briefs in each list', () => {
        expect(normalizeGroupReceipts({
            readBy: [{ telephon: '1', username: 'ana', avatarUrl: '/a.png' }],
            deliveredTo: [{ telephon: '2', username: 'luis' }],
            pending: [],
        })).toEqual({
            readBy: [{ telephon: '1', username: 'ana', avatarUrl: '/a.png' }],
            deliveredTo: [{ telephon: '2', username: 'luis' }],
            pending: [],
        });
    });

    it('degrades null / non-object / missing lists to empty lists', () => {
        const empty = { readBy: [], deliveredTo: [], pending: [] };
        expect(normalizeGroupReceipts(null)).toEqual(empty);
        expect(normalizeGroupReceipts(undefined)).toEqual(empty);
        expect(normalizeGroupReceipts('x')).toEqual(empty);
        expect(normalizeGroupReceipts({ readBy: 'nope', deliveredTo: null })).toEqual(empty);
    });

    it('drops malformed entries and falls back to the telephon when the username is not a string', () => {
        expect(normalizeGroupReceipts({
            readBy: [null, 7, {}, { telephon: 5 }, { telephon: '3', username: 9 }, { telephon: '' }],
        }).readBy).toEqual([{ telephon: '3', username: '3' }]);
    });
});

describe('normalizeReactions', () => {
    it('returns undefined for absent / non-array / empty values', () => {
        expect(normalizeReactions(undefined)).toBeUndefined();
        expect(normalizeReactions(null)).toBeUndefined();
        expect(normalizeReactions('x')).toBeUndefined();
        expect(normalizeReactions([])).toBeUndefined();
    });

    it('keeps valid entries and drops malformed ones without throwing', () => {
        const out = normalizeReactions([
            { Emoji: '👍', Count: 2, Mine: true },
            { Emoji: '', Count: 1, Mine: false },
            { Emoji: '❤️', Count: 0, Mine: false },
            { Emoji: '😂', Count: 1.5, Mine: false },
            { Emoji: '😮', Count: -1, Mine: false },
            { Emoji: '😢', Count: '3', Mine: false },
            { Emoji: '🙏', Count: 1, Mine: 'yes' },
            { Emoji: 7, Count: 1, Mine: false },
            null, 'x', 4,
            { Emoji: '🙏', Count: 3, Mine: false },
        ]);
        expect(out).toEqual([{ Emoji: '👍', Count: 2, Mine: true }, { Emoji: '🙏', Count: 3, Mine: false }]);
    });

    it('drops duplicated emojis keeping the first occurrence', () => {
        expect(normalizeReactions([{ Emoji: '👍', Count: 2, Mine: true }, { Emoji: '👍', Count: 1, Mine: false }]))
            .toEqual([{ Emoji: '👍', Count: 2, Mine: true }]);
    });
});

describe('Reactions inside message normalizers', () => {
    const msg = (extra: Record<string, unknown> = {}) => ({ MessageID: 1, Time: '2024-01-01T00:00:00Z', ...extra });

    it('normalizeChatMessagesResponse sanitizes Reactions and removes an all-invalid field', () => {
        const [a, b] = normalizeChatMessagesResponse([
            msg({ Reactions: [{ Emoji: '👍', Count: 1, Mine: false }, { nope: true }] }),
            msg({ MessageID: 2, Reactions: [{ nope: true }] }),
        ]);
        expect(a?.Reactions).toEqual([{ Emoji: '👍', Count: 1, Mine: false }]);
        expect('Reactions' in (b ?? {})).toBe(false);
    });

    it('group history / detail normalizers sanitize Reactions too', () => {
        const [g] = normalizeGroupMessagesResponse({ messages: [msg({ Reactions: [{ Emoji: '🙏', Count: 2, Mine: true }, null] })] });
        expect(g?.Reactions).toEqual([{ Emoji: '🙏', Count: 2, Mine: true }]);
        const [d] = normalizeGroupDetailMessages({ Messages: [msg({ Reactions: 'garbage' })] });
        expect('Reactions' in (d ?? {})).toBe(false);
    });
});

describe('normalizeReactionUsers', () => {
    it('returns an empty list for a malformed body', () => {
        expect(normalizeReactionUsers(null)).toEqual({ reactions: [] });
        expect(normalizeReactionUsers({ reactions: 'x' })).toEqual({ reactions: [] });
    });

    it('keeps valid groups, drops malformed groups and users, defaults username/avatar', () => {
        expect(normalizeReactionUsers({
            reactions: [
                { emoji: '👍', users: [{ telephon: '1', username: 'ana', avatarUrl: 'a.png' }, { username: 'x' }, { telephon: '2' }] },
                { emoji: '', users: [{ telephon: '3', username: 'z', avatarUrl: '' }] },
                { emoji: '❤️', users: 'x' },
                { emoji: '😂', users: [] },
                null,
            ],
        })).toEqual({
            reactions: [{ emoji: '👍', users: [
                { telephon: '1', username: 'ana', avatarUrl: 'a.png' },
                { telephon: '2', username: '2', avatarUrl: '' },
            ] }],
        });
    });
});
