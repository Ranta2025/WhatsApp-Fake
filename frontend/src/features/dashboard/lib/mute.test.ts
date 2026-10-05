import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    isChatMuted, parseMuteFields, muteFieldsFromResponse, earliestMuteExpiry, MUTE_OPTIONS,
} from './mute';

const NOW = Date.parse('2026-10-04T12:00:00Z');
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe('isChatMuted', () => {
    it('Muted without MutedUntil is "always"', () => {
        expect(isChatMuted({ Muted: true }, NOW)).toBe(true);
    });

    it('a future MutedUntil is muted', () => {
        expect(isChatMuted({ Muted: true, MutedUntil: at(60_000) }, NOW)).toBe(true);
    });

    it('a past (or exactly now) MutedUntil is not muted, even if the list still says Muted', () => {
        expect(isChatMuted({ Muted: true, MutedUntil: at(-1) }, NOW)).toBe(false);
        expect(isChatMuted({ Muted: true, MutedUntil: at(0) }, NOW)).toBe(false);
    });

    it('an unparseable MutedUntil is not muted (never "always")', () => {
        expect(isChatMuted({ Muted: true, MutedUntil: 'garbage' }, NOW)).toBe(false);
    });

    it('absent / false / undefined fields are not muted', () => {
        expect(isChatMuted({}, NOW)).toBe(false);
        expect(isChatMuted({ Muted: false }, NOW)).toBe(false);
        expect(isChatMuted({ Muted: false, MutedUntil: at(60_000) }, NOW)).toBe(false);
        expect(isChatMuted(undefined, NOW)).toBe(false);
    });
});

describe('parseMuteFields', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('keeps a valid mute, drops everything else', () => {
        expect(parseMuteFields({ Muted: true, MutedUntil: at(1000) })).toEqual({ Muted: true, MutedUntil: at(1000) });
        expect(parseMuteFields({ Muted: true })).toEqual({ Muted: true });
        expect(parseMuteFields({ Muted: false, MutedUntil: at(1000) })).toEqual({});
        expect(parseMuteFields({ Muted: 'yes' })).toEqual({});
        expect(parseMuteFields(null)).toEqual({});
        expect(parseMuteFields('x')).toEqual({});
    });

    it('a malformed MutedUntil with Muted:true is NOT muted and warns (never silently "always")', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(parseMuteFields({ Muted: true, MutedUntil: 'garbage' })).toEqual({});
        expect(parseMuteFields({ Muted: true, MutedUntil: 42 })).toEqual({});
        expect(parseMuteFields({ Muted: true, MutedUntil: '' })).toEqual({});
        expect(parseMuteFields({ Muted: true, MutedUntil: null })).toEqual({});
        expect(warn).toHaveBeenCalledTimes(4);
        warn.mockClear();
        parseMuteFields({ Muted: true });
        parseMuteFields({ Muted: true, MutedUntil: at(1000) });
        parseMuteFields({ Muted: false, MutedUntil: 'garbage' });
        expect(warn).not.toHaveBeenCalled();
    });
});

describe('muteFieldsFromResponse', () => {
    it('maps the camelCase PUT response to the list fields', () => {
        expect(muteFieldsFromResponse({ muted: true, mutedUntil: at(5) })).toEqual({ Muted: true, MutedUntil: at(5) });
        expect(muteFieldsFromResponse({ muted: true, mutedUntil: null })).toEqual({ Muted: true });
    });

    it('re-bases MutedUntil on the client clock using the server Date (clock skew)', () => {
        const serverNow = NOW + 3_600_000; // server clock one hour ahead of the client
        const res = { muted: true as const, mutedUntil: new Date(serverNow + 8 * 3_600_000).toISOString() };
        expect(muteFieldsFromResponse(res, serverNow, NOW)).toEqual({ Muted: true, MutedUntil: at(8 * 3_600_000) });
        // Client ahead of the server.
        expect(muteFieldsFromResponse({ muted: true, mutedUntil: at(1000) }, NOW - 5000, NOW))
            .toEqual({ Muted: true, MutedUntil: at(6000) });
    });

    it('keeps the raw value without a (valid) server Date, and "always" stays "always"', () => {
        expect(muteFieldsFromResponse({ muted: true, mutedUntil: at(5) }, null, NOW + 999)).toEqual({ Muted: true, MutedUntil: at(5) });
        expect(muteFieldsFromResponse({ muted: true, mutedUntil: at(5) }, Number.NaN, NOW)).toEqual({ Muted: true, MutedUntil: at(5) });
        expect(muteFieldsFromResponse({ muted: true, mutedUntil: null }, NOW + 1000, NOW)).toEqual({ Muted: true });
    });
});

describe('earliestMuteExpiry', () => {
    it('returns the earliest MutedUntil still in the future, ignoring "always" and past ones', () => {
        expect(earliestMuteExpiry([
            { Muted: true },
            { Muted: true, MutedUntil: at(-5) },
            { Muted: true, MutedUntil: at(9000) },
            { Muted: true, MutedUntil: at(3000) },
            {},
        ], NOW)).toBe(NOW + 3000);
        expect(earliestMuteExpiry([{ Muted: true }, {}], NOW)).toBeNull();
    });
});

describe('MUTE_OPTIONS', () => {
    it('offers the WhatsApp durations in order', () => {
        expect(MUTE_OPTIONS).toEqual([
            { duration: '8h', label: '8 horas' },
            { duration: '1w', label: '1 semana' },
            { duration: 'always', label: 'Siempre' },
        ]);
    });
});
