import { describe, it, expect } from 'vitest';
import {
    normalizeGroupsResponse, normalizeGroupMessagesResponse, normalizeGroupDetailMessages,
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
