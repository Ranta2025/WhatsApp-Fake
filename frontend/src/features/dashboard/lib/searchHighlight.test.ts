import { describe, it, expect } from 'vitest';
import { foldChars, findMatchRanges, splitByRanges } from './searchHighlight';

describe('foldChars', () => {
    it('lowercases and strips accents one codepoint at a time (offsets are preserved)', () => {
        const input = 'CANCIÓN Ñandú 😀 ÀÉÎõü';
        expect(foldChars(input)).toHaveLength(Array.from(input).length);
        expect(foldChars(input).join('')).toBe('cancion nandu 😀 aeiou');
    });
});

describe('findMatchRanges', () => {
    it('matches without regard to case or accents, in rune indices', () => {
        expect(findMatchRanges('Hola CANCIÓN mía', 'cancion')).toEqual([[5, 12]]);
        expect(findMatchRanges('una cancion', 'canción')).toEqual([[4, 11]]);
    });

    it('finds every non-overlapping occurrence', () => {
        expect(findMatchRanges('ana banana', 'an')).toEqual([[0, 2], [5, 7], [7, 9]]);
        expect(findMatchRanges('aaaa', 'aa')).toEqual([[0, 2], [2, 4]]);
    });

    it('treats wildcard-looking characters literally and trims the query', () => {
        expect(findMatchRanges('descuento 50% hoy', ' 50% ')).toEqual([[10, 13]]);
        expect(findMatchRanges('a_b', '_')).toEqual([[1, 2]]);
    });

    it('counts astral characters as one rune', () => {
        expect(findMatchRanges('😀😀 canción', 'cancion')).toEqual([[3, 10]]);
    });

    it('returns nothing for an empty query or no match', () => {
        expect(findMatchRanges('hola', '')).toEqual([]);
        expect(findMatchRanges('hola', '   ')).toEqual([]);
        expect(findMatchRanges('hola', 'zzz')).toEqual([]);
    });
});

describe('splitByRanges', () => {
    it('splits text into plain and matched segments, keeping the original characters', () => {
        expect(splitByRanges('Hola CANCIÓN mía', [[5, 12]])).toEqual([
            { text: 'Hola ', match: false },
            { text: 'CANCIÓN', match: true },
            { text: ' mía', match: false },
        ]);
    });

    it('handles matches at the edges, adjacent matches and no ranges', () => {
        expect(splitByRanges('abab', [[0, 2], [2, 4]])).toEqual([{ text: 'ab', match: true }, { text: 'ab', match: true }]);
        expect(splitByRanges('hola', [])).toEqual([{ text: 'hola', match: false }]);
        expect(splitByRanges('', [])).toEqual([]);
    });

    it('splits by rune, not by UTF-16 unit', () => {
        expect(splitByRanges('😀ab', [[1, 3]])).toEqual([{ text: '😀', match: false }, { text: 'ab', match: true }]);
    });
});
