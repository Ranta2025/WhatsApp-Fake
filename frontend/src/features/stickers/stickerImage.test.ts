// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
    ANIMATED_MAX_BYTES,
    STATIC_MAX_BYTES,
    computeContainRect,
    computeCropRect,
    detectStickerFormat,
    encodeUnderSizeCap,
    isAnimatedWebp,
    normalizeTags,
    validateAnimatedSticker,
} from './stickerImage';

const makeBlob = (size: number, type = 'image/webp'): Blob =>
    new Blob([new Uint8Array(size)], { type });

/** Little-endian four-char code as byte values, e.g. 'RIFF'. */
const fourCC = (code: string): number[] => [...code].map((char) => char.charCodeAt(0));

/** Builds a minimal RIFF/WEBP container with a single chunk. */
function webpWithChunk(chunk: string, data: number[]): Uint8Array {
    const bytes = [
        ...fourCC('RIFF'), 0, 0, 0, 0,
        ...fourCC('WEBP'),
        ...fourCC(chunk), data.length, 0, 0, 0,
        ...data,
    ];
    return new Uint8Array(bytes);
}

describe('computeCropRect', () => {
    it('covers a square image with the whole source at zoom 1', () => {
        const rect = computeCropRect({
            imageWidth: 1000, imageHeight: 1000, viewport: 300, zoom: 1, offsetX: 0, offsetY: 0,
        });
        expect(rect).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
    });

    it('centres a landscape image and crops a square from the middle', () => {
        const rect = computeCropRect({
            imageWidth: 1000, imageHeight: 500, viewport: 300, zoom: 1, offsetX: 0, offsetY: 0,
        });
        expect(rect).toEqual({ x: 250, y: 0, width: 500, height: 500 });
    });

    it('centres a portrait image and crops a square from the middle', () => {
        const rect = computeCropRect({
            imageWidth: 500, imageHeight: 1000, viewport: 300, zoom: 1, offsetX: 0, offsetY: 0,
        });
        expect(rect).toEqual({ x: 0, y: 250, width: 500, height: 500 });
    });

    it('zooming in shrinks the source rect and keeps it square', () => {
        const rect = computeCropRect({
            imageWidth: 1000, imageHeight: 1000, viewport: 300, zoom: 2, offsetX: 0, offsetY: 0,
        });
        expect(rect.x).toBeCloseTo(250);
        expect(rect.y).toBeCloseTo(250);
        expect(rect.width).toBeCloseTo(500);
        expect(rect.height).toBeCloseTo(500);
    });

    it('clamps the drag so the crop never leaves the image', () => {
        const base = {
            imageWidth: 1000, imageHeight: 500, viewport: 300, zoom: 1,
        };
        const right = computeCropRect({ ...base, offsetX: 100000, offsetY: 0 });
        expect(right.x).toBeCloseTo(0);
        expect(right.x + right.width).toBeLessThanOrEqual(1000);

        const left = computeCropRect({ ...base, offsetX: -100000, offsetY: 0 });
        expect(left.x).toBeCloseTo(500);
        expect(left.x).toBeGreaterThanOrEqual(0);
    });
});

describe('computeContainRect', () => {
    it('fills the target for a square source', () => {
        expect(computeContainRect(512, 512)).toEqual({ x: 0, y: 0, width: 512, height: 512 });
    });

    it('letterboxes a tall source on a transparent background', () => {
        expect(computeContainRect(256, 512)).toEqual({ x: 128, y: 0, width: 256, height: 512 });
    });

    it('pillarboxes a wide source on a transparent background', () => {
        expect(computeContainRect(1024, 256)).toEqual({ x: 0, y: 192, width: 512, height: 128 });
    });

    it('honours a custom target size', () => {
        expect(computeContainRect(100, 100, 64)).toEqual({ x: 0, y: 0, width: 64, height: 64 });
    });
});

