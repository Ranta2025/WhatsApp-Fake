import api from './axios';

// ── Estados (stories) ────────────────────────────────────────────────────────

/**
 * Publica un nuevo estado.
 * @param {{type: 'text'|'image'|'video', text?: string, backgroundColor?: string, mediaUrl?: string, caption?: string}} body
 * Returns { status: StatusItem }
 */
export const createStatus = (body) =>
    api.post('/api/v1/status', body);

/**
 * Obtiene el feed de estados: los propios y los de contactos mutuos.
 * Returns { Mine: StatusItem[], Contacts: StatusContactGroup[] }
 */
export const getStatusFeed = () =>
    api.get('/api/v1/status');

/**
 * Marca un estado como visto por el usuario autenticado (idempotente).
 * @param {number} statusId
 */
export const markStatusViewed = (statusId) =>
    api.post(`/api/v1/status/${statusId}/view`);

/**
 * Lista quién vio un estado propio (solo el dueño puede consultarlo).
 * Returns { viewers: StatusViewer[] }
 * @param {number} statusId
 */
export const getStatusViewers = (statusId) =>
    api.get(`/api/v1/status/${statusId}/views`);

/**
 * Elimina un estado propio.
 * @param {number} statusId
 */
export const deleteStatus = (statusId) =>
    api.delete(`/api/v1/status/${statusId}`);
