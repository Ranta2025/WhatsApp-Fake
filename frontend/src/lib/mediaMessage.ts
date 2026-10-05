import type { MediaType } from '../types/api';
import { findBuiltinSticker } from '../features/stickers/builtinPack';

/** Subconjunto de campos de un mensaje (1:1 o de grupo) que definen su media. */
export interface MediaMessageFields {
    Message?: string;
    MediaUrl?: string;
    MediaType?: MediaType;
}

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
    let mediaType: MediaType | undefined = m.MediaType;
    let mediaUrl = m.MediaUrl;
    const text = m.Message || '';

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
    const text = m.Message || '';
    // Si tiene MediaType y MediaUrl, el texto es redundante si coincide con la URL
    if (m.MediaType && m.MediaUrl) return true;
    // Si tiene MediaType y el mensaje es la URL
    if (m.MediaType && text.startsWith('http')) return true;
    // Detectar URLs de media en el texto del mensaje
    if (text.match(/^https?:\/\/.+\/(media|upload)\/.+\.(jpg|jpeg|png|gif|webp|mp4|webm|ogg|mp3|wav|pdf|doc|docx|xls|xlsx|ppt|pptx|txt)(\?.*)?$/i)) return true;
    // Detectar rutas de media del backend (/media/images/, /media/audio/, etc.)
    if (text.match(/^https?:\/\/.+\/media\/(images|audio|videos|docs)\//i)) return true;
    // Detectar si el texto es exactamente una URL y hay media renderizada
    if (m.MediaType && text.trim() === (m.MediaUrl || '').trim()) return true;
    return false;
}

/**
 * Texto de la cita de respuesta. El registro de reply solo guarda el string
 * crudo, así que un sticker del pack se muestra con su etiqueta y no con su URL.
 */
export function replyPreviewText(raw: string): string {
    return findBuiltinSticker(raw) ? '✨ Sticker' : raw;
}
