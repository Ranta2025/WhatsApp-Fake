import api from './axios';

// ── Group Management ─────────────────────────────────────────────────────────

/**
 * Create a new group.
 * @param {string} name - Group name (required)
 * @param {string} description - Optional description
 * @param {string[]} members - Array of telephon numbers of initial members
 */
export const createGroup = (name, description, members) =>
    api.post('/api/v1/group', { name, description, members });

/**
 * Get all groups the authenticated user belongs to.
 * Returns { groups: GroupResponse[] }
 */
export const getUserGroups = () =>
    api.get('/api/v1/group');

/**
 * Get full detail of a specific group (including members).
 * Returns GroupDetail
 */
export const getGroupDetail = (groupID) =>
    api.get(`/api/v1/group/${groupID}`);

/**
 * Add members to an existing group.
 * @param {number} groupID
 * @param {string[]} members - Array of telephon numbers to add
 */
export const addGroupMembers = (groupID, members) =>
    api.post(`/api/v1/group/${groupID}/members`, { members });

// ── Group Messages ────────────────────────────────────────────────────────────

/**
 * Send a message to a group via REST (fallback / media).
 */
export const sendGroupMessageRest = (groupID, { message, mediaUrl, mediaType, replyToMessageID }) =>
    api.post(`/api/v1/group/${groupID}/message`, {
        groupID,
        message,
        mediaUrl,
        mediaType,
        replyToMessageID,
    });

/**
 * Get paginated messages for a group.
 * @param {number} groupID
 * @param {number} limit  - default 50
 * @param {number} offset - default 0
 */
export const getGroupMessages = (groupID, limit = 50, offset = 0) =>
    api.get(`/api/v1/group/${groupID}/message`, { params: { limit, offset } });

/**
 * Edit a group message.
 */
export const editGroupMessage = (groupID, messageID, message) =>
    api.put(`/api/v1/group/${groupID}/message`, { groupID, messageID, message });

/**
 * Delete a group message (for everyone).
 */
export const deleteGroupMessage = (groupID, messageID) =>
    api.delete(`/api/v1/group/${groupID}/message`, { data: { groupID, messageID } });

/**
 * Leave a group (remove self from membership).
 * The group stays visible in read-only mode until the user removes it.
 */
export const leaveGroup = (groupID) =>
    api.delete(`/api/v1/group/${groupID}/member`);

/**
 * Update the group avatar.
 * @param {number} groupID
 * @param {string} avatarUrl - URL returned by the media upload endpoint
 */
export const updateGroupAvatar = (groupID, avatarUrl) =>
    api.patch(`/api/v1/group/${groupID}/avatar`, { avatarUrl });

/**
 * Set the role of a group member. Admin-only.
 * @param {number} groupID
 * @param {string} number - telephon of the target member
 * @param {'admin'|'member'} role
 */
export const setMemberRole = (groupID, number, role) =>
    api.patch(`/api/v1/group/${groupID}/member/role`, { number, role });

/**
 * Update the group description. Admin-only.
 * @param {number} groupID
 * @param {string} description - New description (max 300 chars, empty string to clear)
 */
export const updateGroupDescription = (groupID, description) =>
    api.patch(`/api/v1/group/${groupID}/description`, { description });
