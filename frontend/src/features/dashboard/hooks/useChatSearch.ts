import { useCallback, useEffect, useRef, useState } from 'react';
import type { SearchPage, SearchResult } from '../../../types/api';
import type { SearchPageOptions } from '../api/searchApi';
import type { FocusTarget } from '../context/DashboardContext';

/** Mínimo de caracteres (tras recortar) que acepta el backend. */
const MIN_QUERY_LENGTH = 2;
/** Cuántos resultados por delante se mantienen cargados al navegar hacia atrás. */
const PREFETCH_AHEAD = 2;

export type ChatSearchStatus = 'idle' | 'short' | 'loading' | 'empty' | 'ready' | 'error';

export interface UseChatSearchOptions {
    /** Chat 1:1 o grupo abierto (null = ninguno). Cambiarlo cierra la búsqueda. */
    target: FocusTarget | null;
    search: (q: string, opts: SearchPageOptions) => Promise<SearchPage>;
    openMessageAt: (target: FocusTarget, messageId: number) => Promise<boolean>;
    debounceMs?: number;
    pageSize?: number;
}

export interface ChatSearchState {
    isOpen: boolean;
    open: () => void;
    close: () => void;
    query: string;
    setQuery: (q: string) => void;
    status: ChatSearchStatus;
    /** Coincidencias cargadas, la más reciente primero. */
    results: SearchResult[];
    /** Posición (0 = la más reciente) de la coincidencia actual. */
    index: number;
    /** Hay más coincidencias antiguas sin cargar todavía. */
    hasMore: boolean;
    loadingMore: boolean;
    /** Término (recortado) al que corresponden los resultados; '' si no hay búsqueda activa. */
    activeQuery: string;
    /** Va a la coincidencia anterior en el tiempo (flecha arriba). */
    goOlder: () => void;
    /** Va a la coincidencia más reciente (flecha abajo). */
    goNewer: () => void;
}

const targetId = (t: FocusTarget | null): string | null => {
    if (!t) return null;
    return t.kind === 'chat' ? `chat:${t.key}` : `group:${t.id}`;
};

/**
 * Búsqueda dentro de un chat (1:1 o grupo): término con debounce, peticiones
 * canceladas al escribir de nuevo, resultados de más reciente a más antiguo,
 * paginación perezosa y salto al mensaje con `openMessageAt`.
 */
