import type { MuteDuration, MuteResponse } from '../../../types/api';

/**
 * Per-chat mute (1:1 and groups). The lists carry PascalCase `Muted` / `MutedUntil`
 * (omitempty); the PUT answers camelCase `{ muted, mutedUntil }`. Everything here is
 * pure and tolerant: network data is untrusted and never throws.
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
    const until = parseTime(fields.MutedUntil);
    // No (or unparseable) end: the server said muted, so it is "always".
    return until === null || until > now;
}

/** Validates the mute fields of one list entry; anything that is not a mute becomes `{}`. */
export function parseMuteFields(raw: unknown): MuteFields {
    if (!isRecord(raw)) return {};
    const { Muted, MutedUntil } = raw;
    if (Muted !== true) return {};
    return typeof MutedUntil === 'string' && parseTime(MutedUntil) !== null ? { Muted: true, MutedUntil } : { Muted: true };
}

/** PUT response -> list fields, so both sources share one representation. */
export const muteFieldsFromResponse = (res: MuteResponse): MuteFields => (
    res.mutedUntil === null ? { Muted: true } : { Muted: true, MutedUntil: res.mutedUntil }
);

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
