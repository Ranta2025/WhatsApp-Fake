import type { AxiosResponse } from 'axios';
import api from './axios';
import type { StatusItem, StatusFeed, StatusViewer, StatusCreateRequest } from '../types/api';

// ── Estados (stories) ────────────────────────────────────────────────────────

/**
 * Publica un nuevo estado.
 * Returns { status: StatusItem }
 */
export const createStatus = (
    body: StatusCreateRequest
): Promise<AxiosResponse<{ status: StatusItem }>> =>
    api.post<{ status: StatusItem }>('/api/v1/status', body);

/**
 * Obtiene el feed de estados: los propios y los de contactos mutuos.
 * Returns StatusFeed ({ Mine: StatusItem[], Contacts: StatusContactGroup[] })
 */
export const getStatusFeed = (): Promise<AxiosResponse<StatusFeed>> =>
    api.get<StatusFeed>('/api/v1/status');

/**
 * Marca un estado como visto por el usuario autenticado (idempotente).
 * @param statusId
 */
export const markStatusViewed = (
    statusId: number
): Promise<AxiosResponse<{ message: string }>> =>
    api.post<{ message: string }>(`/api/v1/status/${statusId}/view`);

/**
 * Lista quién vio un estado propio (solo el dueño puede consultarlo).
 * Returns { viewers: StatusViewer[] }
 * @param statusId
 */
export const getStatusViewers = (
    statusId: number
): Promise<AxiosResponse<{ viewers: StatusViewer[] }>> =>
    api.get<{ viewers: StatusViewer[] }>(`/api/v1/status/${statusId}/views`);

/**
 * Elimina un estado propio.
 * @param statusId
 */
export const deleteStatus = (
    statusId: number
): Promise<AxiosResponse<{ message: string }>> =>
    api.delete<{ message: string }>(`/api/v1/status/${statusId}`);
