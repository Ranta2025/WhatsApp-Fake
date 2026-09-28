import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Avatar from '../../../components/ui/Avatar';
import { useStatus } from '../context/StatusContext';
import { useDashboard } from '../../dashboard/context/DashboardContext';
import { formatStatusTimestamp } from '../../../utils/format';

const DEFAULT_DURATION_MS = 5000;

const CloseIcon = () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const EyeIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const TrashIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
);

/** Bottom sheet con la lista de quién vio un estado propio. */
const ViewersSheet = ({ viewers, onClose }) => (
    <div className="absolute inset-0 z-10 flex items-end" onClick={onClose}>
        <div className="absolute inset-0 bg-black/60" />
        <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-h-[60vh] bg-slate-900 rounded-t-2xl border-t border-white/10 flex flex-col animate-slide-up"
        >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
                <h3 className="text-slate-100 font-semibold text-sm">Visto por {viewers.length}</h3>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1" aria-label="Cerrar lista de vistos">
                    <CloseIcon />
                </button>
            </div>
            <div className="overflow-y-auto px-2 py-2">
                {viewers.length === 0 ? (
                    <p className="text-center text-sm text-slate-500 py-6">Todavía nadie vio este estado</p>
                ) : (
                    viewers.map(v => (
                        <div key={v.Telephon} className="flex items-center gap-3 px-2 py-2">
                            <Avatar src={v.AvatarUrl} name={v.Username} size="sm" />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm text-slate-100 truncate">{v.Username}</div>
                            </div>
                            <span className="text-xs text-slate-500 flex-shrink-0">{formatStatusTimestamp(v.ViewedAt)}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    </div>
);

/**
 * Visor de estados a pantalla completa (portal a document.body): barras de
 * progreso por estado, avance automático, navegación por tap/teclado, y
 * herramientas de dueño (vistos, eliminar) cuando se ve "Mi estado".
 */
export default function StatusViewer() {
    const {
        viewerKey, statusIndex, currentStatuses, currentOwner,
        goNext, goPrev, closeViewer, viewStatus, fetchViewers,
        viewersByStatusId, removeMyStatus,
    } = useStatus();
    const { myAvatar, profile } = useDashboard();

    const [paused, setPaused] = useState(false);
    const [progress, setProgress] = useState(0);
    const [showViewers, setShowViewers] = useState(false);
    const containerRef = useRef(null);
    const videoRef = useRef(null);
    const durationRef = useRef(DEFAULT_DURATION_MS);
    const elapsedRef = useRef(0);
    const startRef = useRef(0);
    const rafRef = useRef(null);

    const isOpen = !!viewerKey;
    const isMine = viewerKey?.mode === 'mine';
    const currentStatus = currentStatuses[statusIndex] || null;

    const ownerName = isMine
        ? (profile?.Username || 'Mi estado')
        : (currentOwner?.ContactName || currentOwner?.Username || currentOwner?.Telephon || '');
    const ownerAvatar = isMine ? myAvatar : currentOwner?.AvatarUrl;

    // Bloquear scroll de fondo, enfocar el overlay y permitir Escape para cerrar.
    useEffect(() => {
        if (!isOpen) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        containerRef.current?.focus();
        return () => { document.body.style.overflow = prevOverflow; };
    }, [isOpen]);

    // Navegación por teclado.
    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') closeViewer();
            else if (e.key === 'ArrowRight') goNext();
            else if (e.key === 'ArrowLeft') goPrev();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, closeViewer, goNext, goPrev]);

    // Marcar como visto en cuanto se muestra (si no es mío y no estaba visto).
    useEffect(() => {
        if (!currentStatus || isMine || !viewerKey) return;
        viewStatus(currentStatus, viewerKey.telephon, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de estado mostrado
    }, [currentStatus?.ID]);

    // Cerrar la hoja de vistos y resetear progreso al cambiar de estado.
    useEffect(() => {
        setShowViewers(false);
        elapsedRef.current = 0;
        setProgress(0);
        // Para video, onLoadedMetadata ajusta durationRef con la duración real.
        durationRef.current = DEFAULT_DURATION_MS;
    }, [currentStatus?.ID]);

    const advance = useCallback(() => {
        elapsedRef.current = 0;
        setProgress(0);
        goNext();
    }, [goNext]);

    // Reloj de avance automático (pausable).
    useEffect(() => {
        if (!isOpen || paused || !currentStatus || showViewers) return;
        startRef.current = performance.now() - elapsedRef.current;
        const tick = (now) => {
            const elapsed = now - startRef.current;
            elapsedRef.current = elapsed;
            const pct = Math.min(100, (elapsed / durationRef.current) * 100);
            setProgress(pct);
            if (pct >= 100) {
                advance();
                return;
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [isOpen, paused, currentStatus, showViewers, advance]);

    if (!isOpen || !currentStatus) return null;

    const handleVideoLoaded = () => {
        const dur = videoRef.current?.duration;
        if (dur && Number.isFinite(dur) && dur > 0) {
            durationRef.current = dur * 1000;
            elapsedRef.current = 0;
        }
    };

    const handleTap = (e) => {
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x < rect.width / 2) goPrev();
        else goNext();
    };

    const openViewers = async () => {
        setPaused(true);
        setShowViewers(true);
        await fetchViewers(currentStatus.ID);
    };

    const closeViewers = () => {
        setShowViewers(false);
        setPaused(false);
    };

    const handleDelete = async () => {
        if (!window.confirm('¿Eliminar este estado?')) return;
        try {
            await removeMyStatus(currentStatus.ID);
        } catch (err) {
            console.error('Error al eliminar el estado:', err);
        }
    };

    const viewers = viewersByStatusId[currentStatus.ID] || [];

    const content = (
        <div
            ref={containerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`Estado de ${ownerName}`}
            className="fixed inset-0 z-[100000] bg-black flex flex-col outline-none animate-fade-in"
            onPointerDown={() => setPaused(true)}
            onPointerUp={() => setPaused(false)}
            onPointerLeave={() => setPaused(false)}
            onPointerCancel={() => setPaused(false)}
        >
            {/* Barras de progreso */}
            <div className="flex gap-1 px-3 pt-3 flex-shrink-0">
                {currentStatuses.map((s, i) => (
                    <div key={s.ID} className="flex-1 h-0.5 rounded-full bg-white/25 overflow-hidden">
                        <div
                            className="h-full bg-white"
                            style={{ width: `${i < statusIndex ? 100 : i === statusIndex ? progress : 0}%` }}
                        />
                    </div>
                ))}
            </div>

            {/* Cabecera */}
            <header className="flex items-center gap-3 px-4 py-3 flex-shrink-0">
                <Avatar src={ownerAvatar} name={ownerName} size="sm" />
                <div className="flex-1 min-w-0">
                    <div className="text-white font-semibold text-sm truncate">{ownerName}</div>
                    <div className="text-white/60 text-xs">{formatStatusTimestamp(currentStatus.CreatedAt)}</div>
                </div>
                <button
                    onClick={closeViewer}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 transition-colors"
                    aria-label="Cerrar visor de estados"
                >
                    <CloseIcon />
                </button>
            </header>

            {/* Contenido + tap zones */}
            <div className="relative flex-1 flex items-center justify-center overflow-hidden" onClick={handleTap}>
                {currentStatus.Type === 'text' && (
                    <div
                        className="absolute inset-0 flex items-center justify-center p-8"
                        style={{ backgroundColor: currentStatus.BackgroundColor || '#128C7E' }}
                    >
                        <p className="text-white text-2xl sm:text-3xl font-medium text-center break-words max-w-2xl">
                            {currentStatus.Text}
                        </p>
                    </div>
                )}
                {currentStatus.Type === 'image' && (
                    <img
                        src={currentStatus.MediaUrl}
                        alt={currentStatus.Caption || 'Estado'}
                        className="max-w-full max-h-full object-contain"
                    />
                )}
                {currentStatus.Type === 'video' && (
                    <video
                        ref={videoRef}
                        src={currentStatus.MediaUrl}
                        className="max-w-full max-h-full object-contain"
                        autoPlay
                        muted
                        playsInline
                        onLoadedMetadata={handleVideoLoaded}
                    />
                )}
            </div>

            {/* Leyenda */}
            {currentStatus.Caption && currentStatus.Type !== 'text' && (
                <div className="px-4 pb-3 flex-shrink-0">
                    <p className="text-white text-sm text-center bg-black/40 rounded-xl px-3 py-2 inline-block max-w-full">
                        {currentStatus.Caption}
                    </p>
                </div>
            )}

            {/* Pie: acciones del dueño */}
            {isMine && (
                <footer className="flex items-center justify-center gap-6 px-4 py-3 flex-shrink-0">
                    <button
                        onClick={(e) => { e.stopPropagation(); openViewers(); }}
                        className="flex items-center gap-1.5 text-white/80 hover:text-white text-sm font-medium transition-colors"
                        aria-label="Ver quién vio este estado"
                    >
                        <EyeIcon />
                        {currentStatus.ViewCount ?? 0}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                        className="flex items-center gap-1.5 text-white/80 hover:text-rose-400 text-sm font-medium transition-colors"
                        aria-label="Eliminar este estado"
                    >
                        <TrashIcon />
                    </button>
                </footer>
            )}

            {showViewers && <ViewersSheet viewers={viewers} onClose={closeViewers} />}
        </div>
    );

    return createPortal(content, document.body);
}
