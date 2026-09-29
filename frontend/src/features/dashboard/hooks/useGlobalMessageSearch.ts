import { useEffect, useState } from 'react';
import type { GlobalSearchChat, GlobalSearchResponse } from '../../../types/api';
import { searchAll, type GlobalSearchOptions } from '../api/searchApi';

/** Mínimo de caracteres (tras recortar) que acepta el backend. */
const MIN_TERM_LENGTH = 2;
/** Máximo de chats y de coincidencias por chat que se piden a la búsqueda global. */
const MAX_CHATS = 20;
const PER_CHAT = 3;

export type GlobalSearchStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface GlobalMessageSearch {
    status: GlobalSearchStatus;
    chats: GlobalSearchChat[];
}

interface Options {
    /** Texto del cuadro de búsqueda de la barra lateral (sin recortar). */
    term: string;
    /** Solo se busca mientras la pestaña que muestra los resultados está activa. */
    enabled: boolean;
    search?: (q: string, opts: GlobalSearchOptions) => Promise<GlobalSearchResponse>;
    debounceMs?: number;
}

interface Settled {
    term: string;
    status: 'ready' | 'error';
    chats: GlobalSearchChat[];
}

/**
 * Búsqueda global de mensajes (todos los chats y grupos) con debounce de 300 ms.
 * Cada término nuevo cancela la petición anterior (AbortController) y no se
 * muestran resultados de un término anterior mientras el nuevo está pendiente.
 */
export function useGlobalMessageSearch({
    term, enabled, search = searchAll, debounceMs = 300,
}: Options): GlobalMessageSearch {
    const trimmed = term.trim();
    const active = enabled && Array.from(trimmed).length >= MIN_TERM_LENGTH;
    const [settled, setSettled] = useState<Settled | null>(null);

    useEffect(() => {
        if (!active) return undefined;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            search(trimmed, { limit: MAX_CHATS, perChat: PER_CHAT, signal: controller.signal })
                .then(response => {
                    if (!controller.signal.aborted) setSettled({ term: trimmed, status: 'ready', chats: response.chats });
                })
                .catch((err: unknown) => {
                    if (controller.signal.aborted) return;
                    console.error('Error searching messages:', err);
                    setSettled({ term: trimmed, status: 'error', chats: [] });
                });
        }, debounceMs);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [active, trimmed, search, debounceMs]);

    if (!active) return { status: 'idle', chats: [] };
    if (settled?.term === trimmed) return { status: settled.status, chats: settled.chats };
    return { status: 'loading', chats: [] };
}
