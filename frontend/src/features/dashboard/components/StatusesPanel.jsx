import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDashboard } from '../context/DashboardContext';

const defaultBackground = 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)';
const STATUS_DURATION_MS = 6000;

const formatStatusTimestamp = (dateValue) => {
    if (!dateValue) return '';
    const date = new Date(dateValue);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    const timeText = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Hoy, ${timeText}`;
    if (isYesterday) return `Ayer, ${timeText}`;
    return `${date.toLocaleDateString([], { day: '2-digit', month: 'short' })}, ${timeText}`;
};

export default function StatusesPanel({ onCreateStatus }) {
    const { statusFeed, selectedStatusOwner, setSelectedStatusOwner, markStatusViewed, deleteStatus, profile, addToast } = useDashboard();
    const [activeIndex, setActiveIndex] = useState(0);
    const [showViewers, setShowViewers] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [transitionClass, setTransitionClass] = useState('opacity-100 translate-y-0 scale-100');
    const holdTimeoutRef = useRef(null);
    const pointerDownRef = useRef(null);
    const videoRef = useRef(null);

    const threads = useMemo(() => {
        const items = [];
        if (statusFeed.myStatuses) items.push(statusFeed.myStatuses);
        return [...items, ...(statusFeed.contacts || [])];
    }, [statusFeed]);

    const activeThread = useMemo(() => {
        if (!threads.length) return null;
        return threads.find((thread) => thread.ownerTelephon === selectedStatusOwner) || threads[0];
    }, [threads, selectedStatusOwner]);

    const activeStatus = activeThread?.statuses?.[activeIndex] || null;
    const isMyThread = activeThread?.ownerTelephon === profile?.Telephon;
    const viewers = activeStatus?.viewers || [];
    const activeThreadIndex = activeThread ? threads.findIndex((thread) => thread.ownerTelephon === activeThread.ownerTelephon) : -1;

    const goToThreadByIndex = (threadIndex, fallbackToLast = false) => {
        const nextThread = threads[threadIndex];
        if (!nextThread) return false;

        setTransitionClass('opacity-0 scale-[0.985]');
        window.setTimeout(() => {
            setSelectedStatusOwner(nextThread.ownerTelephon);
            setActiveIndex(fallbackToLast ? Math.max((nextThread.statuses?.length || 1) - 1, 0) : 0);
            setTransitionClass('opacity-100 translate-x-0 scale-100');
        }, 120);
        return true;
    };

    const goToPreviousStatus = () => {
        if (!activeThread) return;
        if (activeIndex === 0) {
            if (activeThreadIndex > 0) {
                goToThreadByIndex(activeThreadIndex - 1, true);
            }
            return;
        }
        setTransitionClass('opacity-0 translate-x-6 scale-[0.985]');
        window.setTimeout(() => {
            setActiveIndex((current) => Math.max(current - 1, 0));
            setTransitionClass('opacity-100 translate-x-0 scale-100');
        }, 120);
    };

    const goToNextStatus = () => {
        if (!activeThread) return;
        if (activeIndex >= activeThread.statuses.length - 1) {
            if (activeThreadIndex >= 0 && activeThreadIndex < threads.length - 1) {
                goToThreadByIndex(activeThreadIndex + 1);
            }
            return;
        }
        setTransitionClass('opacity-0 -translate-x-6 scale-[0.985]');
        window.setTimeout(() => {
            setActiveIndex((current) => Math.min(current + 1, activeThread.statuses.length - 1));
            setTransitionClass('opacity-100 translate-x-0 scale-100');
        }, 120);
    };

    const clearHoldTimeout = () => {
        if (holdTimeoutRef.current) {
            window.clearTimeout(holdTimeoutRef.current);
            holdTimeoutRef.current = null;
        }
    };

    const pausePlayback = () => {
        setIsPaused(true);
        if (videoRef.current && !videoRef.current.paused) {
            videoRef.current.pause();
        }
    };

    const resumePlayback = () => {
        setIsPaused(false);
        if (videoRef.current && activeStatus?.mediaType === 'video' && !showViewers) {
            videoRef.current.play().catch(() => {});
        }
    };

    const handlePointerDown = (event) => {
        if (showViewers) return;
        pointerDownRef.current = {
            startedAt: Date.now(),
            clientX: event.clientX,
            width: event.currentTarget.getBoundingClientRect().width,
        };
        clearHoldTimeout();
        holdTimeoutRef.current = window.setTimeout(() => {
            pausePlayback();
        }, 180);
    };

    const handlePointerUp = (event) => {
        const pointerData = pointerDownRef.current;
        clearHoldTimeout();
        pointerDownRef.current = null;
        const wasPausedByHold = isPaused;

        if (!pointerData) {
            if (wasPausedByHold) resumePlayback();
            return;
        }

        const elapsed = Date.now() - pointerData.startedAt;
        const relativeX = event.clientX - event.currentTarget.getBoundingClientRect().left;
        const isQuickTap = elapsed < 180;

        if (wasPausedByHold) {
            resumePlayback();
            return;
        }

        if (!isQuickTap || showViewers) {
            return;
        }

        if (relativeX < pointerData.width / 2) {
            goToPreviousStatus();
        } else {
            goToNextStatus();
        }
    };

    useEffect(() => {
        if (!activeThread) return;
        const firstUnviewedIndex = activeThread.statuses.findIndex((status) => !status.viewed);
        setActiveIndex(firstUnviewedIndex >= 0 ? firstUnviewedIndex : Math.max(activeThread.statuses.length - 1, 0));
        setShowViewers(false);
        setIsPaused(false);
    }, [activeThread?.ownerTelephon]);

    useEffect(() => {
        setShowViewers(false);
        setIsPaused(false);
        setTransitionClass('opacity-100 translate-x-0 scale-100');
    }, [activeStatus?.id]);

    useEffect(() => {
        if (!videoRef.current || activeStatus?.mediaType !== 'video') return;
        if (isPaused || showViewers) {
            videoRef.current.pause();
            return;
        }
        videoRef.current.play().catch(() => {});
    }, [activeStatus?.id, activeStatus?.mediaType, isPaused, showViewers]);

    useEffect(() => {
        if (!activeStatus || isMyThread || activeStatus.viewed) return;
        markStatusViewed(activeStatus.id).catch((error) => {
            console.error('Error marking status viewed:', error);
        });
    }, [activeStatus?.id, activeStatus?.viewed, isMyThread, markStatusViewed]);

    useEffect(() => {
        if (!activeThread || !activeStatus || activeStatus.mediaType === 'video' || isPaused || showViewers) return undefined;
        const timer = setTimeout(() => {
            goToNextStatus();
        }, STATUS_DURATION_MS);
        return () => clearTimeout(timer);
    }, [activeThread, activeStatus, activeIndex, isPaused, showViewers]);

    useEffect(() => {
        return () => clearHoldTimeout();
    }, []);

    const handleDelete = async () => {
        if (!activeStatus || !isMyThread) return;
        if (!window.confirm('Quieres eliminar este estado?')) return;
        try {
            await deleteStatus(activeStatus.id);
        } catch (error) {
            console.error('Error deleting status:', error);
            addToast({ type: 'error', message: 'No pudimos eliminar el estado en este momento.' });
        }
    };

    if (!threads.length) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center bg-[#0B1120] px-8 text-center">
                <div className="max-w-xl rounded-2xl border border-white/[0.06] bg-[#0B1120] px-8 py-10 shadow-xl">
                    <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-sky-500/10 text-sky-300">
                        <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 8h10M7 12h6m-8 8l3.154-3.154A4 4 0 0011.982 16H18a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2h1z" /></svg>
                    </div>
                    <h2 className="text-3xl font-semibold text-white">Todavia no hay estados</h2>
                    <p className="mt-3 text-slate-400">Cuando publiques uno, aparecera aqui y tus contactos podran verlo durante 24 horas.</p>
                    <button onClick={onCreateStatus} className="mt-8 rounded-2xl gradient-brand px-5 py-2.5 font-semibold text-white shadow-glow">Publicar mi primer estado</button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-1 min-h-0 min-w-0 bg-[#0B1120]">
            <div className="hidden lg:flex lg:w-72 xl:w-80 flex-col border-r border-white/[0.04] bg-[#0B1120] p-4">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-white">Estados</h2>
                        <p className="text-sm text-slate-400">Historias activas de las ultimas 24 horas.</p>
                    </div>
                    <button onClick={onCreateStatus} className="rounded-2xl bg-sky-500/10 px-3 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-500/20">Crear</button>
                </div>
                <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
                    {threads.map((thread) => (
                        <button key={thread.ownerTelephon} onClick={() => setSelectedStatusOwner(thread.ownerTelephon)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${thread.ownerTelephon === activeThread?.ownerTelephon ? 'bg-white/[0.05] border-l-2 border-sky-500' : 'hover:bg-white/[0.03]'}`}>
                            <div className={`relative h-12 w-12 rounded-full p-[2px] ${thread.hasUnviewed ? 'bg-gradient-to-br from-emerald-400 via-sky-400 to-indigo-500' : 'bg-white/10'}`}>
                                <div className="h-full w-full overflow-hidden rounded-full bg-slate-900">
                                    {thread.ownerAvatar ? <img src={thread.ownerAvatar} alt="avatar" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-slate-800 text-sm font-semibold text-white">{(thread.ownerName || thread.ownerUsername || thread.ownerTelephon)?.charAt(0)?.toUpperCase()}</div>}
                                </div>
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-slate-100">{thread.ownerTelephon === profile?.Telephon ? 'Mi estado' : thread.ownerName}</div>
                                <div className="flex items-center gap-2 truncate text-sm text-slate-400">
                                    <span className={`inline-flex h-2.5 w-2.5 rounded-full ${thread.hasUnviewed ? 'bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]' : 'bg-slate-600'}`} />
                                    <span className="truncate">{thread.hasUnviewed ? 'Nuevo * ' : 'Visto * '}{formatStatusTimestamp(thread.lastStatusAt)}</span>
                                </div>
                            </div>
                            <div className="text-xs text-slate-500">{thread.statuses.length}</div>
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-white/[0.04] bg-[#0B1120]/95 px-4 py-4 backdrop-blur-md sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <button
                            onClick={() => setSelectedStatusOwner(null)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-slate-300 transition hover:bg-white/10 xl:hidden"
                            aria-label="Volver a la lista de estados"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <div className="min-w-0">
                        <div className="truncate text-lg font-semibold text-white">{isMyThread ? 'Mi estado' : activeThread?.ownerName}</div>
                        <div className="truncate text-sm text-slate-400">{formatStatusTimestamp(activeStatus?.createdAt)}{activeThread?.statuses?.length > 1 ? ` * ${activeIndex + 1}/${activeThread?.statuses?.length}` : ''}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isMyThread && <button onClick={onCreateStatus} className="rounded-2xl bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-500/20">Nuevo estado</button>}
                        {isMyThread && activeStatus && <button onClick={handleDelete} className="rounded-2xl bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/15">Eliminar</button>}
                    </div>
                </div>
                {activeThread && (
                    <div className="flex flex-1 flex-col overflow-hidden p-4 sm:p-6">
                        <div className="mb-4 flex gap-2">
                            {activeThread.statuses.map((status, index) => (
                                <button key={status.id} onClick={() => setActiveIndex(index)} className={`relative h-0.5 flex-1 overflow-hidden rounded-full transition ${status.viewed || isMyThread || index < activeIndex ? 'bg-white/20' : 'bg-white/10'}`} aria-label={`Ver estado ${index + 1}`}>
                                    <span
                                        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${index < activeIndex ? 'w-full bg-white' : index === activeIndex ? 'bg-sky-400' : 'w-0 bg-transparent'}`}
                                        style={index === activeIndex ? { width: activeStatus?.mediaType === 'video' ? '100%' : isPaused || showViewers ? '35%' : '100%' } : undefined}
                                    />
                                </button>
                            ))}
                        </div>
                        <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0B1120] shadow-xl">
                            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                                <div>
                                    <div className="text-sm font-semibold text-slate-100">{isMyThread ? 'Publicado por ti' : activeThread.ownerName}</div>
                                    <div className="text-xs text-slate-400">{formatStatusTimestamp(activeStatus?.createdAt)}</div>
                                </div>
                                {isMyThread && activeStatus && <div className="text-xs font-medium text-slate-400">{activeStatus.viewCount} vista{activeStatus.viewCount === 1 ? '' : 's'}</div>}
                            </div>
                            <div
                                className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#0B1120] p-4 sm:p-8 select-none"
                                onPointerDown={handlePointerDown}
                                onPointerUp={handlePointerUp}
                                onPointerCancel={() => {
                                    clearHoldTimeout();
                                    if (isPaused) resumePlayback();
                                }}
                                onPointerLeave={() => {
                                    clearHoldTimeout();
                                    if (isPaused) resumePlayback();
                                }}
                            >
                                <div className="absolute inset-y-0 left-0 z-[1] w-1/2" aria-hidden="true" />
                                <div className="absolute inset-y-0 right-0 z-[1] w-1/2" aria-hidden="true" />
                                <button onClick={goToPreviousStatus} disabled={activeIndex === 0} className="absolute left-3 top-1/2 z-10 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm text-white hover:bg-black/50 disabled:opacity-30 flex items-center justify-center" aria-label="Ver estado anterior"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                                <div className={`flex h-full w-full max-w-4xl items-center justify-center transform transition-all duration-150 ease-out ${transitionClass}`}>
                                    {activeStatus?.mediaUrl ? (
                                        activeStatus.mediaType === 'video' ? (
                                            <video ref={videoRef} key={activeStatus.id} src={activeStatus.mediaUrl} controls autoPlay className="max-h-full max-w-full rounded-2xl shadow-2xl bg-black object-contain" onEnded={goToNextStatus} />
                                        ) : (
                                            <img src={activeStatus.mediaUrl} alt="Estado" className="max-h-full max-w-full rounded-2xl shadow-2xl object-contain" />
                                        )
                                    ) : (
                                        <div className="flex min-h-[300px] w-full items-center justify-center rounded-[1.75rem] px-6 py-10 shadow-inner sm:min-h-[420px] sm:px-10 sm:py-16" style={{ background: activeStatus?.background || defaultBackground }}>
                                            <p className="max-w-2xl whitespace-pre-wrap text-center text-lg font-medium text-white">{activeStatus?.text}</p>
                                        </div>
                                    )}
                                </div>
                                {isPaused && !showViewers && (
                                    <div className="absolute top-5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
                                        Pausado
                                    </div>
                                )}
                                <button onClick={goToNextStatus} disabled={activeIndex >= activeThread.statuses.length - 1} className="absolute right-3 top-1/2 z-10 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm text-white hover:bg-black/50 disabled:opacity-30 flex items-center justify-center" aria-label="Ver siguiente estado"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                            </div>
                            {activeStatus?.text && activeStatus?.mediaUrl && <div className="border-t border-white/5 px-5 py-4 text-sm leading-relaxed text-slate-200">{activeStatus.text}</div>}
                            {isMyThread && activeStatus && (
                                <>
                                <button
                                    type="button"
                                    onClick={() => setShowViewers((current) => !current)}
                                    className="absolute bottom-4 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/45 px-4 py-2 text-sm text-slate-100 backdrop-blur-md transition hover:bg-black/55"
                                    aria-label="Ver lista de personas que vieron el estado"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    <span>{activeStatus.viewCount} vista{activeStatus.viewCount === 1 ? '' : 's'}</span>
                                    <svg className={`h-4 w-4 transition-transform ${showViewers ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                {showViewers && (
                                <div className="bg-[#0B1120]/95 border-t border-white/[0.04] px-5 py-4">
                                    <div className="mb-3 flex items-center justify-between">
                                        <div>
                                            <div className="text-sm font-semibold text-slate-100">Visto por</div>
                                            <div className="text-xs text-slate-500">La lista se actualiza al instante cuando alguien lo abre.</div>
                                        </div>
                                        <div className="rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                                            {viewers.length} persona{viewers.length === 1 ? '' : 's'}
                                        </div>
                                    </div>
                                    {viewers.length === 0 ? (
                                        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-4 text-sm text-slate-500">
                                            Aun no hay visualizaciones para este estado.
                                        </div>
                                    ) : (
                                        <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                                            {viewers.map((viewer) => (
                                                <div key={`${activeStatus.id}-${viewer.viewerTelephon}-${viewer.viewedAt}`} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
                                                    <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-800">
                                                        {viewer.viewerAvatar ? (
                                                            <img src={viewer.viewerAvatar} alt={viewer.viewerName} className="h-full w-full object-cover" />
                                                        ) : (
                                                            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-white">
                                                                {(viewer.viewerName || viewer.viewerUsername || viewer.viewerTelephon)?.charAt(0)?.toUpperCase()}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="truncate text-sm font-medium text-slate-100">{viewer.viewerName}</div>
                                                        <div className="truncate text-xs text-slate-500">{viewer.viewerTelephon}</div>
                                                    </div>
                                                    <div className="text-right text-xs text-slate-400">
                                                        {formatStatusTimestamp(viewer.viewedAt)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                )}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
