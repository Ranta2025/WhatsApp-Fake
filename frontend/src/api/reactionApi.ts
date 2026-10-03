import api from './axios';
import type { MessageReactionsResponse } from '../types/api';
import { normalizeReactionUsers } from '../features/dashboard/lib/normalizeResponses';

/**
 * Who reacted with what (any participant/member may read it).
 * 1:1: GET /api/v1/chat/message/:id/reactions
 * Group: GET /api/v1/group/:groupID/message/:messageID/reactions
 * The body is validated at runtime: malformed entries are dropped, never thrown.
 */
export const getReactions = async (
    kind: 'direct' | 'group',
    messageID: number,
    groupID?: number,
): Promise<MessageReactionsResponse> => {
    if (kind === 'group' && groupID === undefined) {
        throw new Error('getReactions: groupID is required for group messages');
    }
    const url = kind === 'group'
        ? `/api/v1/group/${groupID}/message/${messageID}/reactions`
        : `/api/v1/chat/message/${messageID}/reactions`;
    const { data } = await api.get<unknown>(url);
    return normalizeReactionUsers(data);
};
