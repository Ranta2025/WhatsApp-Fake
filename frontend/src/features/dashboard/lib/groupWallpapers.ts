/** Per-group chat wallpapers: group ID (as a string key) -> image URL. */
export type GroupWallpapers = Record<string, string>;

/**
 * Normalizes untrusted wallpaper data (a raw `localStorage` string, or the
 * `detail` of a `group-wallpaper-changed` CustomEvent) into a plain map.
 * Anything that is not a JSON object degrades to `{}`; non-string entries are
 * dropped.
 */
export function parseGroupWallpapers(input: unknown): GroupWallpapers {
    let value: unknown = input;
    if (typeof input === 'string') {
        try { value = JSON.parse(input); } catch { return {}; }
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    const out: GroupWallpapers = {};
    for (const [key, url] of Object.entries(value)) {
        if (typeof url === 'string') out[key] = url;
    }
    return out;
}
