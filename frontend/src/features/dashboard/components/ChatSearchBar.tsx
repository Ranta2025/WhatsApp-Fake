import { useEffect, useRef, type KeyboardEvent } from 'react';
import { useEscapeToClose } from '../../../hooks/useEscapeToClose';
import type { ChatSearchState } from '../hooks/useChatSearch';

const Icon = ({ d }: { d: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
);

const UP = 'M5 15l7-7 7 7';
const DOWN = 'M19 9l-7 7-7-7';
const CLOSE = 'M6 18L18 6M6 6l12 12';

const statusText = (s: ChatSearchState): string => {
    switch (s.status) {
        case 'ready': return `${s.index + 1} de ${s.results.length}${s.hasMore ? '+' : ''}`;
        case 'loading': return 'Buscando…';
        case 'empty': return 'Sin resultados';
        case 'short': return 'Escribe al menos 2 caracteres';
        case 'error': return 'No se pudo buscar';
        default: return '';
    }
};

interface ChatSearchBarProps {
    search: ChatSearchState;
}

/** Barra de búsqueda dentro de un chat: campo, contador "n de N" y flechas arriba (anterior) / abajo (siguiente). */
const ChatSearchBar = ({ search }: ChatSearchBarProps) => {
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { inputRef.current?.focus(); }, []);
    // Escape cierra la búsqueda (apilado con el resto de capas: modales, menús...)
    useEscapeToClose(search.close, search.isOpen);

    const ready = search.status === 'ready';
    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (e.shiftKey) search.goNewer(); else search.goOlder();
    };

    return (
        <div className="flex-shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-white/[0.06] bg-slate-900/90 backdrop-blur-xl animate-fade-in">
            <input
                ref={inputRef}
                type="text"
                value={search.query}
                onChange={(e) => search.setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Buscar"
                aria-label="Buscar en el chat"
                maxLength={100}
                className="flex-1 min-w-0 bg-slate-800/80 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-400/60"
            />
            <span role="status" aria-live="polite" className="text-xs text-slate-400 whitespace-nowrap min-w-[3.5rem] text-right">
                {statusText(search)}
            </span>
            <button
                type="button"
                onClick={search.goOlder}
                disabled={!ready || (search.index + 1 >= search.results.length && !search.hasMore)}
                className="icon-btn disabled:opacity-40"
                aria-label="Coincidencia anterior"
                title="Anterior"
            >
                <Icon d={UP} />
            </button>
            <button
                type="button"
                onClick={search.goNewer}
                disabled={!ready || search.index === 0}
                className="icon-btn disabled:opacity-40"
                aria-label="Coincidencia siguiente"
                title="Siguiente"
            >
                <Icon d={DOWN} />
            </button>
            <button type="button" onClick={search.close} className="icon-btn" aria-label="Cerrar búsqueda" title="Cerrar">
                <Icon d={CLOSE} />
            </button>
        </div>
    );
};

export default ChatSearchBar;
