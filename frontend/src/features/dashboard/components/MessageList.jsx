import React, { useRef, useEffect, useMemo, useState } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { useMessaging } from '../hooks/useMessaging';
import AudioPlayer from '../../../components/AudioPlayer';

/**
 * MessageList Component
 * Renderiza la lista de mensajes de un chat con optimizaciones de UI/UX.
 */
const MessageList = () => {
    const { 
        selected, messagesByChat, profile, avatarMap, globalWallpaper 
    } = useDashboard();

    // Per-chat wallpapers from localStorage (set via ContactDetails)
    const [chatWallpapers, setChatWallpapers] = useState({});

    useEffect(() => {
        const saved = localStorage.getItem('chat_wallpapers');
        if (saved) {
            try { setChatWallpapers(JSON.parse(saved)); } catch (e) { /* ignore */ }
        }
        // Listen for storage changes (cross-tab)
        const onStorage = (e) => {
            if (e.key === 'chat_wallpapers') {
                try { setChatWallpapers(e.newValue ? JSON.parse(e.newValue) : {}); } catch (e2) { /* ignore */ }
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

    // Also refresh when selected contact changes (in case ContactDetails updated in same tab)
    useEffect(() => {
        const saved = localStorage.getItem('chat_wallpapers');
        if (saved) {
            try { setChatWallpapers(JSON.parse(saved)); } catch (e) { /* ignore */ }
        }
    }, [selected?.Number]);
    
    const { 
        editingMessageId, editingMessageText, handleEditMessageChange, 
        handleEditMessageSave, handleEditMessageCancel, handleEditMessage,
        handleDeleteMessage, handleDeleteMessageForMe, handleReplyToMessage,
        messageMenuOpen, setMessageMenuOpen
    } = useMessaging();

    const messagesContainerRef = useRef(null);

    // Scroll automático al final cuando cambian los mensajes
    useEffect(() => {
        if (messagesContainerRef.current && selected) {
            const container = messagesContainerRef.current;
            requestAnimationFrame(() => {
                container.scrollTop = container.scrollHeight;
            });
        }
    }, [messagesByChat, selected]);

    // Agrupación de mensajes por fecha
    const groupedMessages = useMemo(() => {
        if (!selected) return [];
        const messages = messagesByChat[selected.Number] || [];
        const groups = [];
        let currentGroup = null;

        messages.forEach((m) => {
            const date = new Date(m.Time || m.Timestamp || Date.now());
            const dateStr = date.toLocaleDateString(undefined, { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });

            if (!currentGroup || currentGroup.date !== dateStr) {
                currentGroup = { date: dateStr, messages: [] };
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
        const base = "h-3.5 w-3.5 transition-colors duration-300";
        if (status === 'visto') {
            // Doble check verde (leído)
            return (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={base}>
                    <path fill="#34d399" d="M3.5 12.5l4.5 4.5 6.5-6.5 1.5 1.5-8 8-6-6z"></path>
                    <path fill="#34d399" d="M10 13l4.5 4.5 6.5-6.5 1.5 1.5-8 8-6-6z" transform="translate(-4,-4)"></path>
                </svg>
            );
        }
        if (status === 'entregado') {
            // Doble check gris (entregado)
            return (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={base}>
                    <path fill="#94a3b8" d="M3.5 12.5l4.5 4.5 6.5-6.5 1.5 1.5-8 8-6-6z"></path>
                    <path fill="#94a3b8" d="M10 13l4.5 4.5 6.5-6.5 1.5 1.5-8 8-6-6z" transform="translate(-4,-4)"></path>
                </svg>
            );
        }
        if (status === 'enviado') {
            // Un solo check gris (enviado al servidor)
            return (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={base}>
                    <path fill="#64748b" d="M4 12l4 4 10-10 2 2-12 12-6-6z"></path>
                </svg>
            );
        }
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={`${base} opacity-50`}>
                <path fill="#94a3b8" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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
        : {
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23334155' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          };

    return (
        <div 
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto px-4 py-6 space-y-8 relative"
            style={containerStyle}
        >
            {/* Overlay oscuro sobre wallpaper para legibilidad */}
            {activeWallpaper && (
                <div className="absolute inset-0 bg-slate-950/40 pointer-events-none" style={{ zIndex: 0 }} />
            )}
            {groupedMessages.map((group) => (
                <div key={group.date} className="space-y-6 relative z-[1]">
                    {/* Separador de fecha */}
                    <div className="flex justify-center sticky top-0 z-10 py-2">
                        <span className="px-4 py-1 bg-slate-900/80 backdrop-blur-md border border-white/5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 shadow-xl">
                            {group.date}
                        </span>
                    </div>

                    <div className="space-y-3">
                        {group.messages.map((m) => {
                            const isMine = m.SenderTelephon === profile?.Telephon;
                            const isMenuOpen = messageMenuOpen === m.MessageID;
                            const time = new Date(m.Time || m.Timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                            return (
                                <div 
                                    key={m.MessageID} 
                                    className={`group flex ${isMine ? 'justify-end' : 'justify-start'} items-end gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300`}
                                >
                                    {!isMine && (
                                        <div className="w-8 h-8 rounded-full bg-slate-800 overflow-hidden flex-shrink-0 border border-white/5 shadow-lg">
                                            {avatarMap[m.SenderTelephon] ? (
                                                <img src={avatarMap[m.SenderTelephon]} alt="Avatar" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-indigo-400">
                                                    {m.SenderTelephon.slice(-2)}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className={`relative max-w-[85%] sm:max-w-[70%] group/bubble`}>
                                        {/* Menú de opciones contextual */}
                                        <div className={`absolute top-0 ${isMine ? '-left-10' : '-right-10'} opacity-0 group-hover/bubble:opacity-100 transition-opacity z-20`}>
                                            <button 
                                                onClick={() => setMessageMenuOpen(isMenuOpen ? null : m.MessageID)}
                                                className="p-1.5 bg-slate-800/80 backdrop-blur-md border border-white/10 rounded-full text-slate-400 hover:text-white transition-all shadow-xl"
                                                aria-label="Opciones"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                            
                                            {isMenuOpen && (
                                                <div className={`absolute ${isMine ? 'left-0' : 'right-0'} mt-2 w-44 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 origin-top-left`}>
                                                    <button onClick={() => handleReplyToMessage(m)} className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-300 hover:bg-indigo-600 hover:text-white transition-colors flex items-center gap-2">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                                                        Responder
                                                    </button>
                                                    {isMine && (
                                                        <>
                                                            <button onClick={() => handleEditMessage(m)} className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-300 hover:bg-indigo-600 hover:text-white transition-colors flex items-center gap-2">
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 00-2 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                                Editar
                                                            </button>
                                                            <button onClick={() => handleDeleteMessage(m)} className="w-full px-4 py-2.5 text-left text-xs font-bold text-red-400 hover:bg-red-500 hover:text-white transition-colors flex items-center gap-2">
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                                Eliminar para todos
                                                            </button>
                                                        </>
                                                    )}
                                                    <button onClick={() => handleDeleteMessageForMe(m)} className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-300 hover:bg-slate-700 transition-colors flex items-center gap-2">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        Eliminar para mí
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Burbuja de mensaje */}
                                        <div className={`
                                            px-4 py-2.5 rounded-2xl shadow-xl
                                            ${isMine 
                                                ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-tr-none' 
                                                : 'bg-slate-800/80 backdrop-blur-sm text-slate-100 border border-white/5 rounded-tl-none'}
                                        `}>
                                            {/* Respuesta */}
                                            {m.ReplyToMessage && (
                                                <div className={`mb-2 p-2 rounded-lg border-l-4 ${isMine ? 'bg-black/10 border-white/30' : 'bg-slate-900/50 border-indigo-500'} text-[11px] opacity-80 line-clamp-2`}>
                                                    <div className="font-black uppercase tracking-widest text-[9px] mb-0.5">Respondiendo a:</div>
                                                    {m.ReplyToMessage}
                                                </div>
                                            )}

                                            {/* Media */}
                                            {renderMedia(m, isMine)}

                                            {/* Texto del mensaje - Ocultar si es una URL de media */}
                                            {m.Message && !isMediaUrl(m) && (
                                                <div className="text-[14px] leading-relaxed break-words font-medium">
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
                                            <div className={`mt-1.5 flex items-center justify-end gap-1.5`}>
                                                <span className={`text-[10px] font-bold uppercase tracking-widest ${isMine ? 'text-indigo-200/70' : 'text-slate-400'}`}>
                                                    {m.Edited && 'Editado • '}{time}
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
