import { useRef, useEffect, useMemo, useState } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { useMessaging } from '../hooks/useMessaging';
import { formatDaySeparator, formatTime } from '../../../utils/format';
import AudioPlayer from '../../../components/AudioPlayer';
import Popover from '../../../components/ui/Popover';
import { useRefMap } from '../../../hooks/useRefMap';

/**
 * MessageList Component
 * Renderiza la lista de mensajes de un chat con optimizaciones de UI/UX.
 */
// Lee los fondos por chat guardados en localStorage (puede fallar en modo privado)
const readChatWallpapers = () => {
    try {
        return JSON.parse(localStorage.getItem('chat_wallpapers') || '{}') || {};
    } catch {
        return {};
    }
};

const MessageList = () => {
    const { 
        selected, messagesByChat, profile, globalWallpaper 
    } = useDashboard();

    // Per-chat wallpapers from localStorage (set via ContactDetails)
    const [chatWallpapers, setChatWallpapers] = useState(readChatWallpapers);

    useEffect(() => {
        // Listen for storage changes (cross-tab)
        const onStorage = (e) => {
            if (e.key === 'chat_wallpapers') {
                try { setChatWallpapers(e.newValue ? JSON.parse(e.newValue) : {}); } catch { /* ignore */ }
            }
        };
        // Listen for same-tab wallpaper changes (dispatched by ContactDetails)
        const onCustom = (e) => {
            setChatWallpapers(e.detail || {});
        };
        window.addEventListener('storage', onStorage);
        window.addEventListener('chat-wallpaper-changed', onCustom);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('chat-wallpaper-changed', onCustom);
        };
    }, []);

    
    const { 
        editingMessageId, editingMessageText, handleEditMessageChange, 
        handleEditMessageSave, handleEditMessageCancel, handleEditMessage,
        handleDeleteMessage, handleDeleteMessageForMe, handleReplyToMessage,
        handleForwardMessage,
        messageMenuOpen, setMessageMenuOpen
    } = useMessaging();

    const messagesContainerRef = useRef(null);
    // Disparadores del menú de cada mensaje, para el Popover portado (ver T4:
    // R2 — el menú ya no depende del hover del padre para mantenerse visible).
    const getMenuTriggerRef = useRefMap();

    // Scroll al final al abrir un chat o cuando llega un mensaje nuevo a ESTE
    // chat (antes saltaba con cualquier cambio en cualquier conversación).
    const messageCount = selected ? (messagesByChat[selected.Number]?.length || 0) : 0;
    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container) return;
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
    }, [selected?.Number, messageCount]);

    // Agrupación de mensajes por fecha
    const groupedMessages = useMemo(() => {
        if (!selected) return [];
        const messages = messagesByChat[selected.Number] || [];
        const groups = [];
        let currentGroup = null;

        messages.forEach((m) => {
            const date = new Date(m.Time || m.Timestamp);
            const dayKey = date.toDateString();

            if (!currentGroup || currentGroup.date !== dayKey) {
                currentGroup = { date: dayKey, label: formatDaySeparator(date), messages: [] };
                groups.push(currentGroup);
            }
            currentGroup.messages.push(m);
        });

        return groups;
    }, [messagesByChat, selected]);

    if (!selected) return null;

    /**
     * Detecta si el contenido de m.Message es una URL de media (archivo adjunto).
     * Retorna true si el mensaje no debe mostrarse como texto plano.
     */
    const isMediaUrl = (m) => {
        const text = m.Message || '';
        // Si tiene MediaType y MediaUrl, el texto es redundante si coincide con la URL
        if (m.MediaType && m.MediaUrl) return true;
        // Si tiene MediaType y el mensaje es la URL
        if (m.MediaType && text.startsWith('http')) return true;
        // Detectar URLs de media en el texto del mensaje
        if (text.match(/^https?:\/\/.+\/(media|upload)\/.+\.(jpg|jpeg|png|gif|webp|mp4|webm|ogg|mp3|wav|pdf|doc|docx|xls|xlsx|ppt|pptx|txt)(\?.*)?$/i)) return true;
        // Detectar rutas de media del backend (/media/images/, /media/audio/, etc.)
        if (text.match(/^https?:\/\/.+\/media\/(images|audio|videos|docs)\//i)) return true;
        // Detectar si el texto es exactamente una URL y hay media renderizada
        if (m.MediaType && text.trim() === (m.MediaUrl || '').trim()) return true;
        return false;
    };

    const getStatusIcon = (status) => {
        // Stroke-based ticks: the second check is shifted right so both marks stay distinct
        const strokeProps = {
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.7,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
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
    };

    const renderMedia = (m, isMine) => {
        let mediaType = m.MediaType;
        let mediaUrl = m.MediaUrl;
        const text = m.Message || '';

        if (!mediaType && text.includes('/media/')) {
            mediaUrl = text;
            if (text.includes('/audio/')) mediaType = 'audio';
            else if (text.includes('/images/')) mediaType = 'image';
            else if (text.includes('/videos/')) mediaType = 'video';
            else if (text.includes('/docs/')) mediaType = 'document';
        }

        if (!mediaType || !mediaUrl) return null;
        
        switch (mediaType) {
            case 'image':
                return (
                    <div className="mb-2 rounded-xl overflow-hidden max-w-sm bg-slate-800/50">
                        <img 
                            src={mediaUrl} 
                            alt="Imagen adjunta" 
                            loading="lazy"
                            className="w-full h-auto object-cover max-h-80 cursor-pointer hover:opacity-90 transition-opacity" 
                            onClick={() => window.open(mediaUrl, '_blank')} 
                        />
                    </div>
                );
            case 'video':
                return (
                    <div className="mb-2 rounded-xl overflow-hidden max-w-sm bg-slate-800/50">
                        <video src={mediaUrl} controls className="w-full max-h-80 bg-black/20" />
                    </div>
                );
            case 'audio':
                return (
                    <div className="mb-1 w-full min-w-[240px]">
                        <AudioPlayer src={mediaUrl} isMine={isMine} />
                    </div>
                );
            case 'document':
                return (
                    <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="mb-2 flex items-center gap-3 p-3 bg-black/20 hover:bg-black/30 rounded-xl transition-all border border-white/5 group">
                        <div className="w-11 h-11 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-white truncate">Documento</div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-indigo-300/60">Clic para descargar</div>
                        </div>
                    </a>
                );
            default:
                return null;
        }
    };

    // Wallpaper priority: per-chat > global > default pattern
    const activeWallpaper = (selected && chatWallpapers[selected.Number]) || globalWallpaper || null;

    const containerStyle = activeWallpaper
        ? {
            backgroundImage: `url(${activeWallpaper})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
        }
        : undefined;

    return (
        <div 
            ref={messagesContainerRef}
            className={`flex-1 overflow-y-auto px-3 sm:px-6 lg:px-10 py-4 space-y-4 relative ${activeWallpaper ? '' : 'chat-surface'}`}
            style={containerStyle}
        >
            {/* Overlay oscuro sobre wallpaper para legibilidad */}
            {activeWallpaper && (
                <div className="absolute inset-0 bg-slate-950/40 pointer-events-none" style={{ zIndex: 0 }} />
            )}
            {groupedMessages.map((group) => (
                <div key={group.date} className="space-y-3 relative z-[1]">
                    {/* Separador de fecha */}
                    <div className="flex justify-center sticky top-0 z-10 py-1.5">
                        <span className="px-3 py-1 glass rounded-lg text-[11px] font-medium text-slate-300 shadow-lg first-letter:uppercase">
                            {group.label}
                        </span>
                    </div>

                    <div className="space-y-1.5">
                        {group.messages.map((m) => {
                            const isMine = m.SenderTelephon === profile?.Telephon;
                            const isMenuOpen = messageMenuOpen === m.MessageID;
                            const time = formatTime(m.Time || m.Timestamp);

                            return (
                                <div 
                                    key={m.MessageID} 
                                    className={`group flex ${isMine ? 'justify-end' : 'justify-start'} items-end gap-2 animate-slide-up`}
                                >
                                    <div className={`relative max-w-[85%] sm:max-w-[70%] group/bubble`}>
                                        {/* Disparador del menú: revelado con hover como antes, pero ya NO
                                            envuelve al menú (ver T4: R2 — antes, al dejar de hacer hover, todo
                                            el contenedor (disparador + menú abierto) se volvía invisible por
                                            CSS aunque el estado siguiera "abierto"). También queda visible
                                            si el menú está abierto, o con foco de teclado (accesible/táctil). */}
                                        <div className={`absolute top-0 ${isMine ? '-left-10' : '-right-10'} transition-opacity z-20 ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover/bubble:opacity-100 focus-within:opacity-100'}`}>
                                            <button
                                                ref={(el) => { getMenuTriggerRef(m.MessageID).current = el; }}
                                                onClick={() => setMessageMenuOpen(isMenuOpen ? null : m.MessageID)}
                                                className="p-1.5 glass rounded-full text-slate-400 hover:text-white transition-all shadow-lg"
                                                aria-label="Opciones"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                        </div>

                                        {/* Menú de opciones contextual — portado (Popover): se cierra al
                                            hacer click fuera o con Escape, y ya no depende del hover del
                                            disparador para seguir visible. */}
                                        <Popover
                                            open={isMenuOpen}
                                            onClose={() => setMessageMenuOpen(null)}
                                            anchorRef={getMenuTriggerRef(m.MessageID)}
                                            align={isMine ? 'left' : 'right'}
                                            className="w-48 p-1 bg-slate-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-fade-in"
                                        >
                                            <button onClick={() => { handleReplyToMessage(m); setMessageMenuOpen(null); }} className="w-full px-3 py-2 rounded-lg text-left text-[13px] font-medium text-slate-200 hover:bg-white/[0.06] transition-colors flex items-center gap-2.5">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                                                Responder
                                            </button>
                                            <button onClick={() => { handleForwardMessage(m); setMessageMenuOpen(null); }} className="w-full px-3 py-2 rounded-lg text-left text-[13px] font-medium text-slate-200 hover:bg-white/[0.06] transition-colors flex items-center gap-2.5">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                                                Reenviar
                                            </button>
                                            {isMine && (
                                                <>
                                                    <button onClick={() => { handleEditMessage(m); setMessageMenuOpen(null); }} className="w-full px-3 py-2 rounded-lg text-left text-[13px] font-medium text-slate-200 hover:bg-white/[0.06] transition-colors flex items-center gap-2.5">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 00-2 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                        Editar
                                                    </button>
                                                    <button onClick={() => { handleDeleteMessage(m); setMessageMenuOpen(null); }} className="w-full px-3 py-2 rounded-lg text-left text-[13px] font-medium text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-2.5">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        Eliminar para todos
                                                    </button>
                                                </>
                                            )}
                                            <button onClick={() => { handleDeleteMessageForMe(m); setMessageMenuOpen(null); }} className="w-full px-3 py-2 rounded-lg text-left text-[13px] font-medium text-slate-200 hover:bg-white/[0.06] transition-colors flex items-center gap-2.5">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                Eliminar para mí
                                            </button>
                                        </Popover>

                                        {/* Burbuja de mensaje */}
                                        <div className={`
                                            px-3.5 py-2 rounded-2xl shadow-md
                                            ${isMine
                                                ? 'bg-indigo-700 text-white rounded-br-md'
                                                : 'bg-slate-800 text-slate-100 rounded-bl-md'}
                                        `}>
                                            {/* Respuesta */}
                                            {m.ReplyToMessage && (
                                                <div className={`mb-1.5 px-2.5 py-1.5 rounded-lg border-l-[3px] ${isMine ? 'bg-black/15 border-white/40' : 'bg-black/20 border-indigo-400'} text-[12px] text-white/80 line-clamp-2`}>
                                                    <div className={`font-semibold text-[11px] mb-0.5 ${isMine ? 'text-white/90' : 'text-indigo-300'}`}>Respuesta</div>
                                                    {m.ReplyToMessage}
                                                </div>
                                            )}

                                            {/* Media */}
                                            {renderMedia(m, isMine)}

                                            {/* Texto del mensaje - Ocultar si es una URL de media */}
                                            {m.Message && !isMediaUrl(m) && (
                                                <div className="text-[14.5px] leading-snug break-words whitespace-pre-wrap">
                                                    {editingMessageId === m.MessageID ? (
                                                        <div className="flex flex-col gap-2 min-w-[200px]">
                                                            <textarea 
                                                                autoFocus
                                                                value={editingMessageText}
                                                                onChange={handleEditMessageChange}
                                                                className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/30"
                                                                rows={2}
                                                            />
                                                            <div className="flex justify-end gap-2">
                                                                <button onClick={handleEditMessageCancel} className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest">Cancelar</button>
                                                                <button onClick={handleEditMessageSave} className="px-2 py-1 bg-white/20 rounded-md text-[10px] font-bold uppercase tracking-widest">Guardar</button>
                                                            </div>
                                                        </div>
                                                    ) : m.Message}
                                                </div>
                                            )}

                                            {/* Info de pie de burbuja */}
                                            <div className="mt-0.5 -mb-0.5 flex items-center justify-end gap-1">
                                                <span className={`text-[11px] ${isMine ? 'text-white/60' : 'text-slate-400'}`}>
                                                    {m.Edited && 'editado · '}{time}
                                                </span>
                                                {isMine && getStatusIcon(m.Status)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default MessageList;
