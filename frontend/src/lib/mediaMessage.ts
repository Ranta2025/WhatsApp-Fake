import type { MediaType } from '../types/api';
import { findBuiltinSticker } from '../features/stickers/builtinPack';

/** Subconjunto de campos de un mensaje (1:1 camel o grupo Pascal) que definen su media. */
export interface MediaMessageFields {
    Message?: string;
    message?: string;
    MediaUrl?: string;
    mediaUrl?: string;
    MediaType?: MediaType;
    mediaType?: MediaType;
}

const mediaTypeOf = (m: MediaMessageFields): MediaType | undefined =>
    m.mediaType !== undefined ? m.mediaType : m.MediaType;
const mediaUrlOf = (m: MediaMessageFields): string | undefined =>
    m.mediaUrl !== undefined ? m.mediaUrl : m.MediaUrl;
const messageTextOf = (m: MediaMessageFields): string =>
    (m.message !== undefined ? m.message : m.Message) || '';

export interface ResolvedMedia {
    mediaType: MediaType;
    mediaUrl: string;
}

/**
 * Resuelve el media de un mensaje: usa MediaType/MediaUrl y, para mensajes
 * legados sin MediaType cuyo texto es una ruta `/media/<tipo>/...`, lo infiere.
 * Devuelve null si no hay nada que renderizar.
 */
export function resolveMedia(m: MediaMessageFields): ResolvedMedia | null {
    let mediaType: MediaType | undefined = mediaTypeOf(m);
    let mediaUrl = mediaUrlOf(m);
    const text = messageTextOf(m);

    if (!mediaType && text.includes('/media/')) {
        mediaUrl = text;
        if (text.includes('/audio/')) mediaType = 'audio';
        else if (text.includes('/images/')) mediaType = 'image';
        else if (text.includes('/videos/')) mediaType = 'video';
        else if (text.includes('/docs/')) mediaType = 'document';
    }

    if (!mediaType || !mediaUrl) return null;
    return { mediaType, mediaUrl };
}

/**
 * Detecta si el contenido de m.Message es una URL de media (archivo adjunto).
 * Retorna true si el mensaje no debe mostrarse como texto plano.
 */
export function isMediaUrl(m: MediaMessageFields): boolean {
    const text = messageTextOf(m);
    const mediaType = mediaTypeOf(m);
    const mediaUrl = mediaUrlOf(m);
    // Si tiene MediaType y MediaUrl, el texto es redundante si coincide con la URL
    if (mediaType && mediaUrl) return true;
    // Si tiene MediaType y el mensaje es la URL
    if (mediaType && text.startsWith('http')) return true;
    // Detectar URLs de media en el texto del mensaje
    if (text.match(/^https?:\/\/.+\/(media|upload)\/.+\.(jpg|jpeg|png|gif|webp|mp4|webm|ogg|mp3|wav|pdf|doc|docx|xls|xlsx|ppt|pptx|txt)(\?.*)?$/i)) return true;
    // Detectar rutas de media del backend (/media/images/, /media/audio/, etc.)
    if (text.match(/^https?:\/\/.+\/media\/(images|audio|videos|docs)\//i)) return true;
    // Detectar si el texto es exactamente una URL y hay media renderizada
    if (mediaType && text.trim() === (mediaUrl || '').trim()) return true;
    return false;
}

/**
 * Texto de la cita de respuesta. El registro de reply solo guarda el string
 * crudo, así que un sticker del pack se muestra con su etiqueta y no con su URL.
 */
export function replyPreviewText(raw: string): string {
    return findBuiltinSticker(raw) ? '✨ Sticker' : raw;
}
