import type { AxiosResponse } from 'axios';
import api from './axios';
import type {
    GroupResponse,
    GroupDetail,
    GroupMessageResponse,
    GroupCreateRequest,
    GroupAddMembersRequest,
    GroupMessageSendRequest,
    GroupMessageEditRequest,
    GroupMessageDeleteRequest,
    MediaType,
} from '../types/api';

// ── Group Management ─────────────────────────────────────────────────────────

/**
 * Create a new group.
 * @param name - Group name (required)
 * @param description - Optional description
 * @param members - Array of telephon numbers of initial members
 */
export const createGroup = (
    name: string,
    description: string | undefined,
    members: string[]
): Promise<AxiosResponse<{ group: GroupDetail }>> => {
    const body: GroupCreateRequest = { name, description, members };
    return api.post<{ group: GroupDetail }>('/api/v1/group', body);
};

/**
 * Get all groups the authenticated user belongs to.
 * Returns { groups: GroupResponse[] }
 */
export const getUserGroups = (): Promise<AxiosResponse<{ groups: GroupResponse[] }>> =>
    api.get<{ groups: GroupResponse[] }>('/api/v1/group');

/**
 * Get full detail of a specific group (including members).
 * Returns GroupDetail
 */
export const getGroupDetail = (groupID: number): Promise<AxiosResponse<GroupDetail>> =>
    api.get<GroupDetail>(`/api/v1/group/${groupID}`);

/**
 * Add members to an existing group.
 * @param groupID
 * @param members - Array of telephon numbers to add
 */
export const addGroupMembers = (
    groupID: number,
    members: string[]
): Promise<AxiosResponse<{ message: string }>> => {
    const body: GroupAddMembersRequest = { members };
    return api.post<{ message: string }>(`/api/v1/group/${groupID}/members`, body);
};

// ── Group Messages ────────────────────────────────────────────────────────────

export interface SendGroupMessageRestOptions {
    message: string;
    mediaUrl?: string;
    mediaType?: MediaType;
    replyToMessageID?: number;
}

/**
 * Send a message to a group via REST (fallback / media).
 */
export const sendGroupMessageRest = (
    groupID: number,
    { message, mediaUrl, mediaType, replyToMessageID }: SendGroupMessageRestOptions
): Promise<AxiosResponse<{ message: GroupMessageResponse }>> => {
    const body: GroupMessageSendRequest = {
        groupID,
        message,
        mediaUrl,
        mediaType,
        replyToMessageID,
    };
    return api.post<{ message: GroupMessageResponse }>(`/api/v1/group/${groupID}/message`, body);
};

/**
 * Get paginated messages for a group (newest first).
 * @param groupID
 * @param limit  - default 50
 * @param offset - default 0
 * @param before - cursor: only messages with id < before (older page); omitted when undefined
 */
export const getGroupMessages = (
    groupID: number,
    limit = 50,
    offset = 0,
    before?: number
): Promise<AxiosResponse<{ messages: GroupMessageResponse[]; hasMore?: boolean }>> =>
    api.get<{ messages: GroupMessageResponse[]; hasMore?: boolean }>(`/api/v1/group/${groupID}/message`, {
        params: before === undefined ? { limit, offset } : { limit, offset, before },
    });

/**
 * Edit a group message.
 */
export const editGroupMessage = (
    groupID: number,
    messageID: number,
    message: string
): Promise<AxiosResponse<{ message: GroupMessageResponse }>> => {
    const body: GroupMessageEditRequest = { messageID, message };
    return api.put<{ message: GroupMessageResponse }>(`/api/v1/group/${groupID}/message`, body);
};

/**
 * Delete a group message (for everyone).
 */
export const deleteGroupMessage = (
    groupID: number,
    messageID: number
): Promise<AxiosResponse<{ message: string }>> => {
    const body: GroupMessageDeleteRequest = { messageID };
    return api.delete<{ message: string }>(`/api/v1/group/${groupID}/message`, { data: body });
};

/**
 * Leave a group (remove self from membership).
 * The group stays visible in read-only mode until the user removes it.
 */
export const leaveGroup = (groupID: number): Promise<AxiosResponse<{ message: string }>> =>
    api.delete<{ message: string }>(`/api/v1/group/${groupID}/member`);

/**
 * Update the group avatar.
 * @param groupID
 * @param avatarUrl - URL returned by the media upload endpoint
 */
export const updateGroupAvatar = (
    groupID: number,
    avatarUrl: string
): Promise<AxiosResponse<{ avatarUrl: string }>> =>
    api.patch<{ avatarUrl: string }>(`/api/v1/group/${groupID}/avatar`, { avatarUrl });
