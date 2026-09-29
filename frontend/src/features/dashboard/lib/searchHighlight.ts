/**
 * Client-side counterpart of the backend snippet builder (backend/utils/search.go):
 * accent- and case-insensitive matching over Unicode codepoints ("runes"), so the
 * offsets line up with the server's `highlights` and never split a surrogate pair.
 */

const isMark = (cp: string): boolean => /\p{M}/u.test(cp);

/** Lowercase + accent-stripped form of one codepoint (always exactly one codepoint). */
function foldChar(cp: string): string {
    const lower = cp.toLowerCase();
    // toLowerCase can expand a character (e.g. 'İ'); keep the original then to stay 1:1.
    const base = Array.from(lower).length === 1 ? lower : cp;
    if (base.charCodeAt(0) < 0x80) return base;
    for (const part of Array.from(base.normalize('NFD'))) {
        if (!isMark(part)) return part;
    }
    return base;
}

/** Folded codepoints of `text`, aligned index by index with `Array.from(text)`. */
export function foldChars(text: string): string[] {
    return Array.from(text).map(foldChar);
}

/** Non-overlapping [start, end) rune ranges where `query` occurs in `text`. */
export function findMatchRanges(text: string, query: string): [number, number][] {
    const q = foldChars(query.trim());
    if (q.length === 0) return [];
    const t = foldChars(text);
    const ranges: [number, number][] = [];
    for (let i = 0; i + q.length <= t.length;) {
        let hit = true;
        for (let j = 0; j < q.length; j += 1) {
            if (t[i + j] !== q[j]) { hit = false; break; }
        }
        if (hit) {
            ranges.push([i, i + q.length]);
            i += q.length;
        } else {
            i += 1;
        }
    }
    return ranges;
}

export interface TextSegment {
    text: string;
    match: boolean;
}

/** Cuts `text` into plain / matched segments following sorted, non-overlapping rune ranges. */
export function splitByRanges(text: string, ranges: readonly (readonly [number, number])[]): TextSegment[] {
    const chars = Array.from(text);
    const segments: TextSegment[] = [];
    let pos = 0;
    for (const [start, end] of ranges) {
        if (start > pos) segments.push({ text: chars.slice(pos, start).join(''), match: false });
        segments.push({ text: chars.slice(start, end).join(''), match: true });
        pos = end;
    }
    if (pos < chars.length) segments.push({ text: chars.slice(pos).join(''), match: false });
    return segments;
}
