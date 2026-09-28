import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';

const VIEWPORT_MARGIN = 8;

/**
 * Menú/popover reutilizable: se renderiza en un portal a document.body, en la
 * capa "dropdown" del sistema de z-index (ver index.css), para no quedar
 * recortado por un ancestro con overflow-y-auto (el bug de T4).
 *
 * - Se posiciona a partir del rect de `anchorRef.current` (el disparador).
 * - Se voltea hacia arriba si no cabe debajo, y se realinea dentro del
 *   viewport horizontalmente.
 * - Se reposiciona en scroll/resize mientras está abierto (no se cierra).
 * - Se cierra con click/tap fuera o con Escape (vía useEscapeToClose, que
 *   coordina con modales anidados para que Escape cierre solo el popover).
 * - Devuelve el foco al disparador al cerrarse.
 *
 * `anchorRef` se recibe como objeto ref (no como el elemento ya resuelto):
 * su `.current` solo se lee dentro de efectos, nunca durante el render (ver
 * la regla react-hooks/refs — leer un ref durante el render es un error).
 *
 * Uso: <Popover open={isOpen} onClose={close} anchorRef={triggerRef}
 *        align="right">...</Popover>
 */
export default function Popover({ open, onClose, anchorRef, children, align = 'left', className = '' }) {
    const popoverRef = useRef(null);
    const [style, setStyle] = useState(null);
    // "Ref siempre al día" para leer la última `onClose` desde los listeners
    // sin volver a suscribirlos; se actualiza en un efecto (nunca durante el
    // render, que la regla react-hooks/refs prohíbe).
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    useEscapeToClose(onClose, open);

    // Posicionamiento inicial + realineado en scroll/resize.
    useLayoutEffect(() => {
        if (!open) return undefined;
        const anchor = anchorRef?.current;
        if (!anchor) return undefined;

        const reposition = () => {
            const rect = anchor.getBoundingClientRect();
            const popover = popoverRef.current;
            const popH = popover?.offsetHeight ?? 0;
            const popW = popover?.offsetWidth ?? 0;

            const spaceBelow = window.innerHeight - rect.bottom;
            const flipUp = spaceBelow < popH + VIEWPORT_MARGIN && rect.top > popH;

            let left = align === 'right' ? rect.right - popW : rect.left;
            left = Math.min(Math.max(VIEWPORT_MARGIN, left), window.innerWidth - popW - VIEWPORT_MARGIN);

            setStyle({
                position: 'fixed',
                top: flipUp ? Math.max(VIEWPORT_MARGIN, rect.top - popH - 4) : rect.bottom + 4,
                left,
            });
        };

        reposition();
        // Recalcular una vez montado, cuando ya se conoce el alto/ancho real.
        const raf = requestAnimationFrame(reposition);
        window.addEventListener('resize', reposition);
        // capture:true para detectar scroll en cualquier contenedor ancestro.
        window.addEventListener('scroll', reposition, true);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
        };
    }, [open, anchorRef, align]);

    // Cerrar en click/tap fuera del popover y del disparador.
    useEffect(() => {
        if (!open) return undefined;
        const handlePointerDown = (e) => {
            if (popoverRef.current?.contains(e.target)) return;
            if (anchorRef?.current?.contains(e.target)) return;
            onCloseRef.current?.();
        };
        document.addEventListener('pointerdown', handlePointerDown, true);
        return () => document.removeEventListener('pointerdown', handlePointerDown, true);
    }, [open, anchorRef]);

    // Devolver el foco al disparador cuando el popover pasa de abierto a cerrado.
    const wasOpenRef = useRef(open);
    useEffect(() => {
        if (wasOpenRef.current && !open) {
            anchorRef?.current?.focus?.({ preventScroll: true });
        }
        wasOpenRef.current = open;
    }, [open, anchorRef]);

    if (!open) return null;

    return createPortal(
        <div
            ref={popoverRef}
            role="menu"
            style={style || { position: 'fixed', top: -9999, left: -9999, visibility: 'hidden' }}
            className={`z-dropdown ${className}`}
            onClick={(e) => e.stopPropagation()}
        >
            {children}
        </div>,
        document.body
    );
}
