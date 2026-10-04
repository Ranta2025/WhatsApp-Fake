import api from './axios';
import type { MuteDuration, MuteRequest, MuteResponse } from '../types/api';

/**
 * Per-chat mute REST client (1:1 and groups). The PUT body is validated at runtime:
 * an unexpected body yields `null`, never a throw. Network/HTTP errors propagate so
 * the caller decides how to report them.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/** Runtime guard for the PUT .../mute response (`mutedUntil` must be a valid date or null). */
export const parseMuteResponse = (raw: unknown): MuteResponse | null => {
    if (!isRecord(raw)) return null;
    const { muted, mutedUntil } = raw;
    if (muted !== true) return null;
    if (mutedUntil === null) return { muted, mutedUntil };
    if (typeof mutedUntil !== 'string' || Number.isNaN(Date.parse(mutedUntil))) return null;
    return { muted, mutedUntil };
};

const chatPath = (contact: string) => `/api/v1/chat/${encodeURIComponent(contact)}/mute`;
const groupPath = (groupID: number) => `/api/v1/group/${groupID}/mute`;

const putMute = async (path: string, duration: MuteDuration): Promise<MuteResponse | null> => {
    const body: MuteRequest = { duration };
    const { data } = await api.put<unknown>(path, body);
    return parseMuteResponse(data);
};

/** PUT /api/v1/chat/:contact/mute. */
export const setChatMute = (contact: string, duration: MuteDuration): Promise<MuteResponse | null> =>
    putMute(chatPath(contact), duration);

/** DELETE /api/v1/chat/:contact/mute — idempotent (204). */
export const clearChatMute = async (contact: string): Promise<void> => {
    await api.delete<unknown>(chatPath(contact));
};

/** PUT /api/v1/group/:groupID/mute. */
export const setGroupMute = (groupID: number, duration: MuteDuration): Promise<MuteResponse | null> =>
    putMute(groupPath(groupID), duration);

/** DELETE /api/v1/group/:groupID/mute — idempotent (204). */
export const clearGroupMute = async (groupID: number): Promise<void> => {
    await api.delete<unknown>(groupPath(groupID));
};