describe('encodeUnderSizeCap', () => {
    it('returns the first encoding at or under the cap', async () => {
        const encode = vi.fn(async (quality: number) =>
            makeBlob(quality >= 0.8 ? 400 * 1024 : 200 * 1024));
        const result = await encodeUnderSizeCap(encode);

        expect(result?.quality).toBeCloseTo(0.7);
        expect(result!.blob.size).toBeLessThanOrEqual(STATIC_MAX_BYTES);
        expect(encode.mock.calls.map((call) => call[0])).toEqual([0.9, 0.8, 0.7]);
    });

    it('returns null when every quality still exceeds the cap', async () => {
        const encode = vi.fn(async (_quality: number) => makeBlob(500 * 1024));
        const result = await encodeUnderSizeCap(encode);

        expect(result).toBeNull();
        expect(encode.mock.calls.map((call) => call[0])).toEqual([0.9, 0.8, 0.7, 0.6, 0.5]);
    });

    it('honours custom quality bounds and step', async () => {
        const encode = vi.fn(async (_quality: number) => makeBlob(1000));
        const result = await encodeUnderSizeCap(encode, {
            maxBytes: 500, maxQuality: 0.6, minQuality: 0.5, qualityStep: 0.1,
        });

        expect(result).toBeNull();
        expect(encode.mock.calls.map((call) => call[0])).toEqual([0.6, 0.5]);
    });

    it('propagates an encoder rejection', async () => {
        const encode = vi.fn(async () => { throw new Error('encoder boom'); });
        await expect(encodeUnderSizeCap(encode)).rejects.toThrow('encoder boom');
    });
});

describe('detectStickerFormat', () => {
    it('recognises a WebP blob', () => {
        expect(detectStickerFormat(makeBlob(10, 'image/webp'))).toBe('webp');
    });

    it('accepts the Safari PNG fallback', () => {
        expect(detectStickerFormat(makeBlob(10, 'image/png'))).toBe('png');
    });

    it('rejects any other type', () => {
        expect(detectStickerFormat(makeBlob(10, 'image/jpeg'))).toBeNull();
        expect(detectStickerFormat(makeBlob(10, ''))).toBeNull();
    });
});

describe('isAnimatedWebp', () => {
    it('detects the VP8X ANIM flag', () => {
        const animated = webpWithChunk('VP8X', [0x02, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
        expect(isAnimatedWebp(animated)).toBe(true);
    });

    it('returns false for a static VP8X container', () => {
        const staticWebp = webpWithChunk('VP8X', [0x00, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
        expect(isAnimatedWebp(staticWebp)).toBe(false);
    });

    it('returns false for a plain VP8 chunk', () => {
        expect(isAnimatedWebp(webpWithChunk('VP8 ', [1, 2, 3]))).toBe(false);
    });

    it('treats a leading ANMF frame as animated', () => {
        expect(isAnimatedWebp(webpWithChunk('ANMF', [1, 2, 3]))).toBe(true);
    });

    it('returns false for non-WebP, truncated and malformed bytes', () => {
        expect(isAnimatedWebp(new Uint8Array(fourCC('JUNK')))).toBe(false);
        expect(isAnimatedWebp(new Uint8Array())).toBe(false);
        const riffNotWebp = new Uint8Array([...fourCC('RIFF'), 0, 0, 0, 0, ...fourCC('AVI ')]);
        expect(isAnimatedWebp(riffNotWebp)).toBe(false);
    });
});

describe('validateAnimatedSticker', () => {
    const valid = { width: 512, height: 512, size: 500 * 1024, type: 'image/webp' };

    it('accepts a 512x512 WebP under 1 MB', () => {
        expect(validateAnimatedSticker(valid)).toEqual({ ok: true });
    });

    it('accepts the PNG fallback at 512x512', () => {
        expect(validateAnimatedSticker({ ...valid, type: 'image/png' })).toEqual({ ok: true });
    });

    it('rejects a GIF with guidance', () => {
        expect(validateAnimatedSticker({ ...valid, type: 'image/gif' }))
            .toEqual({ ok: false, reason: 'gif-not-supported' });
    });

    it('rejects a non-image file', () => {
        expect(validateAnimatedSticker({ ...valid, type: 'text/plain' }))
            .toEqual({ ok: false, reason: 'not-image' });
    });

    it('rejects anything that is not exactly 512x512', () => {
        expect(validateAnimatedSticker({ ...valid, width: 500 }))
            .toEqual({ ok: false, reason: 'wrong-dimensions' });
    });

    it('rejects a file over the animated size cap', () => {
        expect(validateAnimatedSticker({ ...valid, size: ANIMATED_MAX_BYTES + 1 }))
            .toEqual({ ok: false, reason: 'too-large' });
    });
});

describe('normalizeTags', () => {
    it('lowercases, trims and deduplicates comma-separated tags', () => {
        expect(normalizeTags('Hola, AMOR , hola')).toEqual(['hola', 'amor']);
    });

    it('caps the list at five tags', () => {
        expect(normalizeTags('a,b,c,d,e,f,g')).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('truncates each tag to twenty characters', () => {
        expect(normalizeTags('x'.repeat(30))).toEqual(['x'.repeat(20)]);
    });

    it('drops empty input', () => {
        expect(normalizeTags('   ')).toEqual([]);
        expect(normalizeTags(',, ,')).toEqual([]);
    });
});
