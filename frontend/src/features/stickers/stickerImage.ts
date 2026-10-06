/**
 * Pure image helpers for the sticker creator (SF5).
 *
 * Everything here is DOM-free: the caller injects the canvas/image side
 * effects, so the math and the rules are unit-testable in jsdom. The single
 * source of truth for the limits shared with the backend:
 * 512x512, static <= 300 KB, animated <= 1 MB, 5 tags x 20 chars.
 */

export const STICKER_SIZE = 512;
export const STATIC_MAX_BYTES = 300 * 1024;
export const ANIMATED_MAX_BYTES = 1024 * 1024;
export const MAX_TAGS = 5;
export const MAX_TAG_LENGTH = 20;

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface CropRectInput {
    /** Natural width of the picked image, in source pixels. */
    imageWidth: number;
    /** Natural height of the picked image, in source pixels. */
    imageHeight: number;
    /** Edge of the square viewport the user drags and zooms inside. */
    viewport: number;
    /** Zoom multiplier on top of the cover scale (>= 1). */
    zoom: number;
    /** Horizontal drag of the image inside the viewport, in viewport px. */
    offsetX: number;
    /** Vertical drag of the image inside the viewport, in viewport px. */
    offsetY: number;
}

const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), max);

/** Keeps `-0` from leaking out and failing strict deep equality. */
const normalizeZero = (value: number): number => (value === 0 ? 0 : value);

/**
 * Maps the visible square viewport back to the source pixels of the image.
 *
 * The image is scaled with `cover` (so it always fills the viewport) and then
 * by `zoom`; the drag is clamped so the crop rectangle never leaves the image.
 * The result is always a square in source coordinates.
 */
export function computeCropRect(input: CropRectInput): Rect {
    const { imageWidth, imageHeight, viewport, zoom, offsetX, offsetY } = input;
    const cover = Math.max(viewport / imageWidth, viewport / imageHeight);
    const scale = cover * Math.max(zoom, 1);
    const displayedWidth = imageWidth * scale;
    const displayedHeight = imageHeight * scale;
    const maxOffsetX = Math.max(0, (displayedWidth - viewport) / 2);
    const maxOffsetY = Math.max(0, (displayedHeight - viewport) / 2);
    const left = viewport / 2 + clamp(offsetX, -maxOffsetX, maxOffsetX) - displayedWidth / 2;
    const top = viewport / 2 + clamp(offsetY, -maxOffsetY, maxOffsetY) - displayedHeight / 2;
    const side = viewport / scale;
    return {
        x: normalizeZero(-left / scale),
        y: normalizeZero(-top / scale),
        width: side,
        height: side,
    };
}

/**
 * Fits a source rectangle into a square target using `contain`, centring it
 * and leaving transparent padding around the shorter axis.
 */
