import api from './axios';
import type {
    PushConfig, PushPreviewRequest, PushSubscribeRequest, PushUnsubscribeRequest,
} from '../types/api';

/**
 * Web Push REST client (/api/v1/push/*). The config body is validated at runtime:
 * an unexpected body yields `null`, never a throw. Network/HTTP errors propagate
 * so callers decide whether to swallow them.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/** Runtime guard for GET push/config. Enabled without a key is unusable, so it is rejected too. */
export const parsePushConfig = (raw: unknown): PushConfig | null => {
    if (!isRecord(raw)) return null;
    const { enabled, publicKey, preview } = raw;
    if (typeof enabled !== 'boolean' || typeof publicKey !== 'string' || typeof preview !== 'boolean') return null;
    if (enabled && publicKey === '') return null;
    return { enabled, publicKey, preview };
};

/** GET /api/v1/push/config -> config, or null when the body is malformed. */
export const getPushConfig = async (): Promise<PushConfig | null> => {
    const { data } = await api.get<unknown>('/api/v1/push/config');
    return parsePushConfig(data);
};

/** POST /api/v1/push/subscribe — idempotent per endpoint (201 new / 200 already own). */
export const subscribePush = async (subscription: PushSubscribeRequest): Promise<void> => {
    await api.post<unknown>('/api/v1/push/subscribe', subscription);
};

/** DELETE /api/v1/push/subscribe — idempotent (204). */
export const unsubscribePush = async (endpoint: string): Promise<void> => {
    const body: PushUnsubscribeRequest = { endpoint };
    await api.delete<unknown>('/api/v1/push/subscribe', { data: body });
};

/** PUT /api/v1/push/preview — show/hide message text in push notifications. */
export const setPushPreview = async (preview: boolean): Promise<void> => {
    const body: PushPreviewRequest = { preview };
    await api.put<unknown>('/api/v1/push/preview', body);
};
