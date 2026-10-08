import type { MuteDuration, MuteResponse } from '../../../types/api';

/**
 * Per-chat mute (1:1 and groups). The 1:1 contact list carries camelCase
 * `muted` / `mutedUntil` (AC3); the group lists still carry PascalCase
 * `Muted` / `MutedUntil` (until AC4/AC5); the PUT answers camelCase
 * `{ muted, mutedUntil }`. `parseMuteFields` accepts both spellings. Everything
 * here is pure and tolerant: network data is untrusted and never throws.
 */

/** Mute fields as the lists carry them: absent `Muted` = not muted; `Muted` without `MutedUntil` = always. */
export interface MuteFields {
    Muted?: boolean;
    MutedUntil?: string;
}

export interface MuteOption {
    duration: MuteDuration;
    label: string;
}

export const MUTE_OPTIONS: readonly MuteOption[] = [
    { duration: '8h', label: '8 horas' },
    { duration: '1w', label: '1 semana' },
    { duration: 'always', label: 'Siempre' },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const parseTime = (value: unknown): number | null => {
    if (typeof value !== 'string' || value === '') return null;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
};

/** True while muted at `now` (epoch ms). A `MutedUntil <= now` is expired even if `Muted` is still true. */
export function isChatMuted(fields: MuteFields | undefined, now: number): boolean {
    if (fields?.Muted !== true) return false;
    // No end at all is "always"; an end that does not parse is not a mute (never a silent "always").
    if (fields.MutedUntil === undefined) return true;
    const until = parseTime(fields.MutedUntil);
    return until !== null && until > now;
}

/**
 * Validates the mute fields of one list entry; anything that is not a mute becomes `{}`.
 * `Muted:true` with a present but malformed `MutedUntil` is treated as NOT muted (and
 * warned about): degrading it to "always" would silence a chat forever on a bad value.
 */
export function parseMuteFields(raw: unknown): MuteFields {
    if (!isRecord(raw)) return {};
    // AC3 renamed ContactChat's mute keys to camelCase (muted/mutedUntil); the
    // group lists (ChatGroup/GroupResponse) still emit PascalCase (Muted/
    // MutedUntil) until AC4/AC5, so both spellings are accepted in this window.
    const Muted = raw.muted !== undefined ? raw.muted : raw.Muted;
    const MutedUntil = raw.mutedUntil !== undefined ? raw.mutedUntil : raw.MutedUntil;
    if (Muted !== true) return {};
    if (MutedUntil === undefined) return { Muted: true };
    if (typeof MutedUntil === 'string' && parseTime(MutedUntil) !== null) return { Muted: true, MutedUntil };
    console.warn('Ignoring mute with a malformed MutedUntil:', MutedUntil);
    return {};
}

/**
 * PUT response -> list fields, so both sources share one representation. With the server's
 * clock at answer time (`serverDate`, epoch ms from the `Date` header) the end is re-based on
 * the client clock (`now + (mutedUntil - serverDate)`), so a skewed device still unmutes when
 * the server does; without a valid one the raw value is kept.
 */
export const muteFieldsFromResponse = (
    res: MuteResponse, serverDate: number | null = null, now: number = Date.now(),
): MuteFields => {
    if (res.mutedUntil === null) return { Muted: true };
    const until = parseTime(res.mutedUntil);
    if (until === null || serverDate === null || !Number.isFinite(serverDate)) {
        return { Muted: true, MutedUntil: res.mutedUntil };
    }
    return { Muted: true, MutedUntil: new Date(now + (until - serverDate)).toISOString() };
};

/** Earliest `MutedUntil` (epoch ms) still in the future, or null (drives one re-render when a mute ends). */
export function earliestMuteExpiry(entries: Iterable<MuteFields>, now: number): number | null {
    let earliest: number | null = null;
    for (const fields of entries) {
        if (fields.Muted !== true) continue;
        const until = parseTime(fields.MutedUntil);
        if (until === null || until <= now) continue;
        if (earliest === null || until < earliest) earliest = until;
    }
    return earliest;
}
