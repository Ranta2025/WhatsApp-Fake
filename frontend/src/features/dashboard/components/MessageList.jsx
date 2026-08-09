import React, { useEffect, useMemo, useState } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { useMessaging } from '../hooks/useMessaging';
import { useScrollToBottom } from '../../../hooks/useScrollToBottom';
import AudioPlayer from '../../../components/ui/AudioPlayer';

const MessageList = () => {
    const { 
        selected, messagesByChat, profile, avatarMap, globalWallpaper 
    } = useDashboard();

    const [chatWallpapers, setChatWallpapers] = useState({});

    useEffect(() => {
        const saved = localStorage.getItem('chat_wallpapers');
        if (saved) {
            try { setChatWallpapers(JSON.parse(saved)); } catch (e) { /* ignore */ }
        }
        const onStorage = (e) => {
            if (e.key === 'chat_wallpapers') {
                try { setChatWallpapers(e.newValue ? JSON.parse(e.newValue) : {}); } catch (e2) { /* ignore */ }
            }
        };
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
        handleForwardMessage,
        messageMenuOpen, setMessageMenuOpen
    } = useMessaging();

    const currentMessages = selected ? (messagesByChat[selected.Number] || []) : [];

    const {
        containerRef: messagesContainerRef,
        bottomRef,
        showJump: showJumpToBottom,
        onScroll: handleScroll,
        jump,
        scrollToBottom,
        handleNewItems,
    } = useScrollToBottom([selected?.Number]);

    useEffect(() => {
        handleNewItems(currentMessages.length);
    }, [currentMessages.length, handleNewItems]);

    const groupedMessages = useMemo(() => {
        if (!selected) return [];
        const groups = [];
        let currentGroup = null;

        currentMessages.forEach((m) => {
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
    }, [currentMessages, selected]);

    if (!selected) return null;

    const isMediaUrl = (m) => {
        const text = m.Message || '';
        if (m.MediaType && m.MediaUrl) return true;
        if (m.MediaType && text.startsWith('http')) return true;
        if (text.match(/^https?:\/\/.+\/(media|upload)\/.+\.(jpg|jpeg|png|gif|webp|mp4|webm|ogg|mp3|wav|pdf|doc|docx|xls|xlsx|ppt|pptx|txt)(\?.*)?$/i)) return true;
        if (text.match(/^https?:\/\/.+\/media\/(images|audio|videos|docs)\//i)) return true;
        if (m.MediaType && text.trim() === (m.MediaUrl || '').trim()) return true;
        return false;
    };

    const getStatusIcon = (status) => {
        const base = "h-3.5 w-3.5 transition-colors duration-300";
        if (status === 'visto') {
            return (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${base} text-emerald-400`}>
                    <path d="M5 13l4 4L19 7" />
                    <path d="M9 13l4 4L23 7" />
                </svg>
            );
        }
        if (status === 'entregado') {
            return (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${base} text-slate-400`}>
                    <path d="M5 13l4 4L19 7" />
                    <path d="M9 13l4 4L23 7" />
                </svg>
            );
        }
        if (status === 'enviado') {
            return (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${base} text-slate-400`}>
                    <path d="M5 13l4 4L19 7" />
                </svg>
            );
        }
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${base} text-slate-500 opacity-50`}>
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                    <div className={`mb-2 rounded-xl overflow-hidden max-w-sm shadow-sm ${isMine ? '' : 'bg-slate-800/30'}`}>
                        <img 
                            src={mediaUrl} 
                            alt="Imagen" 
                            loading="lazy"
                            className="w-full h-auto object-cover max-h-80 cursor-pointer hover:opacity-90 transition-opacity" 
                            onClick={() => window.open(mediaUrl, '_blank')} 
                        />
                    </div>
                );
            case 'video':
                return (
                    <div className={`mb-2 rounded-xl overflow-hidden max-w-sm shadow-sm ${isMine ? '' : 'bg-slate-800/30'}`}>
                        <video src={mediaUrl} controls className="w-full max-h-80 bg-black/10" />
                    </div>
                );
            case 'audio':
                return (
                    <div className="mb-1 w-full max-w-full min-w-0">
                        <AudioPlayer src={mediaUrl} isMine={isMine} />
                    </div>
                );
            case 'document':
                return (
                    <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className={`mb-2 flex items-center gap-3 p-3 rounded-xl transition-all border border-white/[0.04] group ${isMine ? '' : 'bg-black/10 hover:bg-black/20'}`}>
                        <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white truncate">Documento</div>
                            <div className="text-[10px] uppercase tracking-wider text-indigo-300/50">Clic para descargar</div>
                        </div>
                    </a>
                );
            default:
                return null;
        }
    };

    const activeWallpaper = (selected && chatWallpapers[selected.Number]) || globalWallpaper || null;

    const containerStyle = activeWallpaper
        ? {
            backgroundImage: `url(${activeWallpaper})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
        }
        : {};

    return (
        <div 
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-4 py-6 space-y-8 relative scrollbar-elegant"
            style={containerStyle}
        >
            {activeWallpaper && (
                <div className="absolute inset-0 bg-[#0B1120]/50 pointer-events-none" style={{ zIndex: 0 }} />
            )}
            {groupedMessages.map((group) => (
                <div key={group.date} className="space-y-5 relative z-[1]">
                    <div className="flex justify-center sticky top-0 z-10 py-2">
                        <span className="px-3 py-1 bg-[#0B1120]/90 border border-white/[0.06] rounded-full text-[10px] uppercase tracking-widest text-slate-500 font-medium">
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
                                    className={`group flex ${isMine ? 'justify-end' : 'justify-start'} items-end gap-2`}
                                >
                                    {!isMine && (
                                        <div className="w-7 h-7 rounded-full bg-slate-800 overflow-hidden flex-shrink-0 border border-white/[0.04]">
                                            {avatarMap[m.SenderTelephon] ? (
                                                <img src={avatarMap[m.SenderTelephon]} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-400">
                                                    {m.SenderTelephon.slice(-2)}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className={`relative max-w-[85%] sm:max-w-[65%] group/bubble`}>
                                        <div className={`absolute top-1 ${isMine ? '-left-9' : '-right-9'} opacity-0 group-hover/bubble:opacity-100 transition-opacity z-20`}>
                                            <button 
                                                onClick={() => setMessageMenuOpen(isMenuOpen ? null : m.MessageID)}
                                                className={`p-1.5 rounded-lg transition-all ${isMenuOpen ? 'bg-slate-700 text-sky-400' : 'bg-slate-800/80 text-slate-400 hover:text-white'}`}
                                                aria-label="Opciones"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                            
                                            {isMenuOpen && (
                                                <div className={`absolute ${isMine ? 'left-0' : 'right-0'} mt-1 w-44 rounded-xl bg-[#1a2235] border border-white/[0.06] shadow-2xl overflow-hidden origin-top-left`}>
                                                    <button onClick={() => handleReplyToMessage(m)} className="w-full px-4 py-2.5 text-left text-xs text-slate-300 hover:bg-white/[0.04] transition-colors flex items-center gap-2">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                                                        Responder
                                                    </button>
                                                    <button onClick={() => handleForwardMessage(m)} className="w-full px-4 py-2.5 text-left text-xs text-slate-300 hover:bg-white/[0.04] transition-colors flex items-center gap-2">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                                                        Reenviar
                                                    </button>
                                                    {isMine && (
                                                        <>
                                                            <button onClick={() => handleEditMessage(m)} className="w-full px-4 py-2.5 text-left text-xs text-slate-300 hover:bg-white/[0.04] transition-colors flex items-center gap-2">
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                                Editar
                                                            </button>
                                                            <button onClick={() => handleDeleteMessage(m)} className="w-full px-4 py-2.5 text-left text-xs text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2">
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                                Eliminar para todos
                                                            </button>
                                                        </>
                                                    )}
                                                    <button onClick={() => handleDeleteMessageForMe(m)} className="w-full px-4 py-2.5 text-left text-xs text-slate-300 hover:bg-white/[0.04] transition-colors flex items-center gap-2">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        Eliminar para mi
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className={`px-3.5 py-2.5 rounded-2xl ${isMine 
                                            ? 'rounded-tr-md bg-sky-600 text-white' 
                                            : 'rounded-tl-md bg-[#1a2235] text-slate-200 border border-white/[0.04]'}`}>
                                            {m.ReplyToMessage && (
                                                <div className={`mb-2 p-2 rounded-xl border-l-2 ${isMine ? 'bg-black/10 border-white/20' : 'bg-slate-900/50 border-sky-500/30'} text-[11px] opacity-80 line-clamp-2`}>
                                                    <div className="font-medium text-[10px] mb-0.5 opacity-70">Respondiendo a:</div>
                                                    {m.ReplyToMessage}
                                                </div>
                                            )}

                                            {renderMedia(m, isMine)}

                                            {m.Message && !isMediaUrl(m) && (
                                                <div className="text-[14px] leading-relaxed break-words">
                                                    {editingMessageId === m.MessageID ? (
                                                        <div className="flex min-w-0 flex-col gap-2 sm:min-w-[200px]">
                                                            <textarea 
                                                                autoFocus
                                                                value={editingMessageText}
                                                                onChange={handleEditMessageChange}
                                                                className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/20"
                                                                rows={2}
                                                            />
                                                            <div className="flex justify-end gap-2">
                                                                <button onClick={handleEditMessageCancel} className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider opacity-70 hover:opacity-100">Cancelar</button>
                                                                <button onClick={handleEditMessageSave} className="px-2 py-1 bg-white/20 rounded-md text-[10px] font-medium uppercase tracking-wider hover:bg-white/30">Guardar</button>
                                                            </div>
                                                        </div>
                                                    ) : m.Message}
                                                </div>
                                            )}

                                            <div className={`mt-1.5 flex items-center justify-end gap-1`}>
                                                <span className={`text-[10px] font-medium ${isMine ? 'text-sky-100/60' : 'text-slate-500'}`}>
                                                    {m.Edited && 'Editado · '}{time}
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

            <div ref={bottomRef} className="relative z-[1]" />

            {showJumpToBottom && (
                <button
                    type="button"
                    onClick={jump}
                    className="absolute bottom-4 right-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#1a2235] text-slate-300 shadow-lg border border-white/[0.06] transition-all hover:bg-[#232d42] hover:scale-105"
                    aria-label="Ir al final"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                </button>
            )}
        </div>
    );
};

export default MessageList;
