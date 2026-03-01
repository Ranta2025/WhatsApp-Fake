import React, { useEffect, useState, useRef } from 'react';
import { useDashboard } from '../context/DashboardContext';

const TOAST_DURATION = 5000;

// Componente individual de notificación estilo Telegram/WhatsApp
const NotificationToast = ({ toast, onDismiss, onOpen }) => {
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);
    const timerRef = useRef(null);
    const startRef = useRef(Date.now());
    const [progress, setProgress] = useState(100);

    useEffect(() => {
        // Trigger entrada con pequeño delay para la animación
        requestAnimationFrame(() => setVisible(true));

        // Barra de progreso animada
        const tick = () => {
            const elapsed = Date.now() - startRef.current;
            const remaining = Math.max(0, 100 - (elapsed / TOAST_DURATION) * 100);
            setProgress(remaining);
            if (remaining > 0) {
                timerRef.current = requestAnimationFrame(tick);
            }
        };
        timerRef.current = requestAnimationFrame(tick);

        // Auto-dismiss
        const timeout = setTimeout(() => handleDismiss(), TOAST_DURATION);

        return () => {
            clearTimeout(timeout);
            if (timerRef.current) cancelAnimationFrame(timerRef.current);
        };
    }, []);

    const handleDismiss = () => {
        setExiting(true);
        if (timerRef.current) cancelAnimationFrame(timerRef.current);
        setTimeout(() => onDismiss(toast.id), 300);
    };

    const handleClick = () => {
        if (timerRef.current) cancelAnimationFrame(timerRef.current);
        onOpen(toast);
    };

    const hasAvatar = toast.icon && toast.icon !== '/vite.svg';
    const initial = toast.senderName?.charAt(0)?.toUpperCase() || '?';
    const isMedia = toast.mediaType && toast.mediaType !== '';

    // Icono según tipo de media
    const getMediaLabel = () => {
        switch (toast.mediaType) {
            case 'audio': return '🎵 Audio';
            case 'image': return '📷 Foto';
            case 'video': return '🎥 Video';
            case 'document': return '📄 Documento';
            default: return toast.message;
        }
    };

    return (
        <div
            className={`
                pointer-events-auto w-[380px] max-w-[calc(100vw-2rem)]
                rounded-2xl overflow-hidden cursor-pointer
                shadow-[0_8px_32px_rgba(0,0,0,0.45),0_2px_8px_rgba(99,102,241,0.15)]
                border border-white/[0.08]
                transition-all duration-300 ease-out
                ${visible && !exiting
                    ? 'opacity-100 translate-y-0 scale-100'
                    : 'opacity-0 -translate-y-4 scale-95'
                }
            `}
            style={{
                background: 'linear-gradient(135deg, rgba(15,23,42,0.97) 0%, rgba(30,27,75,0.97) 100%)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
            }}
            onClick={handleClick}
        >
            {/* Contenido principal */}
            <div className="flex items-center gap-3 px-4 py-3">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-indigo-500/30 shadow-lg">
                        {hasAvatar ? (
                            <img src={toast.icon} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                                {initial}
                            </div>
                        )}
                    </div>
                    {/* Punto verde online */}
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-slate-900 shadow-sm" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[14px] text-white truncate">
                            {toast.senderName}
                        </span>
                        <span className="text-[11px] text-indigo-300/70 flex-shrink-0 tabular-nums">
                            ahora
                        </span>
                    </div>
                    <p className="text-[13px] text-slate-300/90 truncate mt-0.5 leading-snug">
                        {isMedia ? getMediaLabel() : (toast.message || 'Nuevo mensaje')}
                    </p>
                </div>

                {/* Botón cerrar */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        handleDismiss();
                    }}
                    className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full
                               text-white/30 hover:text-white/80 hover:bg-white/10
                               transition-all duration-150 -mr-1"
                >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                </button>
            </div>

            {/* Barra de progreso */}
            <div className="h-[2px] w-full bg-white/[0.04]">
                <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-none"
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
};

const ToastContainer = () => {
    const { toasts, dismissToast, setSelected, setSidebarOpen, contacts, allChatGroups } = useDashboard();

    if (toasts.length === 0) return null;

    const handleOpen = (toast) => {
        const contact = contacts.find(c => c.Number === toast.telephon)
            || allChatGroups[toast.telephon]
            || { Number: toast.telephon, ContactName: toast.senderName };
        setSelected(contact);
        setSidebarOpen(false);
        dismissToast(toast.id);
    };

    return (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
            {toasts.map(toast => (
                <NotificationToast
                    key={toast.id}
                    toast={toast}
                    onDismiss={dismissToast}
                    onOpen={handleOpen}
                />
            ))}
        </div>
    );
};

export default ToastContainer;