export function computeContainRect(
    sourceWidth: number,
    sourceHeight: number,
    target: number = STICKER_SIZE,
): Rect {
    const scale = Math.min(target / sourceWidth, target / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    return { x: (target - width) / 2, y: (target - height) / 2, width, height };
}

export interface EncodeResult {
    blob: Blob;
    /** The quality that produced the accepted blob. */
    quality: number;
}

export interface EncodeOptions {
    maxBytes?: number;
    maxQuality?: number;
    minQuality?: number;
    qualityStep?: number;
}

const QUALITY_EPSILON = 1e-9;

/** Descending quality ladder, e.g. 0.9, 0.8, ... 0.5 (inclusive). */
function qualityLadder(maxQuality: number, minQuality: number, step: number): number[] {
    const qualities: number[] = [];
    for (let quality = maxQuality; quality >= minQuality - QUALITY_EPSILON; quality -= step) {
        qualities.push(Math.round(quality * 100) / 100);
    }
    return qualities;
}

/**
 * Encodes with a descending quality ladder (0.9 -> 0.5 by default) and returns
 * the first blob at or under the cap. Returns `null` when even the lowest
 * quality is still too big, so the caller can show a clear message.
 */
export async function encodeUnderSizeCap(
    encode: (quality: number) => Promise<Blob>,
    options: EncodeOptions = {},
): Promise<EncodeResult | null> {
    const {
        maxBytes = STATIC_MAX_BYTES,
        maxQuality = 0.9,
        minQuality = 0.5,
        qualityStep = 0.1,
    } = options;

    for (const quality of qualityLadder(maxQuality, minQuality, qualityStep)) {
        const blob = await encode(quality);
        if (blob.size <= maxBytes) return { blob, quality };
    }
    return null;
}

export type StickerFormat = 'webp' | 'png';

/**
 * Reads the actual type the browser produced. Safari may silently return a PNG
 * from `toBlob('image/webp')`, so the creator accepts the PNG fallback.
 */
export function detectStickerFormat(blob: Blob): StickerFormat | null {
    if (blob.type === 'image/webp') return 'webp';
    if (blob.type === 'image/png') return 'png';
    return null;
}

const readFourCC = (bytes: Uint8Array, offset: number): string =>
    String.fromCharCode(
        bytes[offset] ?? 0,
        bytes[offset + 1] ?? 0,
        bytes[offset + 2] ?? 0,
        bytes[offset + 3] ?? 0,
    );

const readUint32LE = (bytes: Uint8Array, offset: number): number =>
    ((bytes[offset] ?? 0) |
        ((bytes[offset + 1] ?? 0) << 8) |
        ((bytes[offset + 2] ?? 0) << 16) |
        ((bytes[offset + 3] ?? 0) << 24)) >>> 0;

/**
 * Walks the RIFF/WEBP chunks and reports whether the VP8X `ANIM` flag is set
 * (or an ANMF frame appears first). Mirrors the backend's animated sniff so the
 * client and server agree on what counts as animated.
 */
export function isAnimatedWebp(bytes: Uint8Array): boolean {
    if (bytes.length < 12) return false;
    if (readFourCC(bytes, 0) !== 'RIFF' || readFourCC(bytes, 8) !== 'WEBP') return false;

    let offset = 12;
    while (offset + 8 <= bytes.length) {
        const chunk = readFourCC(bytes, offset);
        const size = readUint32LE(bytes, offset + 4);
        if (chunk === 'VP8X') {
            if (offset + 8 >= bytes.length) return false;
            return ((bytes[offset + 8] ?? 0) & 0x02) !== 0;
        }
        if (chunk === 'ANMF') return true;
        offset += 8 + size + (size % 2);
    }
    return false;
}

export type AnimatedRejectReason =
    | 'gif-not-supported'
    | 'not-image'
    | 'wrong-dimensions'
    | 'too-large';

export interface AnimatedPickInfo {
    width: number;
    height: number;
    size: number;
    type: string;
}

export type AnimatedValidation =
    | { ok: true }
    | { ok: false; reason: AnimatedRejectReason };

/**
 * Validates an animated pick that is uploaded as-is (no canvas re-encode):
 * it must already be exactly 512x512 and under 1 MB. GIFs are rejected with
 * guidance because the client does not convert them.
 */
export function validateAnimatedSticker(
    info: AnimatedPickInfo,
    options: { maxBytes?: number } = {},
): AnimatedValidation {
    const { maxBytes = ANIMATED_MAX_BYTES } = options;
    if (info.type === 'image/gif') return { ok: false, reason: 'gif-not-supported' };
    if (!info.type.startsWith('image/')) return { ok: false, reason: 'not-image' };
    if (info.width !== STICKER_SIZE || info.height !== STICKER_SIZE) {
        return { ok: false, reason: 'wrong-dimensions' };
    }
    if (info.size > maxBytes) return { ok: false, reason: 'too-large' };
    return { ok: true };
}

/**
 * Normalises the free-text tags field into the CSV the backend expects:
 * comma-separated, lowercased, trimmed, deduplicated, 5 max, 20 chars each.
 */
export function normalizeTags(raw: string): string[] {
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const part of raw.split(',')) {
        const tag = part.trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
        if (!tag || seen.has(tag)) continue;
        seen.add(tag);
        tags.push(tag);
        if (tags.length >= MAX_TAGS) break;
    }
    return tags;
}
