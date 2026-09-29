import { describe, it, expect } from 'vitest';
import { resolveStatusMediaType } from './statusType';

// Pre-TypeScript StatusComposer used `data.mediaType || fileKind`. Typing
// narrowed it to `data.mediaType === 'image' || 'video' ? data.mediaType :
// fileKind`, which silently changed the non-image/video case. The helper keeps
// the original semantics for online image/video and guards every other value
// explicitly by falling back to the file's own MIME-derived kind.
describe('resolveStatusMediaType', () => {
    it('keeps a valid server mediaType (image/video)', () => {
        expect(resolveStatusMediaType('image', 'video')).toBe('image');
        expect(resolveStatusMediaType('video', 'image')).toBe('video');
    });

    it('falls back to the file kind when the server sends no mediaType', () => {
        expect(resolveStatusMediaType(undefined, 'image')).toBe('image');
        expect(resolveStatusMediaType(null, 'video')).toBe('video');
    });

    it('guards non-image/video media types instead of forwarding them', () => {
        expect(resolveStatusMediaType('document', 'image')).toBe('image');
        expect(resolveStatusMediaType('audio', 'video')).toBe('video');
        expect(resolveStatusMediaType('text', 'image')).toBe('image');
    });

    it('falls back for non-string values', () => {
        expect(resolveStatusMediaType(42, 'video')).toBe('video');
        expect(resolveStatusMediaType({ mediaType: 'image' }, 'image')).toBe('image');
    });
});
