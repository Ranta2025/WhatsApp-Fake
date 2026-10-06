/**
 * Client-side sticker search (SF6).
 *
 * The panel holds only a few dozen stickers (built-in packs plus the user's own
 * library), so tag filtering happens in memory. Matching is case- and
 * accent-insensitive so "Corazón" finds the "corazon" tag and vice versa.
 * Accents are removed by decomposing to NFD and dropping the combining marks
 * (U+0300..U+036F), which covers the Latin accents the packs use without
 * relying on Unicode property escapes.
 */

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Lowercases, trims and strips Latin diacritics for comparison. */
export function normalizeForSearch(value: string): string {
  return value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim();
}

/** Any object that carries the tags a sticker is searchable by. */
export interface Tagged {
  readonly tags: readonly string[];
}

/**
 * True when the query is a substring of any tag. An empty query matches
 * everything (the caller then shows the whole list).
 */
export function matchesTags(query: string, tags: readonly string[]): boolean {
  const needle = normalizeForSearch(query);
  if (!needle) return true;
  return tags.some((tag) => normalizeForSearch(tag).includes(needle));
}

/** Filters items by tag, preserving their order. Always returns a new array. */
export function filterByTags<T extends Tagged>(query: string, items: readonly T[]): T[] {
  if (!normalizeForSearch(query)) return [...items];
  return items.filter((item) => matchesTags(query, item.tags));
}
