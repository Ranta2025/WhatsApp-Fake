import { useEffect, useRef } from 'react';

// Pila (a nivel de módulo) de capas "cerrables con Escape" actualmente
// abiertas, ordenadas por momento de apertura. Solo la capa más reciente (el
// tope) reacciona a Escape: así, si un Popover se abre encima de un modal,
// Escape cierra primero el Popover y NO también el modal en la misma
// pulsación (ver T4: "Escape con un menú anidado abierto cierra solo el
// menú").
let layerStack = [];
let nextLayerId = 0;

/**
 * Cierra `onClose` al presionar Escape mientras `enabled` es true.
 * Pensado para modales y para el primitivo Popover (ver
 * src/components/ui/Popover.jsx), que lo usa internamente.
 */
export function useEscapeToClose(onClose, enabled = true) {
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!enabled) return undefined;

        const id = ++nextLayerId;
        layerStack.push(id);

        const handleKeyDown = (e) => {
            if (e.key !== 'Escape') return;
            if (layerStack[layerStack.length - 1] !== id) return; // no es la capa superior
            e.stopPropagation();
            onCloseRef.current?.();
        };

        document.addEventListener('keydown', handleKeyDown, true);
        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
            layerStack = layerStack.filter((x) => x !== id);
        };
    }, [enabled]);
}

export default useEscapeToClose;
