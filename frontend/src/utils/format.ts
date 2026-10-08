// Utilidades de formato compartidas por la UI de chat.

import type { MediaType } from '../types/api';

/** Cualquier valor a partir del cual se puede construir un Date válido (ISO string, epoch, Date). */
type DateInput = string | number | Date;

const sameDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString();

/** Hora corta ("14:05") */
export const formatTime = (value: DateInput): string =>
    new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Fecha para la lista de chats: hora si es de hoy, "Ayer", día de la semana
 * si es de esta semana y fecha corta en otro caso.
 */
export const formatChatTimestamp = (value: DateInput | null | undefined): string => {
    if (!value) return '';
    const date = new Date(value);
    const now = new Date();
    if (sameDay(date, now)) return formatTime(date);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(date, yesterday)) return 'Ayer';
    const diffDays = (now.getTime() - date.getTime()) / 86400000;
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
};

/** Separador de fecha dentro de la conversación ("Hoy", "Ayer", "lunes, 3 de marzo") */
export const formatDaySeparator = (value: DateInput): string => {
    const date = new Date(value);
    const now = new Date();
    if (sameDay(date, now)) return 'Hoy';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(date, yesterday)) return 'Ayer';
    return date.toLocaleDateString([], {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
    });
};

/** "última vez" legible */
export const formatLastSeen = (value: DateInput | null | undefined): string | null => {
    if (!value) return null;
    const date = new Date(value);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return 'últ. vez hace un momento';
    if (diff < 3600000) return `últ. vez hace ${Math.floor(diff / 60000)} min`;
    if (sameDay(date, now)) return `últ. vez hoy a las ${formatTime(date)}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(date, yesterday)) return `últ. vez ayer a las ${formatTime(date)}`;
    return `últ. vez el ${date.toLocaleDateString()}`;
};

const MEDIA_LABELS: Record<MediaType, string> = {
    audio: '🎵 Audio',
    image: '📷 Foto',
    video: '🎥 Video',
    document: '📄 Documento',
    sticker: '✨ Sticker',
};

/** Campos de vista previa de un mensaje (1:1 camel o grupo Pascal). */
export interface PreviewableMessage {
    Message?: string;
    message?: string;
    MediaType?: MediaType;
    mediaType?: MediaType;
}

/** Texto de vista previa del último mensaje */
export const previewMessage = (msg: PreviewableMessage | null | undefined): string => {
    if (!msg) return '';
    const mediaType = msg.mediaType !== undefined ? msg.mediaType : msg.MediaType;
    const text = msg.message !== undefined ? msg.message : msg.Message;
    const label = mediaType && MEDIA_LABELS[mediaType];
    if (label) return label;
    return text || '';
};

/**
 * Hora relativa para estados/estados vistos: "Hoy a las 14:05", "Ayer a las 14:05"
 * o fecha corta con hora en otro caso.
 */
export const formatStatusTimestamp = (value: DateInput | null | undefined): string => {
    if (!value) return '';
    const date = new Date(value);
    const now = new Date();
    if (sameDay(date, now)) return `Hoy a las ${formatTime(date)}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(date, yesterday)) return `Ayer a las ${formatTime(date)}`;
    return `${date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} a las ${formatTime(date)}`;
};
