import { useCallback, useRef } from 'react';

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

    return useCallback((key) => {
        let ref = refs.current.get(key);
        if (!ref) {
            ref = { current: null };
            refs.current.set(key, ref);
        }
        return ref;
    }, []);
}

export default useRefMap;
