import type { UserGet } from '../types/api';

/** Perfil de sesión normalizado que expone AuthContext (derivado de UserGet). */
export interface AuthUser {
    username: string;
    telephon: string;
    avatar: string;
}

/**
 * El backend devuelve el perfil con claves username / telephon / avatarUrl.
 * `data` es `unknown` a propósito: el tipo estático de la respuesta describe
 * el contrato, pero no garantiza qué llega en runtime (cuerpo vacío/null,
 * p.ej. tras un 204 o una respuesta malformada) — se narrowea a mano en vez
 * de confiar en el genérico de axios, para no perder la tolerancia que tenía
 * la versión JS (`data?.username` etc.).
 */
export const toUser = (data: unknown): AuthUser => {
    const body: Partial<UserGet> = (data && typeof data === 'object') ? data as Partial<UserGet> : {};
    return {
        username: body.username || '',
        telephon: body.telephon || '',
        avatar: body.avatarUrl || '',
    };
};
