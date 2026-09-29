import { describe, it, expect } from 'vitest';
import {
    normalizeGroupsResponse, normalizeGroupMessagesResponse, normalizeGroupDetailMessages,
    normalizeChatMessagesResponse, normalizeHasMore, normalizeGroupReceipts,
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
