import type { StatusType } from '../../../types/api';

/**
 * Only `image`/`video` are valid status media types (`StatusCreateRequest`).
 * `MediaUploadResult.mediaType` is wider (`MediaType | 'document'`), so the
 * server value is used when it is a valid status type and otherwise the file's
 * own MIME-derived kind is the explicit guard (same `data.mediaType ||
 * fileKind` semantics as the pre-TypeScript composer, without forwarding an
 * invalid type).
 */
export function resolveStatusMediaType(mediaType: unknown, fileKind: 'image' | 'video'): StatusType {
    if (mediaType === 'image' || mediaType === 'video') return mediaType;
    return fileKind;
}
