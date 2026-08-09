import React, { useEffect, useRef } from 'react';
import MediaRenderer from '../../../../components/ui/MediaRenderer';

const formatTime = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const GroupMessageBubble = React.memo(function GroupMessageBubble({ msg, isMine, onEdit, onDelete, onReply, onDeleteForMe, menuOpen, setMenuOpen }) {
    const menuRef = useRef(null);
    const isMenuOpen = menuOpen === msg.MessageID;

    useEffect(() => {
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(null);
        };
        if (isMenuOpen) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isMenuOpen, setMenuOpen]);

    return (
        <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} group px-2 py-0.5`}>
            <div className={`relative max-w-[75%] min-w-[80px] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                {/* Reply preview */}
                {msg.ReplyToMessage && (
                    <div className={`text-xs px-2 py-1 rounded-lg mb-1 border-l-2 ${isMine ? 'bg-indigo-800/40 border-indigo-400 self-end' : 'bg-slate-700/60 border-slate-500 self-start'}`}>
                        <span className="font-medium text-slate-300 truncate block max-w-[200px]">
                            {msg.ReplyToSender}
                        </span>
                        <span className="text-slate-400 truncate block max-w-[200px]">{msg.ReplyToMessage}</span>
                    </div>
                )}

                {/* Bubble */}
                <div className={`relative px-3 py-2 rounded-2xl shadow-sm text-sm leading-relaxed break-words
                    ${isMine
                        ? 'bg-indigo-600 text-white rounded-tr-sm'
                        : 'bg-slate-800 text-slate-100 rounded-tl-sm'}`
                }>
                    {/* Sender name for non-mine messages */}
                    {!isMine && (
                        <div className="text-xs font-semibold text-indigo-400 mb-0.5 truncate">
                            {msg.SenderUsername || msg.SenderTelephon}
                        </div>
                    )}

                    <MediaRenderer type={msg.MediaType} url={msg.MediaUrl} text={msg.Message} isMine={isMine} className="rounded-xl" />

                    {/* Text (always show unless it's a pure media URL) */}
                    {msg.Message && !(msg.MediaType && (msg.Message === msg.MediaUrl || msg.Message.startsWith('http'))) && (
                        <span>{msg.Message}</span>
                    )}

                    {/* Footer: time + edited */}
                    <div className={`text-[10px] mt-1 flex items-center gap-1 ${isMine ? 'text-indigo-200/70 justify-end' : 'text-slate-500'}`}>
                        {msg.Edited && <span>editado</span>}
                        <span>{formatTime(msg.Time)}</span>
                    </div>

                    {/* Context menu button (hover) */}
                    <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(isMenuOpen ? null : msg.MessageID); }}
                        className={`absolute top-1 ${isMine ? 'left-0 -translate-x-full' : 'right-0 translate-x-full'}
                            px-1 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-white`}
                        aria-label="Opciones"
                    >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                    </button>
                </div>

                {/* Context menu */}
                {isMenuOpen && (
                    <div
                        ref={menuRef}
                        className={`absolute z-50 mt-1 ${isMine ? 'right-0' : 'left-0'} top-full bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden min-w-[150px]`}
                    >
                        <button onClick={() => { onReply(msg); setMenuOpen(null); }}
                                className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                            Responder
                        </button>

                        {isMine && (
                            <>
                                <button onClick={() => { onEdit(msg); setMenuOpen(null); }}
                                        className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10 flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    Editar
                                </button>
                                <button onClick={() => { onDelete(msg); setMenuOpen(null); }}
                                        className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Eliminar para todos
                                </button>
                            </>
                        )}

                        <button onClick={() => { onDeleteForMe(msg); }}
                                className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:bg-white/5 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                            Eliminar para mí
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
});

export default GroupMessageBubble;
