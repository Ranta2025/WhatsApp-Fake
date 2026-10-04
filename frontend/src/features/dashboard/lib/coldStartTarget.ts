import type { NotificationTarget } from '../../../utils/notificationTarget';

/**
 * Cold-start deep link written by the Service Worker when a notification is
 * clicked with no app window open (see `openUrlFor` in src/sw/click.ts):
 * `/dashboard?chat=<encodeURIComponent(telephon)>` or `/dashboard?group=<id>`.
 */
const CHAT_PARAM = 'chat';
const GROUP_PARAM = 'group';

/** Parses the cold-start target; `chat` wins if both are present. Null when absent or malformed. */
export function parseColdStartTarget(search: string): NotificationTarget | null {
    const params = new URLSearchParams(search);
    const telephon = params.get(CHAT_PARAM);
    if (telephon) return { kind: 'direct', telephon };
    const group = params.get(GROUP_PARAM);
    if (group && /^\d+$/.test(group)) {
        const groupID = Number(group);
        if (Number.isSafeInteger(groupID) && groupID > 0) return { kind: 'group', groupID };
    }
    return null;
}

export function hasColdStartParams(search: string): boolean {
    const params = new URLSearchParams(search);
    return params.has(CHAT_PARAM) || params.has(GROUP_PARAM);
}

/** Search string without the cold-start params ('' when nothing else remains). */
export function stripColdStartParams(search: string): string {
    const params = new URLSearchParams(search);
    params.delete(CHAT_PARAM);
    params.delete(GROUP_PARAM);
    const rest = params.toString();
    return rest ? `?${rest}` : '';
}
