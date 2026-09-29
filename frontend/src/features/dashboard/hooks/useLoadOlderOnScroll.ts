import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** Distancia (px) al tope a partir de la cual se pide la página anterior. */
const DEFAULT_TOP_THRESHOLD = 80;

interface Options {
    containerRef: RefObject<HTMLElement | null>;
    /** Identidad del chat/grupo abierto: al cambiar se baja al fondo. */
    chatKey: string | number | null | undefined;
    /** Id (o clave) de la primera y la última entrada de la lista actual. */
    firstKey: string | number | undefined;
    lastKey: string | number | undefined;
    hasMore: boolean;
    loadingOlder: boolean;
    loadOlder: () => void | Promise<void>;
    /** Scroll suave al llegar un mensaje nuevo (por defecto instantáneo). */
    smoothTail?: boolean;
    topThreshold?: number;
}

/**
 * Scroll infinito hacia arriba para listas de mensajes.
 *
 * - Pide la página anterior cuando el scroll llega al tope (y hay más, y no hay
 *   otra carga en curso).
 * - Al anteponer mensajes antiguos conserva la posición visual: reajusta
 *   `scrollTop` con el aumento de `scrollHeight` (el contenedor debe tener
 *   `overflow-anchor: none` para que el navegador no compense también).
 * - Baja al fondo solo al abrir/cambiar de chat o cuando cambia el último
 *   mensaje (mensaje nuevo al final); nunca por anteponer o por editar.
 */
export function useLoadOlderOnScroll({
    containerRef, chatKey, firstKey, lastKey, hasMore, loadingOlder, loadOlder,
    smoothTail = false, topThreshold = DEFAULT_TOP_THRESHOLD,
}: Options): void {
    const latest = useRef({ hasMore, loadingOlder, loadOlder });
    useEffect(() => { latest.current = { hasMore, loadingOlder, loadOlder }; }, [hasMore, loadingOlder, loadOlder]);

    // Última posición/altura conocidas del contenedor (para reajustar tras anteponer).
    const metrics = useRef({ top: 0, height: 0 });
    const previous = useRef<{ chatKey: typeof chatKey; firstKey: typeof firstKey; lastKey: typeof lastKey } | null>(null);

    const hasItems = firstKey !== undefined;

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onScroll = () => {
            metrics.current = { top: el.scrollTop, height: el.scrollHeight };
            const { hasMore: more, loadingOlder: loading, loadOlder: load } = latest.current;
            if (el.scrollTop <= topThreshold && more && !loading) void load();
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [containerRef, chatKey, hasItems, topThreshold]);

    useLayoutEffect(() => {
        const el = containerRef.current;
        const prev = previous.current;
        previous.current = { chatKey, firstKey, lastKey };
        if (!el) return;

        const chatChanged = !prev || prev.chatKey !== chatKey;
        const tailChanged = !prev || prev.lastKey !== lastKey;
        const record = () => { metrics.current = { top: el.scrollTop, height: el.scrollHeight }; };

        if (chatChanged || tailChanged) {
            const toBottom = () => {
                if (smoothTail && !chatChanged && typeof el.scrollTo === 'function') {
                    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
                } else {
                    el.scrollTop = el.scrollHeight;
                }
                record();
            };
            requestAnimationFrame(toBottom);
            return;
        }
        if (prev.firstKey !== firstKey) {
            // Se antepusieron mensajes: mantener el mismo mensaje bajo el ojo.
            el.scrollTop = metrics.current.top + (el.scrollHeight - metrics.current.height);
        }
        record();
    }, [containerRef, chatKey, firstKey, lastKey, smoothTail]);
}