export function useChatSearch({
    target, search, openMessageAt, debounceMs = 300, pageSize = 30,
}: UseChatSearchOptions): ChatSearchState {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQueryState] = useState('');
    const [status, setStatus] = useState<ChatSearchStatus>('idle');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [index, setIndex] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [activeQuery, setActiveQuery] = useState('');

    const latest = useRef({ target, search, openMessageAt, pageSize, debounceMs });
    useEffect(() => { latest.current = { target, search, openMessageAt, pageSize, debounceMs }; });

    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const controller = useRef<AbortController | null>(null);
    // Generación de la búsqueda: las respuestas de una generación anterior se ignoran.
    const generation = useRef(0);
    const loadingMoreRef = useRef(false);

    const cancelPending = useCallback(() => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        controller.current?.abort();
        controller.current = null;
        generation.current += 1;
        loadingMoreRef.current = false;
    }, []);

    const clearResults = useCallback((nextStatus: ChatSearchStatus) => {
        setResults([]);
        setIndex(0);
        setHasMore(false);
        setLoadingMore(false);
        setActiveQuery('');
        setStatus(nextStatus);
    }, []);

    const jump = useCallback((result: SearchResult | undefined) => {
        const { target: t, openMessageAt: open } = latest.current;
        if (t && result) void open(t, result.messageID);
    }, []);

    const runSearch = useCallback((term: string) => {
        const { target: t, search: doSearch, pageSize: limit } = latest.current;
        if (!t) return;
        const ctrl = new AbortController();
        controller.current = ctrl;
        const gen = generation.current;
        setResults([]);
        setIndex(0);
        setHasMore(false);
        setActiveQuery(term);
        setStatus('loading');
        doSearch(term, { limit, signal: ctrl.signal }).then(page => {
            if (ctrl.signal.aborted || gen !== generation.current) return;
            setResults(page.results);
            setHasMore(page.hasMore);
            setIndex(0);
            setStatus(page.results.length > 0 ? 'ready' : 'empty');
            jump(page.results[0]);
        }).catch((err: unknown) => {
            if (ctrl.signal.aborted || gen !== generation.current) return;
            console.error('Error searching messages:', err);
            setStatus('error');
        });
    }, [jump]);

    const setQuery = useCallback((q: string) => {
        setQueryState(q);
        cancelPending();
        const term = q.trim();
        if (term === '') { clearResults('idle'); return; }
        timer.current = setTimeout(() => {
            timer.current = null;
            if (Array.from(term).length < MIN_QUERY_LENGTH) { clearResults('short'); return; }
            runSearch(term);
        }, latest.current.debounceMs);
    }, [cancelPending, clearResults, runSearch]);

    const loadMore = useCallback(async (): Promise<SearchResult[]> => {
        const { search: doSearch, pageSize: limit } = latest.current;
        const last = results[results.length - 1];
        if (!hasMore || loadingMoreRef.current || !last || !activeQuery || !controller.current) return [];
        const gen = generation.current;
        const signal = controller.current.signal;
        loadingMoreRef.current = true;
        setLoadingMore(true);
        try {
            const page = await doSearch(activeQuery, { before: last.messageID, limit, signal });
            if (signal.aborted || gen !== generation.current) return [];
            setResults(prev => [...prev, ...page.results]);
            setHasMore(page.hasMore && page.results.length > 0);
            return page.results;
        } catch (err) {
            if (!signal.aborted && gen === generation.current) console.error('Error loading more search results:', err);
            return [];
        } finally {
            if (gen === generation.current) { loadingMoreRef.current = false; setLoadingMore(false); }
        }
    }, [results, hasMore, activeQuery]);

    const goOlder = useCallback(() => {
        if (status !== 'ready') return;
        if (index + 1 < results.length) {
            const next = index + 1;
            setIndex(next);
            jump(results[next]);
            if (hasMore && results.length - 1 - next <= PREFETCH_AHEAD) void loadMore();
            return;
        }
        if (hasMore) {
            // Nada por delante cargado: pedir la página y saltar al primer resultado nuevo.
            void loadMore().then(added => {
                if (added.length === 0) return;
                setIndex(index + 1);
                jump(added[0]);
            });
        }
    }, [status, index, results, hasMore, jump, loadMore]);

    const goNewer = useCallback(() => {
        if (status !== 'ready' || index === 0) return;
        const next = index - 1;
        setIndex(next);
        jump(results[next]);
    }, [status, index, results, jump]);

    const open = useCallback(() => setIsOpen(true), []);

    const close = useCallback(() => {
        cancelPending();
        setIsOpen(false);
        setQueryState('');
        clearResults('idle');
    }, [cancelPending, clearResults]);

    // Cambiar de chat/grupo cierra la búsqueda (estado ajustado durante el render).
    const currentTarget = targetId(target);
    const [seenTarget, setSeenTarget] = useState(currentTarget);
    if (seenTarget !== currentTarget) {
        setSeenTarget(currentTarget);
        setIsOpen(false);
        setQueryState('');
        setResults([]);
        setIndex(0);
        setHasMore(false);
        setLoadingMore(false);
        setActiveQuery('');
        setStatus('idle');
    }
    // ...y cancela lo que estuviera en curso (al cambiar de chat y al desmontar).
    useEffect(() => cancelPending, [currentTarget, cancelPending]);

    return {
        isOpen, open, close, query, setQuery, status, results, index, hasMore, loadingMore, activeQuery, goOlder, goNewer,
    };
}
