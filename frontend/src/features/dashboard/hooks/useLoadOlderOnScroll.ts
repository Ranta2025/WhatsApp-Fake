import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** Distancia (px) al tope a partir de la cual se pide la página anterior. */
const DEFAULT_TOP_THRESHOLD = 80;
/** Distancia (px) al fondo a partir de la cual, en modo desprendido, se piden los más recientes. */
const DEFAULT_BOTTOM_THRESHOLD = 80;
/** Duración (ms) del resaltado temporal del mensaje al que se salta. */
export const FLASH_MS = 1800;
/** Atributo que marca el mensaje resaltado (el estilo vive en index.css). */
const FLASH_ATTR = 'data-search-flash';

export interface ScrollTarget {
    /** MessageID al que saltar (el elemento lleva `data-message-id`). */
    id: number;
    /** Sube en cada salto: permite volver a saltar al mismo mensaje. */
    seq: number;
}

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
    /**
     * Ventana desprendida (tramo del historial abierto desde una búsqueda): no se baja al
     * fondo al abrir ni al cambiar el último mensaje; se salta a `scrollTarget` y al llegar
     * abajo se piden mensajes más recientes con `loadNewer`.
     */
    detached?: boolean;
    hasMoreNewer?: boolean;
    loadingNewer?: boolean;
    loadNewer?: () => void | Promise<void>;
    scrollTarget?: ScrollTarget | null;
    bottomThreshold?: number;
}

const targetKey = (t: ScrollTarget | null | undefined): string => (t ? `${t.id}:${t.seq}` : '');

/** Centra el mensaje `id` en el contenedor; false si su elemento aún no está renderizado. */
function centerOnMessage(container: HTMLElement, id: number): HTMLElement | null {
    const node = container.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
    if (!node) return null;
    const containerRect = container.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    const offset = rect.top - containerRect.top + container.scrollTop;
    container.scrollTop = Math.max(0, offset - (container.clientHeight - rect.height) / 2);
    return node;
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
 * - Modo `detached`: ver `Options.detached`. Al volver a la lista normal
 *   (`detached` pasa a false) baja al fondo al instante.
 */
export function useLoadOlderOnScroll({
    containerRef, chatKey, firstKey, lastKey, hasMore, loadingOlder, loadOlder,
    smoothTail = false, topThreshold = DEFAULT_TOP_THRESHOLD,
    detached = false, hasMoreNewer = false, loadingNewer = false, loadNewer, scrollTarget,
    bottomThreshold = DEFAULT_BOTTOM_THRESHOLD,
}: Options): void {
    const latest = useRef({ hasMore, loadingOlder, loadOlder, detached, hasMoreNewer, loadingNewer, loadNewer });
    useEffect(() => {
        latest.current = { hasMore, loadingOlder, loadOlder, detached, hasMoreNewer, loadingNewer, loadNewer };
    }, [hasMore, loadingOlder, loadOlder, detached, hasMoreNewer, loadingNewer, loadNewer]);

    // Última posición/altura conocidas del contenedor (para reajustar tras anteponer).
    const metrics = useRef({ top: 0, height: 0 });
    const previous = useRef<{
        chatKey: typeof chatKey; firstKey: typeof firstKey; lastKey: typeof lastKey; detached: boolean;
    } | null>(null);
    // Salto pendiente (el elemento del mensaje puede no estar renderizado todavía) y resaltado activo.
    const pendingTarget = useRef<ScrollTarget | null>(null);
    const handledTarget = useRef('');
    const flash = useRef<{ node: HTMLElement; timer: ReturnType<typeof setTimeout> } | null>(null);

    const hasItems = firstKey !== undefined;

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onScroll = () => {
            metrics.current = { top: el.scrollTop, height: el.scrollHeight };
            const cur = latest.current;
            if (el.scrollTop <= topThreshold && cur.hasMore && !cur.loadingOlder) void cur.loadOlder();
            const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            if (cur.detached && cur.hasMoreNewer && !cur.loadingNewer && cur.loadNewer && fromBottom <= bottomThreshold) {
                void cur.loadNewer();
            }
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [containerRef, chatKey, hasItems, topThreshold, bottomThreshold]);

    // El resaltado no sobrevive al desmontaje del hook (temporizador y atributo).
    useEffect(() => () => {
        if (flash.current) {
            clearTimeout(flash.current.timer);
            flash.current.node.removeAttribute(FLASH_ATTR);
            flash.current = null;
        }
    }, []);

    const key = targetKey(scrollTarget);
    useLayoutEffect(() => {
        const el = containerRef.current;
        const prev = previous.current;
        previous.current = { chatKey, firstKey, lastKey, detached };
        if (!el) return;

        // Primera población de un chat (antes vacío) cuenta como abrirlo: salto instantáneo,
        // nunca un scroll suave que emita eventos cerca del tope y dispare loadOlder.
        const chatChanged = !prev || prev.chatKey !== chatKey || (prev.lastKey === undefined && lastKey !== undefined);
        const tailChanged = !prev || prev.lastKey !== lastKey;
        const reattached = !!prev && prev.detached && !detached;
        const record = () => { metrics.current = { top: el.scrollTop, height: el.scrollHeight }; };

        if (detached) {
            if (key !== '' && key !== handledTarget.current) {
                pendingTarget.current = scrollTarget ?? null;
                handledTarget.current = key;
            }
            if (chatChanged && key === '') pendingTarget.current = null;
            const pending = pendingTarget.current;
            if (pending) {
                const node = centerOnMessage(el, pending.id);
                if (node) {
                    pendingTarget.current = null;
                    if (flash.current) {
                        clearTimeout(flash.current.timer);
                        flash.current.node.removeAttribute(FLASH_ATTR);
                    }
                    node.setAttribute(FLASH_ATTR, 'true');
                    flash.current = {
                        node,
                        timer: setTimeout(() => {
                            node.removeAttribute(FLASH_ATTR);
                            flash.current = null;
                        }, FLASH_MS),
                    };
                    record();
                    return;
                }
            }
            if (prev && prev.firstKey !== firstKey && !chatChanged) {
                // Se antepusieron mensajes: mantener el mismo mensaje bajo el ojo.
                el.scrollTop = metrics.current.top + (el.scrollHeight - metrics.current.height);
            }
            record();
            return;
        }

        pendingTarget.current = null;
        handledTarget.current = '';

        if (chatChanged || tailChanged || reattached) {
            const toBottom = () => {
                if (smoothTail && !chatChanged && !reattached && typeof el.scrollTo === 'function') {
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
    }, [containerRef, chatKey, firstKey, lastKey, smoothTail, detached, key, scrollTarget]);
}
