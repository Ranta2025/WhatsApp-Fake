import { describe, it, expect } from 'vitest';
import { groupReplySenderLabel } from './groupReply';
import type { GroupMemberResponse } from '../../../types/api';

// The backend never sends a `ReplyToSender` field on group messages (only
// `ReplyToTelephon`/`ReplyToMessage`), so the reply preview in the group chat
// always rendered an empty sender line. The label is now derived from the
// replied-to telephon.

const members: GroupMemberResponse[] = [
    { Telephon: '111', Username: 'ana', Role: 'admin' },
    { Telephon: '222', Username: 'bob', Role: 'member', ContactName: 'Bobby' },
];

describe('groupReplySenderLabel', () => {
    it('is "Tú" when the replied-to message is mine', () => {
        expect(groupReplySenderLabel('111', '111', members)).toBe('Tú');
    });

    it('uses the member username otherwise', () => {
        expect(groupReplySenderLabel('222', '111', members)).toBe('bob');
    });

    it('falls back to the telephon for unknown senders or unloaded members', () => {
        expect(groupReplySenderLabel('999', '111', members)).toBe('999');
        expect(groupReplySenderLabel('222', '111', undefined)).toBe('222');
    });

    it('is empty when the message carries no ReplyToTelephon', () => {
        expect(groupReplySenderLabel(undefined, '111', members)).toBe('');
        expect(groupReplySenderLabel('', '111', members)).toBe('');
    });
});
