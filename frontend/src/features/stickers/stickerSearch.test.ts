import { describe, expect, it } from 'vitest';
import { filterByTags, matchesTags, normalizeForSearch } from './stickerSearch';

// SF6: client-side tag search for the panel. The lists are small (built-in
// packs + the user's own stickers), so filtering is done in memory. Matching is
// case- and accent-insensitive: a user typing "Corazón" must find the "corazon"
// tag, and vice versa.

describe('normalizeForSearch', () => {
  it('lowercases and strips Latin diacritics', () => {
    expect(normalizeForSearch('Corazón')).toBe('corazon');
    expect(normalizeForSearch('Fête')).toBe('fete');
    expect(normalizeForSearch('PIÑA')).toBe('pina');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeForSearch('  HOLA  ')).toBe('hola');
  });

  it('is idempotent', () => {
    expect(normalizeForSearch(normalizeForSearch('Canción'))).toBe('cancion');
  });

  it('returns an empty string for an empty or whitespace-only value', () => {
    expect(normalizeForSearch('')).toBe('');
    expect(normalizeForSearch('   ')).toBe('');
  });
});

describe('matchesTags', () => {
  it('matches a tag regardless of accents and case on either side', () => {
    expect(matchesTags('Corazón', ['corazon', 'amor'])).toBe(true);
    expect(matchesTags('corazon', ['Corazón'])).toBe(true);
    expect(matchesTags('AMOR', ['amor'])).toBe(true);
  });

  it('matches a partial substring of a tag', () => {
    expect(matchesTags('cor', ['corazon'])).toBe(true);
    expect(matchesTags('azon', ['corazon'])).toBe(true);
  });

  it('matches when any tag matches', () => {
    expect(matchesTags('risa', ['jaja', 'risa', 'laugh'])).toBe(true);
  });

  it('treats an empty query as a match', () => {
    expect(matchesTags('', ['nada'])).toBe(true);
    expect(matchesTags('   ', [])).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(matchesTags('pizza', ['corazon', 'amor'])).toBe(false);
  });
});

describe('filterByTags', () => {
  const items = [
    { id: 'a', tags: ['hola', 'saludo'] },
    { id: 'b', tags: ['corazon', 'amor'] },
    { id: 'c', tags: ['jaja', 'risa'] },
  ];

  it('filters by tag and preserves order', () => {
    expect(filterByTags('hola', items).map((item) => item.id)).toEqual(['a']);
    expect(filterByTags('risa', items).map((item) => item.id)).toEqual(['c']);
  });

  it('is accent- and case-insensitive', () => {
    expect(filterByTags('CORAZÓN', items).map((item) => item.id)).toEqual(['b']);
  });

  it('returns a copy of every item for an empty query', () => {
    const all = filterByTags('', items);
    expect(all.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(all).not.toBe(items);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterByTags('pizza', items)).toEqual([]);
  });
});
