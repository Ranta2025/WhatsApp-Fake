import { useMemo, useRef } from 'react';

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
export function useRefMap() {
    const refs = useRef(new Map());

    // La función devuelta (con su propiedad `.release`, ver más abajo) se
    // arma completa DENTRO del factory de useMemo, antes de que useMemo la
    // devuelva: la regla react-hooks/immutability prohíbe modificar un valor
    // ya devuelto por un hook (p. ej. adjuntar `.release` a lo que devuelve
    // useCallback), pero no un objeto local que todavía se está construyendo.
    return useMemo(() => {
        const getRef = (key) => {
            let ref = refs.current.get(key);
            if (!ref) {
                ref = { current: null };
                refs.current.set(key, ref);
            }
            return ref;
        };

        // R3-refmap-unbounded: las entradas nunca se borraban (un mensaje o
        // miembro que desaparece de la lista dejaba su ref colgando en el
        // Map para siempre). Se expone como propiedad de la función (en vez
        // de cambiar la forma del valor de retorno, que rompería los call
        // sites actuales `getX(key)`) para que el ref-callback del nodo la
        // invoque cuando React lo desmonta (`el === null`): ver
        // MessageList.jsx / GroupChatWindow.jsx.
        getRef.release = (key) => {
            refs.current.delete(key);
        };

        return getRef;
    }, []);
}

export default useRefMap;
