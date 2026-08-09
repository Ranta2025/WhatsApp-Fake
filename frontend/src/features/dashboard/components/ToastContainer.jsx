import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useDashboard } from '../context/DashboardContext';

const NOTIF_DURATION = 4000;
// Máximo tiempo que una notificación se mantiene en cola esperando que el usuario vuelva (30s)
const MAX_QUEUE_AGE = 30000;

// Paleta Telegram-style para avatares sin foto
const AVATAR_GRADIENTS = [
    'from-rose-500 to-pink-600',
    'from-violet-500 to-purple-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
    'from-blue-500 to-indigo-600',
    'from-fuchsia-500 to-pink-600',
    'from-cyan-500 to-teal-600',
    'from-red-500 to-rose-600',
];

function hashStr(str) {
    let h = 0;
    for (let i = 0; i < (str || '').length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h);
}

// ─── Notificación individual ───────────────────────────────────
const InAppNotification = ({ notif, onDismiss, onOpen }) => {
    const [phase, setPhase] = useState('enter'); // enter | visible | exit
    const timerRef = useRef(null);
    const progressRef = useRef(null);
    // Track elapsed time to pause/resume when visibility changes
    const elapsedRef = useRef(0);
    const lastTickRef = useRef(Date.now());
    const [progress, setProgress] = useState(100);
    const dismissed = useRef(false);

    const dismiss = useCallback(() => {
        if (dismissed.current) return;
        dismissed.current = true;
        if (progressRef.current) cancelAnimationFrame(progressRef.current);
        clearTimeout(timerRef.current);
        setPhase('exit');
        setTimeout(() => onDismiss(notif.id), 350);
    }, [notif.id, onDismiss]);

    useEffect(() => {
        // Entrada
        requestAnimationFrame(() => requestAnimationFrame(() => setPhase('visible')));

        const startTimer = () => {
            lastTickRef.current = Date.now();
            // Progress bar — solo corre cuando la pestaña es visible
            const tick = () => {
                if (document.hidden) {
                    // Pausar: seguir el loop pero no avanzar el tiempo
                    progressRef.current = requestAnimationFrame(tick);
                    return;
                }
                const now = Date.now();
                elapsedRef.current += now - lastTickRef.current;
                lastTickRef.current = now;
                const pct = Math.max(0, 100 - (elapsedRef.current / NOTIF_DURATION) * 100);
                setProgress(pct);
                if (pct > 0) {
                    progressRef.current = requestAnimationFrame(tick);
                } else {
                    dismiss();
                }
            };
            progressRef.current = requestAnimationFrame(tick);
        };

        startTimer();

        return () => {
            clearTimeout(timerRef.current);
            if (progressRef.current) cancelAnimationFrame(progressRef.current);
        };
    }, [dismiss]);

    const handleClick = () => {
        if (dismissed.current) return;
        dismissed.current = true;
        if (progressRef.current) cancelAnimationFrame(progressRef.current);
        clearTimeout(timerRef.current);
        onOpen(notif);
    };

    const hasAvatar = notif.icon && notif.icon !== '/vite.svg' && notif.icon !== '/todos.svg';
    const initial = (notif.senderName || '?').charAt(0).toUpperCase();
    const gradientClass = AVATAR_GRADIENTS[hashStr(notif.senderName) % AVATAR_GRADIENTS.length];

    // Media label
    const bodyText = (() => {
        if (notif.mediaType) {
            switch (notif.mediaType) {
                case 'audio': return '🎵 Mensaje de voz';
                case 'image': return '📷 Foto';
                case 'video': return '🎥 Video';
                case 'document': return '📄 Documento';
                default: break;
            }
        }
        return notif.message || 'Nuevo mensaje';
    })();

    const isVisible = phase === 'visible';
    const isExit = phase === 'exit';

    return (
        <div
            onClick={handleClick}
            className="pointer-events-auto cursor-pointer group"
            style={{
                transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
                transform: isVisible
                    ? 'translateY(0) scale(1)'
                    : isExit
                        ? 'translateY(-20px) scale(0.95)'
                        : 'translateY(-30px) scale(0.9)',
                opacity: isVisible ? 1 : 0,
            }}
        >
            {/* Card principal */}
            <div
                className="relative overflow-hidden rounded-[1.6rem] border border-white/[0.08]"
                style={{
                    background: 'linear-gradient(145deg, #082f49 0%, #0f172a 52%, #1f2937 100%)',
                    boxShadow: '0 20px 60px -12px rgba(0,0,0,0.6), 0 4px 20px -4px rgba(14,165,233,0.18), inset 0 1px 0 rgba(255,255,255,0.05)',
                }}
            >
                <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{ background: 'radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(34,211,238,0.07), transparent 40%)' }}
                />

                <div className="relative flex items-center gap-3.5 p-3.5 pr-3">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                        <div className="w-[52px] h-[52px] rounded-[16px] overflow-hidden shadow-lg ring-1 ring-white/10">
                            {hasAvatar ? (
                                <img
                                    src={notif.icon}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                                />
                            ) : null}
                            <div
                                className={`w-full h-full bg-gradient-to-br ${gradientClass} items-center justify-center text-white font-bold text-xl`}
                                style={{ display: hasAvatar ? 'none' : 'flex' }}
                            >
                                {initial}
                            </div>
                        </div>

                        <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-md bg-sky-500 shadow-lg ring-2 ring-slate-900">
                            <span className="text-[9px] font-black text-white leading-none">T</span>
                        </div>
                    </div>

                    {/* Contenido */}
                    <div className="flex-1 min-w-0 py-0.5">
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-semibold text-[14px] text-white truncate leading-tight">
                                {notif.senderName}
                            </span>
                            <span className="text-[10px] font-medium uppercase tracking-wider text-sky-200/60 flex-shrink-0">
                                Ahora
                            </span>
                        </div>
                        <p className="text-[13px] text-slate-400 truncate leading-snug">
                            {bodyText}
                        </p>
                    </div>

                    {/* Cerrar */}
                    <button
                        onClick={(e) => { e.stopPropagation(); dismiss(); }}
                        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl
                                   text-white/0 group-hover:text-white/40 hover:!text-white/80 hover:bg-white/[0.06]
                                   transition-all duration-200"
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                {/* Barra de progreso */}
                <div className="h-[2px] w-full bg-white/[0.03]">
                    <div
                        className="h-full rounded-full"
                        style={{
                            width: `${progress}%`,
                            background: 'linear-gradient(90deg, #06b6d4, #0ea5e9, #f59e0b)',
                            transition: 'none',
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

// ─── Container ─────────────────────────────────────────────────
const ToastContainer = () => {
    const { toasts, dismissToast, setSelected, setSidebarOpen, contacts, allChatGroups } = useDashboard();

    // Limpiar toasts viejos que acumularon mientras la app estaba en background (>30s)
    useEffect(() => {
        if (toasts.length === 0) return;
        const now = Date.now();
        const stale = toasts.filter(t => t.createdAt && (now - t.createdAt) > MAX_QUEUE_AGE);
        stale.forEach(t => dismissToast(t.id));
    }, [toasts, dismissToast]);

    // Solo mostrar máximo 3 notificaciones a la vez
    const visibleToasts = toasts.slice(-3);

    if (visibleToasts.length === 0) return null;

    const handleOpen = (notif) => {
        const contact = contacts.find(c => c.Number === notif.telephon)
            || allChatGroups[notif.telephon]
            || { Number: notif.telephon, ContactName: notif.senderName };
        setSelected(contact);
        setSidebarOpen(false);
        dismissToast(notif.id);
    };

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2.5 pointer-events-none w-[400px] max-w-[calc(100vw-2rem)]">
            {visibleToasts.map(notif => (
                <InAppNotification
                    key={notif.id}
                    notif={notif}
                    onDismiss={dismissToast}
                    onOpen={handleOpen}
                />
            ))}
        </div>
    );
};

export default ToastContainer;
