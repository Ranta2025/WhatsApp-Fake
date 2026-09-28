// Utilidades de formato compartidas por la UI de chat.

const sameDay = (a, b) => a.toDateString() === b.toDateString();

/** Hora corta ("14:05") */
export const formatTime = (value) =>
    new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Fecha para la lista de chats: hora si es de hoy, "Ayer", día de la semana
 * si es de esta semana y fecha corta en otro caso.
 */
export const formatChatTimestamp = (value) => {
    if (!value) return '';
    const date = new Date(value);
    const now = new Date();
    if (sameDay(date, now)) return formatTime(date);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(date, yesterday)) return 'Ayer';
    const diffDays = (now - date) / 86400000;
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
};

/** Separador de fecha dentro de la conversación ("Hoy", "Ayer", "lunes, 3 de marzo") */
export const formatDaySeparator = (value) => {
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
export const formatLastSeen = (value) => {
    if (!value) return null;
    const date = new Date(value);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return 'últ. vez hace un momento';
    if (diff < 3600000) return `últ. vez hace ${Math.floor(diff / 60000)} min`;
    if (sameDay(date, now)) return `últ. vez hoy a las ${formatTime(date)}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(date, yesterday)) return `últ. vez ayer a las ${formatTime(date)}`;
    return `últ. vez el ${date.toLocaleDateString()}`;
};

const MEDIA_LABELS = {
    audio: '🎵 Audio',
    image: '📷 Foto',
    video: '🎥 Video',
    document: '📄 Documento',
    sticker: '✨ Sticker',
};

/** Texto de vista previa del último mensaje */
export const previewMessage = (msg) => {
    if (!msg) return '';
    if (msg.MediaType && MEDIA_LABELS[msg.MediaType]) return MEDIA_LABELS[msg.MediaType];
    return msg.Message || '';
};

/**
 * Hora relativa para estados/estados vistos: "Hoy a las 14:05", "Ayer a las 14:05"
 * o fecha corta con hora en otro caso.
 */
export const formatStatusTimestamp = (value) => {
    if (!value) return '';
    const date = new Date(value);
    const now = new Date();
    if (sameDay(date, now)) return `Hoy a las ${formatTime(date)}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(date, yesterday)) return `Ayer a las ${formatTime(date)}`;
    return `${date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} a las ${formatTime(date)}`;
};
