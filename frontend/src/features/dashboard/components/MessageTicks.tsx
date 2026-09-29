import type { JSX } from 'react';
import type { MessageStatus } from '../../../types/api';

/**
 * Ticks de estado de un mensaje propio (chat 1:1 y grupos): un check gris =
 * enviado, doble gris = entregado, doble azul = visto. Un estado desconocido
 * (mensaje aún sin confirmar) muestra un reloj.
 */
export default function MessageTicks({ status }: { status: MessageStatus }): JSX.Element {
    // Stroke-based ticks: the second check is shifted right so both marks stay distinct
    const strokeProps = {
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
    };
    if (status === 'visto' || status === 'entregado') {
        const isRead = status === 'visto';
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 12"
                className={`h-3 w-5 shrink-0 transition-colors duration-300 ${isRead ? 'text-sky-300' : 'text-white/60'}`}
                role="img"
                aria-label={isRead ? 'Visto' : 'Entregado'}
            >
                <path {...strokeProps} d="M1.5 6.5 5 10l7.5-8" />
                <path {...strokeProps} d="M8.6 9.4 9.2 10l7.5-8" />
            </svg>
        );
    }
    if (status === 'enviado') {
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 12"
                className="h-3 w-5 shrink-0 text-white/60"
                role="img"
                aria-label="Enviado"
            >
                <path {...strokeProps} d="M4.5 6.5 8 10l7.5-8" />
            </svg>
        );
    }
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="h-3 w-3 shrink-0 text-white/50"
            role="img"
            aria-label="Enviando"
        >
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 7v5l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}
