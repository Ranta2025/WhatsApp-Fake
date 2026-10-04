import api from './axios';
import type { DisappearingChangedEvent } from '../features/dashboard/lib/disappearingEvents';
import { parseDisappearingChanged } from '../features/dashboard/lib/disappearingEvents';
import { isDisappearSeconds, normalizeDisappearSeconds } from '../features/dashboard/lib/disappearing';

/**
 * Disappearing-messages REST client. The PUT responses are the same envelope the
 * server broadcasts as the WS `disappearing_changed` event, so the caller applies
 * both through one path (idempotent: the system message dedupes by id). Bodies are
 * validated at runtime; an unexpected body yields `null`, never a throw.
 */

const assertSeconds = (seconds: number): void => {
    if (!isDisappearSeconds(seconds)) throw new Error(`disappearing: invalid seconds ${seconds}`);
};

/** PUT /api/v1/chat/:contact/disappearing — either participant may change it. */
export const setChatDisappearing = async (contact: string, seconds: number): Promise<DisappearingChangedEvent | null> => {
    assertSeconds(seconds);
    const { data } = await api.put<unknown>(`/api/v1/chat/${encodeURIComponent(contact)}/disappearing`, { seconds });
    return parseDisappearingChanged(data);
};

/** GET /api/v1/chat/:contact/settings -> current 1:1 timer, or null when the body is malformed. */
export const getChatDisappearing = async (contact: string): Promise<number | null> => {
    const { data } = await api.get<unknown>(`/api/v1/chat/${encodeURIComponent(contact)}/settings`);
    if (typeof data !== 'object' || data === null) return null;
    const raw = (data as { disappearSeconds?: unknown }).disappearSeconds;
    return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? normalizeDisappearSeconds(raw) : null;
};

/** PUT /api/v1/group/:groupID/disappearing — same permission as editing the group info. */
export const setGroupDisappearing = async (groupID: number, seconds: number): Promise<DisappearingChangedEvent | null> => {
    assertSeconds(seconds);
    const { data } = await api.put<unknown>(`/api/v1/group/${groupID}/disappearing`, { seconds });
    return parseDisappearingChanged(data);
};
