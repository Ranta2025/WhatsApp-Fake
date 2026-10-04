import { useMemo, useRef, type RefObject } from 'react';

export type RefMapKey = string | number;

export interface RefMapGetter<T> {
    (key: RefMapKey): RefObject<T | null>;
    /**
     * Borra la entrada para `key` (diferido a un microtask, ver más abajo).
     * Se expone como propiedad de la función para no cambiar la forma del
     * valor de retorno y romper los call sites actuales `getX(key)`.
     */
    release: (key: RefMapKey) => void;
}

/**
 * Devuelve un getter estable `getRef(key)` que crea, de forma perezosa, un
 * objeto ref `{ current: null }` por clave y siempre devuelve el MISMO objeto
 * para la misma clave entre renders.
 *
 * Sirve para pasar un `anchorRef` estable a <Popover> por cada fila de una
 * lista (un mensaje, un miembro de grupo...) sin leer `ref.current` durante
 * el render, que la regla `react-hooks/refs` prohíbe: el componente solo
 * necesita el objeto ref en sí (identidad estable), nunca su valor actual.
 */
export function useRefMap<T = HTMLElement>(): RefMapGetter<T> {
    const refs = useRef(new Map<RefMapKey, RefObject<T | null>>());

    // La función devuelta (con su propiedad `.release`, ver más abajo) se
    // arma completa DENTRO del factory de useMemo, antes de que useMemo la
    // devuelva: la regla react-hooks/immutability prohíbe modificar un valor
    // ya devuelto por un hook (p. ej. adjuntar `.release` a lo que devuelve
    // useCallback), pero no un objeto local que todavía se está construyendo.
    return useMemo(() => {
        const getRef = ((key: RefMapKey): RefObject<T | null> => {
            let ref = refs.current.get(key);
            if (!ref) {
                ref = { current: null };
                refs.current.set(key, ref);
            }
            return ref;
        }) as RefMapGetter<T>;

        // R3-refmap-unbounded: las entradas nunca se borraban (un mensaje o
        // miembro que desaparece de la lista dejaba su ref colgando en el
        // Map para siempre). Se expone como propiedad de la función (en vez
        // de cambiar la forma del valor de retorno, que rompería los call
        // sites actuales `getX(key)`) para que el ref-callback del nodo la
        // invoque cuando React lo desmonta (`el === null`): ver
        // MessageList.jsx / GroupChatWindow.jsx.
        // Un ref-callback inline se llama con null y enseguida con el nodo en
        // cada re-render: el borrado se difiere a un microtask y solo ocurre si
        // la entrada sigue vacía, para no cambiar la identidad del ref.
        getRef.release = (key: RefMapKey): void => {
            const ref = refs.current.get(key);
            if (!ref) return;
            ref.current = null;
            queueMicrotask(() => {
                if (refs.current.get(key) === ref && ref.current === null) {
                    refs.current.delete(key);
                }
            });
        };

        return getRef;
    }, []);
}

export default useRefMap;
