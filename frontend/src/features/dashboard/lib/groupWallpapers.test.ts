import { describe, it, expect } from 'vitest';
import { parseGroupWallpapers } from './groupWallpapers';

// The per-group wallpaper map lives in localStorage (`group_wallpapers`) and
// is broadcast through a `group-wallpaper-changed` CustomEvent. Both are
// untyped runtime data: a corrupt value must degrade to `{}`, not crash render
// (`JSON.parse('null')[id]` used to throw a TypeError in GroupChatWindow).

describe('parseGroupWallpapers', () => {
    it('parses a JSON object of id -> url', () => {
        expect(parseGroupWallpapers('{"1":"a.png","2":"b.png"}')).toEqual({ '1': 'a.png', '2': 'b.png' });
    });

    it('returns {} for missing, invalid or non-object JSON', () => {
        expect(parseGroupWallpapers(null)).toEqual({});
        expect(parseGroupWallpapers('')).toEqual({});
        expect(parseGroupWallpapers('{oops')).toEqual({});
        expect(parseGroupWallpapers('null')).toEqual({});
        expect(parseGroupWallpapers('42')).toEqual({});
        expect(parseGroupWallpapers('[1,2]')).toEqual({});
    });

    it('accepts an already-parsed value (event detail) and drops non-string entries', () => {
        expect(parseGroupWallpapers({ '1': 'a.png', '2': 5, '3': null })).toEqual({ '1': 'a.png' });
        expect(parseGroupWallpapers(undefined)).toEqual({});
        expect(parseGroupWallpapers(null)).toEqual({});
    });
});
