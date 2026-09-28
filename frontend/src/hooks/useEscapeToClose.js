import { useEffect, useRef } from 'react';
import { pushEscapeLayer, popEscapeLayer, triggerTopEscapeLayer } from '../lib/escapeStack';

// Propiedad que se marca en el propio evento de teclado cuando alguna capa
// de la pila lo manejó (ver R3-escape-capture-swallows-unregistered-
// handlers). A propósito NO se llama e.stopPropagation(): eso silenciaba por
// completo cualquier handler de Escape que no pasara por este hook (p. ej.
// StatusViewer/StatusComposer cuando tenían su propio listener, o cancelar
// respuesta/edición en el composer de chat), ya que un stopPropagation en
// fase de captura sobre `document` corta la propagación antes de llegar al
// target y a la fase de burbuja por completo. En su lugar, el código que no
// participa de la pila (p. ej. GroupChatWindow.jsx) puede consultar este
// flag en el evento y decidir no actuar en la misma pulsación.
export const ESCAPE_HANDLED_FLAG = '__escapeHandledByLayer';

// El flag se marca en el evento NATIVO del documento. Los handlers de React
// reciben un evento sintético, así que hay que mirar `nativeEvent`.
export function isEscapeHandled(e) {
    return Boolean((e?.nativeEvent ?? e)?.[ESCAPE_HANDLED_FLAG]);
}

// Listener único compartido a nivel de documento (en vez de uno por capa
// activa): se instala perezosamente cuando hay al menos una capa y se retira
// cuando no queda ninguna. Sigue en fase de captura para enterarse antes que
// cualquier otro código de la tecla, pero sin bloquear su propagación.
let sharedListenerRefCount = 0;

function handleDocumentKeyDown(e) {
    if (e.key !== 'Escape') return;
    const handled = triggerTopEscapeLayer();
    if (handled) e[ESCAPE_HANDLED_FLAG] = true;
}

function acquireSharedListener() {
    if (sharedListenerRefCount === 0) {
        document.addEventListener('keydown', handleDocumentKeyDown, true);
    }
    sharedListenerRefCount += 1;
}

function releaseSharedListener() {
    sharedListenerRefCount = Math.max(0, sharedListenerRefCount - 1);
    if (sharedListenerRefCount === 0) {
        document.removeEventListener('keydown', handleDocumentKeyDown, true);
    }
}

/**
 * Cierra `onClose` al presionar Escape mientras `enabled` es true, apilado
 * junto con el resto de capas activas (modales, el primitivo Popover — ver
 * src/components/ui/Popover.jsx —, StatusViewer, StatusComposer...): solo la
 * capa superior reacciona a cada pulsación (ver src/lib/escapeStack.js).
 */
export function useEscapeToClose(onClose, enabled = true) {
    const onCloseRef = useRef(onClose);
    // "Ref siempre al día" (mismo patrón que Popover.jsx): se actualiza en un
    // efecto, nunca durante el render (regla react-hooks/refs).
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    useEffect(() => {
        if (!enabled) return undefined;

        const id = pushEscapeLayer(() => onCloseRef.current?.());
        acquireSharedListener();

        return () => {
            releaseSharedListener();
            popEscapeLayer(id);
        };
    }, [enabled]);
}

export default useEscapeToClose;
