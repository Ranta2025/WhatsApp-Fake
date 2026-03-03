import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { GroupMessagingProvider, useGroupMessaging } from '../hooks/useGroupMessaging';
import api from '../../../api/axios';
import AddContactModal from './AddContactModal';

// ── Small helpers ─────────────────────────────────────────────────────────────

const formatTime = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// ── GroupMessageBubble ────────────────────────────────────────────────────────

const GroupMessageBubble = ({ msg, isMine, onEdit, onDelete, onReply, onDeleteForMe, menuOpen, setMenuOpen }) => {
    const menuRef = useRef(null);

    // Close context menu when clicking outside
    useEffect(() => {
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(null);
        };
        if (menuOpen) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen, setMenuOpen]);

    const renderMedia = () => {
        if (!msg.MediaType) return null;
        const url = msg.MediaUrl || msg.Message;
        if (msg.MediaType === 'image') {
            return (
                <img
                    src={url}
                    alt="imagen"
                    className="max-w-[260px] rounded-xl mt-1 cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => window.open(url, '_blank')}
                />
            );
        }
        if (msg.MediaType === 'audio') {
            return <audio controls src={url} className="mt-1 w-full max-w-[260px]" />;
        }
        if (msg.MediaType === 'video') {
            return (
                <video controls src={url} className="mt-1 max-w-[260px] rounded-xl" />
            );
        }
        // document or other
        return (
            <a href={url} target="_blank" rel="noopener noreferrer"
               className="mt-1 flex items-center gap-2 text-indigo-400 hover:underline text-sm">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                Documento adjunto
            </a>
        );
    };

    const isMenuOpen = menuOpen === msg.MessageID;

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

                    {renderMedia()}

                    {/* Text (always show unless it's a pure media URL) */}
                    {msg.Message && !(msg.MediaType && msg.Message === msg.MediaUrl) && (
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
                        {/* Reply — always available */}
                        <button onClick={() => { onReply(msg); setMenuOpen(null); }}
                                className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                            Responder
                        </button>

                        {/* Edit — only my messages */}
                        {isMine && (
                            <button onClick={() => { onEdit(msg); setMenuOpen(null); }}
                                    className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Editar
                            </button>
                        )}

                        {/* Delete for everyone — only my messages */}
                        {isMine && (
                            <button onClick={() => { onDelete(msg); setMenuOpen(null); }}
                                    className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Eliminar para todos
                            </button>
                        )}

                        {/* Delete for me — always available */}
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
};

// ── GroupMessageInput ─────────────────────────────────────────────────────────

const GroupMessageInput = () => {
    const [text, setText] = useState('');
    const inputRef = useRef(null);
    const {
        handleSend, handleTyping,
        editingMessageId, editingMessageText, handleEditMessageChange,
        handleEditMessageSave, handleEditMessageCancel,
        replyingTo, cancelReply,
    } = useGroupMessaging();

    const { isConnected, selectedGroup } = useDashboard();

    // If the user has left the group, show a read-only banner
    if (selectedGroup?.UserRole === 'left') {
        return (
            <div className="flex-shrink-0 border-t border-white/5 bg-slate-900/95 backdrop-blur-md px-4 py-4 flex items-center justify-center gap-2 text-slate-500 text-sm italic">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Ya no eres miembro de este grupo
            </div>
        );
    }

    const onSend = () => {
        if (!text.trim()) return;
        handleSend(text.trim());
        setText('');
    };

    const onKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (editingMessageId) {
                handleEditMessageSave();
            } else {
                onSend();
            }
        }
        if (e.key === 'Escape') {
            if (editingMessageId) handleEditMessageCancel();
            if (replyingTo) cancelReply();
        }
    };

    // Switch between edit mode and regular mode
    const inputValue   = editingMessageId ? editingMessageText : text;
    const inputOnChange = editingMessageId
        ? handleEditMessageChange
        : (e) => { setText(e.target.value); handleTyping(); };

    return (
        <div className="flex-shrink-0 border-t border-white/5 bg-slate-900/95 backdrop-blur-md">
            {/* Reply banner */}
            {replyingTo && !editingMessageId && (
                <div className="flex items-center gap-2 px-4 py-2 bg-indigo-900/30 border-b border-indigo-500/20">
                    <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-indigo-400">
                            Respondiendo a {replyingTo.SenderUsername || replyingTo.SenderTelephon}
                        </div>
                        <div className="text-xs text-slate-400 truncate">{replyingTo.Message}</div>
                    </div>
                    <button onClick={cancelReply} className="text-slate-500 hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Edit banner */}
            {editingMessageId && (
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-900/20 border-b border-amber-500/20">
                    <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span className="text-xs text-amber-300 flex-1">Editando mensaje</span>
                    <button onClick={handleEditMessageCancel} className="text-slate-500 hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-2 px-3 py-3">
                <textarea
                    ref={inputRef}
                    rows={1}
                    value={inputValue}
                    onChange={inputOnChange}
                    onKeyDown={onKeyDown}
                    disabled={!isConnected}
                    placeholder={isConnected ? 'Escribe un mensaje en el grupo...' : 'Sin conexión...'}
                    className="flex-1 resize-none bg-slate-800 border border-white/10 rounded-2xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm leading-relaxed disabled:opacity-50 max-h-36 overflow-auto transition-all"
                    style={{ height: 'auto', minHeight: '42px' }}
                    onInput={e => {
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 144) + 'px';
                    }}
                />
                <button
                    onClick={editingMessageId ? handleEditMessageSave : onSend}
                    disabled={!isConnected || !(editingMessageId ? editingMessageText.trim() : text.trim())}
                    className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full transition-all flex-shrink-0 shadow-lg"
                    aria-label="Enviar"
                >
                    {editingMessageId ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                        </svg>
                    )}
                </button>
            </div>
        </div>
    );
};

// ── GroupMessageList ──────────────────────────────────────────────────────────

const GroupMessageList = ({ messages, myTelephon, activeWallpaper }) => {
    const bottomRef = useRef(null);
    const {
        handleEditMessage, handleDeleteMessage, handleDeleteMessageForMe,
        handleReplyToMessage, messageMenuOpen, setMessageMenuOpen,
    } = useGroupMessaging();

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages?.length]);

    const containerStyle = activeWallpaper
        ? { backgroundImage: `url(${activeWallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
        : { backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23334155' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` };

    if (!messages || messages.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm" style={containerStyle}>
                No hay mensajes aún. ¡Sé el primero en escribir!
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto py-3 space-y-0.5" style={containerStyle}>
            {messages.map((msg) => {
                if (msg.IsSystem) {
                    return (
                        <div key={msg.MessageID} className="flex justify-center py-1 px-4">
                            <span className="bg-black/40 backdrop-blur-sm text-slate-300 text-xs px-3 py-1 rounded-full">
                                {msg.Message}
                            </span>
                        </div>
                    );
                }
                return (
                    <GroupMessageBubble
                        key={msg.MessageID}
                        msg={msg}
                        isMine={msg.SenderTelephon === myTelephon}
                        onEdit={handleEditMessage}
                        onDelete={handleDeleteMessage}
                        onReply={handleReplyToMessage}
                        onDeleteForMe={handleDeleteMessageForMe}
                        menuOpen={messageMenuOpen}
                        setMenuOpen={setMessageMenuOpen}
                    />
                );
            })}
            <div ref={bottomRef} />
        </div>
    );
};

// ── AddMembersModal ────────────────────────────────────────────────────────────

const AddMembersModal = ({ isOpen, onClose, group }) => {
    const { contacts, addToast, fetchUserGroups } = useDashboard();
    const [selected, setSelected] = useState(new Set());
    const [search, setSearch]     = useState('');
    const [loading, setLoading]   = useState(false);

    const existingMembers = new Set((group?.Members || []).map(m => m.Telephon));
    const candidates = contacts.filter(c =>
        c.Status === 'accepted' &&
        !existingMembers.has(c.Number) &&
        ((c.ContactName||'').toLowerCase().includes(search.toLowerCase()) ||
         (c.Username||'').toLowerCase().includes(search.toLowerCase()) ||
         c.Number.includes(search))
    );

    const toggle = (num) => setSelected(prev => {
        const next = new Set(prev);
        next.has(num) ? next.delete(num) : next.add(num);
        return next;
    });

    const submit = async () => {
        if (!selected.size) return;
        setLoading(true);
        try {
            const { addGroupMembers } = await import('../../../api/groupApi');
            await addGroupMembers(group.ID, Array.from(selected));
            addToast({ type: 'success', message: 'Miembros añadidos' });
            await fetchUserGroups();
            onClose();
        } catch (err) {
            addToast({ type: 'error', message: err?.response?.data?.error || 'Error al añadir miembros' });
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={onClose}>
            <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden max-h-[80vh] flex flex-col"
                 onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-white/5">
                    <h3 className="font-semibold text-white">Añadir miembros</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="p-4 border-b border-white/5">
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                           placeholder="Buscar contacto..."
                           className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm" />
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-1">
                    {candidates.map(c => (
                        <button key={c.Number} type="button" onClick={() => toggle(c.Number)}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-left ${selected.has(c.Number) ? 'bg-indigo-600/20' : 'hover:bg-white/5'}`}>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected.has(c.Number) ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600'}`}>
                                {selected.has(c.Number) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <div className="w-9 h-9 bg-slate-700 rounded-full flex items-center justify-center text-sm font-semibold text-white overflow-hidden flex-shrink-0">
                                {(c.ContactName || c.Username)?.charAt(0)?.toUpperCase()}
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <div className="font-medium text-slate-100 truncate text-sm">{c.ContactName || c.Username}</div>
                                <div className="text-xs text-slate-500 truncate">{c.Number}</div>
                            </div>
                        </button>
                    ))}
                    {candidates.length === 0 && <p className="text-center text-slate-500 py-6 text-sm">No hay contactos disponibles</p>}
                </div>
                <div className="p-4 border-t border-white/5 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors">Cancelar</button>
                    <button onClick={submit} disabled={loading || !selected.size}
                            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
                        {loading ? 'Añadiendo...' : `Añadir (${selected.size})`}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── GroupChatWindow (inner — needs GroupMessagingProvider) ────────────────────

const GroupChatWindowInner = () => {
    const {
        selectedGroup, setSelectedGroup,
        groupMessages, setGroupMessages, fetchGroupMessages, fetchGroupDetail,
        typingUsers, profile,
        isConnected,
        contacts,
        setSelected,
        avatarMap, myAvatar,
        setGroups, addToast,
        globalWallpaper,
    } = useDashboard();

    const [showAddMembers, setShowAddMembers]     = useState(false);
    const [showMembers, setShowMembers]           = useState(false);
    const [showOptions, setShowOptions]           = useState(false);
    const [confirmClear, setConfirmClear]         = useState(false);
    const [confirmLeave, setConfirmLeave]         = useState(false);
    const [confirmDelete, setConfirmDelete]       = useState(false);
    const [loadingLeave, setLoadingLeave]         = useState(false);
    const [uploadingAvatar, setUploadingAvatar]   = useState(false);
    const [uploadingWallpaper, setUploadingWallpaper] = useState(false);
    const [showAvatarMenu, setShowAvatarMenu]     = useState(false);
    const [viewAvatarOpen, setViewAvatarOpen]     = useState(false);
    const [memberMenuOpen, setMemberMenuOpen]     = useState(null);
    const [addContactOpen, setAddContactOpen]     = useState(false);
    const [addContactTarget, setAddContactTarget] = useState({ number: '', username: '' });
    const optionsRef                               = useRef(null);
    const memberMenuRef                            = useRef(null);
    const avatarInputRef                           = useRef(null);
    const avatarMenuRef                            = useRef(null);

    // Close avatar menu on outside click
    useEffect(() => {
        if (!showAvatarMenu) return;
        const handler = (e) => {
            if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target)) setShowAvatarMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showAvatarMenu]);

    // Per-group wallpapers from localStorage
    const [groupWallpapers, setGroupWallpapers] = useState(() => {
        try { return JSON.parse(localStorage.getItem('group_wallpapers') || '{}'); } catch { return {}; }
    });
    useEffect(() => {
        const onCustom = (e) => setGroupWallpapers(e.detail || {});
        window.addEventListener('group-wallpaper-changed', onCustom);
        return () => window.removeEventListener('group-wallpaper-changed', onCustom);
    }, []);

    const activeWallpaper = (selectedGroup && groupWallpapers[selectedGroup.ID]) || globalWallpaper || null;

    const handleGroupWallpaperUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !selectedGroup?.ID) return;
        setUploadingWallpaper(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const { data } = await api.post('/api/v1/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const newWps = { ...groupWallpapers, [selectedGroup.ID]: data.url };
            setGroupWallpapers(newWps);
            localStorage.setItem('group_wallpapers', JSON.stringify(newWps));
            window.dispatchEvent(new CustomEvent('group-wallpaper-changed', { detail: newWps }));
            addToast({ type: 'success', message: 'Fondo del grupo actualizado' });
        } catch (err) {
            addToast({ type: 'error', message: err?.response?.data?.error || 'Error al subir el fondo' });
        } finally {
            setUploadingWallpaper(false);
            e.target.value = '';
        }
    };

    const handleRemoveGroupWallpaper = () => {
        if (!selectedGroup?.ID) return;
        const newWps = { ...groupWallpapers };
        delete newWps[selectedGroup.ID];
        setGroupWallpapers(newWps);
        localStorage.setItem('group_wallpapers', JSON.stringify(newWps));
        window.dispatchEvent(new CustomEvent('group-wallpaper-changed', { detail: newWps }));
    };

    // Close member popup when clicking outside
    useEffect(() => {
        if (!memberMenuOpen) return;
        const handler = (e) => {
            if (memberMenuRef.current && !memberMenuRef.current.contains(e.target)) setMemberMenuOpen(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [memberMenuOpen]);

    // Close options dropdown when clicking outside
    useEffect(() => {
        const handler = (e) => {
            if (optionsRef.current && !optionsRef.current.contains(e.target)) setShowOptions(false);
        };
        if (showOptions) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showOptions]);

    const handleClearChat = () => {
        setGroupMessages(prev => ({ ...prev, [selectedGroup.ID]: [] }));
        setConfirmClear(false);
        setShowOptions(false);
    };

    const handleLeaveGroup = async () => {
        setLoadingLeave(true);
        try {
            const { leaveGroup } = await import('../../../api/groupApi');
            await leaveGroup(selectedGroup.ID);
            // Mark as left: keep visible but read-only
            const gid = selectedGroup.ID;
            setGroups(prev => prev.map(g => g.ID === gid ? { ...g, UserRole: 'left' } : g));
            setSelectedGroup(prev => prev ? { ...prev, UserRole: 'left' } : prev);
            addToast({ type: 'success', message: 'Has salido del grupo' });
        } catch (err) {
            addToast({ type: 'error', message: err?.response?.data?.error || 'Error al salir del grupo' });
        } finally {
            setLoadingLeave(false);
            setConfirmLeave(false);
        }
    };

    const handleDeleteGroup = async () => {
        setLoadingLeave(true);
        const gid = selectedGroup.ID;
        // Remove from local state immediately — UI closes right away
        setGroups(prev => prev.filter(g => g.ID !== gid));
        setGroupMessages(prev => { const n = { ...prev }; delete n[gid]; return n; });
        setSelectedGroup(null);
        setConfirmDelete(false);
        setLoadingLeave(false);
        // Fire API best-effort (user may have already left; either way they're gone from list)
        try {
            const { leaveGroup } = await import('../../../api/groupApi');
            await leaveGroup(gid);
        } catch (_) {
            // Ignore — local state already cleaned up
        }
        addToast({ type: 'success', message: 'Grupo eliminado de tu lista' });
    };

    const handleGroupAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !selectedGroup?.ID) return;
        setUploadingAvatar(true);
        try {
            // 1. Upload image to MinIO
            const formData = new FormData();
            formData.append('file', file);
            const uploadRes = await api.post('/api/v1/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const avatarUrl = uploadRes.data?.url;
            if (!avatarUrl) throw new Error('No se obtuvo URL del archivo');

            // 2. Update group avatar in DB + broadcast WS to all members
            const { updateGroupAvatar } = await import('../../../api/groupApi');
            await updateGroupAvatar(selectedGroup.ID, avatarUrl);

            // 3. Update local state immediately (the requester won't get the WS event)
            const gid = selectedGroup.ID;
            setGroups(prev => prev.map(g => g.ID === gid ? { ...g, AvatarUrl: avatarUrl } : g));
            setSelectedGroup(prev => prev ? { ...prev, AvatarUrl: avatarUrl } : prev);
            addToast({ type: 'success', message: 'Foto del grupo actualizada' });
        } catch (err) {
            addToast({ type: 'error', message: err?.response?.data?.error || 'Error al actualizar la foto' });
        } finally {
            setUploadingAvatar(false);
            e.target.value = '';
        }
    };

    const myTelephon = profile?.Telephon;
    const messages   = groupMessages[selectedGroup?.ID] || [];

    // Derive the current user's role from the loaded members list
    const myRole = useMemo(() => {
        if (!selectedGroup?.Members || !myTelephon) return selectedGroup?.UserRole || 'member';
        return selectedGroup.Members.find(m => m.Telephon === myTelephon)?.Role || 'member';
    }, [selectedGroup, myTelephon]);

    // Group-specific typing keys: "group:<groupID>:<telephon>"
    const typingInGroup = selectedGroup
        ? Array.from(typingUsers).filter(k => k.startsWith(`group:${selectedGroup.ID}:`))
        : [];

    // Load full detail (members + messages) if not yet loaded or if Members are missing
    useEffect(() => {
        if (!selectedGroup?.ID) return;
        if (!selectedGroup.Members) {
            // selectedGroup is a lightweight GroupResponse — load the full GroupDetail
            fetchGroupDetail(selectedGroup.ID);
        } else if (!groupMessages[selectedGroup.ID]) {
            // Detail already loaded but no cached messages yet
            fetchGroupMessages(selectedGroup.ID);
        }
    }, [selectedGroup?.ID, selectedGroup?.Members, fetchGroupDetail, fetchGroupMessages]);

    if (!selectedGroup) return null;

    return (
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-slate-950 relative">
            {/* ── Header ── */}
            <div className="flex-shrink-0 px-4 py-3 border-b border-white/5 bg-slate-900/95 backdrop-blur-md flex items-center gap-3 z-10 shadow-sm">
                {/* Back (mobile) */}
                <button onClick={() => setSelectedGroup(null)}
                        className="lg:hidden p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400"
                        aria-label="Volver">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>

                {/* Avatar */}
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-full flex items-center justify-center font-bold text-white text-lg flex-shrink-0 shadow overflow-hidden">
                    {selectedGroup.AvatarUrl
                        ? <img src={selectedGroup.AvatarUrl} alt="grupo" className="w-full h-full object-cover" />
                        : selectedGroup.Name?.charAt(0)?.toUpperCase()
                    }
                </div>

                {/* Info — click opens side panel */}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setShowMembers(!showMembers)}>
                    <div className="font-semibold text-slate-100 truncate">{selectedGroup.Name}</div>
                    <div className="text-xs text-slate-400 truncate">
                        {typingInGroup.length > 0 ? (
                            <span className="text-indigo-400 italic animate-pulse">alguien está escribiendo...</span>
                        ) : (
                            `${selectedGroup.MemberCount ?? '?'} miembros`
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                    {/* More options kebab */}
                    <div className="relative" ref={optionsRef}>
                        <button onClick={() => setShowOptions(v => !v)}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
                                title="Más opciones">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                        </button>
                        {showOptions && (
                            <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden min-w-[185px] z-50">
                                {selectedGroup?.UserRole !== 'left' && (
                                    <button onClick={() => { setConfirmLeave(true); setShowOptions(false); }}
                                            className="w-full text-left px-4 py-2.5 text-sm text-amber-400 hover:bg-amber-500/10 flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                        </svg>
                                        Salir del grupo
                                    </button>
                                )}
                                <button onClick={() => { setConfirmDelete(true); setShowOptions(false); }}
                                        className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                                    </svg>
                                    Eliminar de mi lista
                                </button>
                                <div className="border-t border-white/5" />
                                <button onClick={() => { setConfirmClear(true); setShowOptions(false); }}
                                        className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:bg-white/5 flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Vaciar chat
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Group info side panel (WhatsApp-style) ── */}
            {showMembers && (
                <>
                    {/* Backdrop */}
                    <div className="absolute inset-0 z-[100] bg-black/40"
                         onClick={() => setShowMembers(false)} />

                    {/* Panel */}
                    <div className="absolute top-0 right-0 h-full w-full sm:w-96 z-[101] bg-slate-900 flex flex-col shadow-2xl"
                         style={{ animation: 'slideInRight 0.22s ease' }}>

                        {/* Panel header */}
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-slate-900 flex-shrink-0">
                            <button onClick={() => setShowMembers(false)}
                                    className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                            <span className="font-semibold text-white text-sm">Info del grupo</span>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {/* Group avatar + name */}
                            <div className="flex flex-col items-center py-7 px-4 bg-slate-900">
                                {/* Clickable avatar — tap to open menu */}
                                <div className="relative group/avatar mb-4" ref={avatarMenuRef}>
                                    <button
                                        onClick={() => setShowAvatarMenu(v => !v)}
                                        className="relative w-24 h-24 rounded-full overflow-hidden shadow-xl focus:outline-none"
                                        disabled={uploadingAvatar}>
                                        <div className="w-full h-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-4xl font-bold text-white">
                                            {selectedGroup.AvatarUrl
                                                ? <img src={selectedGroup.AvatarUrl} alt="grupo" className="w-full h-full object-cover" />
                                                : selectedGroup.Name?.charAt(0)?.toUpperCase()
                                            }
                                        </div>
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                                            {uploadingAvatar
                                                ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                : <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                                  </svg>
                                            }
                                        </div>
                                    </button>

                                    {/* Avatar action menu */}
                                    {showAvatarMenu && (
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-44 bg-slate-800 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
                                            {selectedGroup.AvatarUrl && (
                                                <button
                                                    onClick={() => { setViewAvatarOpen(true); setShowAvatarMenu(false); }}
                                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors">
                                                    <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                    Ver foto
                                                </button>
                                            )}
                                            {selectedGroup?.UserRole !== 'left' && (
                                                <label className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer">
                                                    <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    </svg>
                                                    {uploadingAvatar ? 'Subiendo...' : 'Cambiar foto'}
                                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { setShowAvatarMenu(false); handleGroupAvatarChange(e); }} disabled={uploadingAvatar} />
                                                </label>
                                            )}
                                        </div>
                                    )}

                                    {/* Hidden file input (kept for ref compatibility) */}
                                    <input
                                        ref={avatarInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleGroupAvatarChange}
                                    />
                                </div>
                                <h2 className="text-xl font-bold text-white text-center">{selectedGroup.Name}</h2>
                                {selectedGroup.Description && (
                                    <p className="text-sm text-slate-400 text-center mt-1 max-w-xs">{selectedGroup.Description}</p>
                                )}
                                <p className="text-xs text-slate-500 mt-2">
                                    Grupo · {selectedGroup.MemberCount ?? (selectedGroup.Members?.length ?? '?')} participantes
                                </p>
                                {selectedGroup.CreatedAt && (
                                    <p className="text-xs text-slate-600 mt-0.5">
                                        Creado el {new Date(selectedGroup.CreatedAt).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })}
                                    </p>
                                )}
                            </div>

                            <div className="h-2 bg-slate-950/60" />

                            {/* Wallpaper section */}
                            <div className="px-5 py-4">
                                <div className="text-xs text-indigo-300/70 mb-3 uppercase tracking-wider font-semibold">Fondo de este chat</div>
                                {groupWallpapers[selectedGroup.ID] ? (
                                    <div className="relative rounded-xl overflow-hidden h-28 mb-1">
                                        <img src={groupWallpapers[selectedGroup.ID]} alt="fondo" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2 gap-2">
                                            <label className="cursor-pointer flex items-center gap-1 text-xs text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm px-2 py-1 rounded-lg transition-colors">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                {uploadingWallpaper ? 'Subiendo...' : 'Cambiar'}
                                                <input type="file" accept="image/*" className="hidden" onChange={handleGroupWallpaperUpload} disabled={uploadingWallpaper} />
                                            </label>
                                            <button type="button" onClick={handleRemoveGroupWallpaper}
                                                    className="flex items-center gap-1 text-xs text-red-300 bg-red-500/20 hover:bg-red-500/30 backdrop-blur-sm px-2 py-1 rounded-lg transition-colors">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                                Quitar
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <label className={`flex flex-col items-center justify-center h-20 rounded-xl border-2 border-dashed border-white/20 hover:border-indigo-400/60 bg-white/5 hover:bg-white/10 transition-all cursor-pointer gap-2 ${uploadingWallpaper ? 'opacity-50 pointer-events-none' : ''}`}>
                                        {uploadingWallpaper
                                            ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            : <>
                                                <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                <span className="text-xs text-indigo-300">Poner fondo a este grupo</span>
                                              </>
                                        }
                                        <input type="file" accept="image/*" className="hidden" onChange={handleGroupWallpaperUpload} disabled={uploadingWallpaper} />
                                    </label>
                                )}
                                {!groupWallpapers[selectedGroup.ID] && globalWallpaper && (
                                    <p className="text-xs text-indigo-300/50 mt-2 text-center">Usando fondo global</p>
                                )}
                            </div>

                            {/* Members list */}
                            <div className="px-0 py-2">
                                <div className="px-4 py-2 flex items-center justify-between">
                                    <span className="text-sm font-semibold text-slate-300">
                                        {selectedGroup.Members?.length ?? selectedGroup.MemberCount ?? '?'} participantes
                                    </span>
                                    <button onClick={() => { setShowMembers(false); setShowAddMembers(true); }}
                                            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                        </svg>
                                        Añadir
                                    </button>
                                </div>

                                {selectedGroup.Members ? (
                                    selectedGroup.Members.map((m) => {
                                        const isSelf     = m.Telephon === myTelephon;
                                        const isOpen     = memberMenuOpen === m.Telephon;
                                        const isContact  = contacts.some(c => c.Number === m.Telephon && c.Status === 'accepted');
                                        const displayName = isSelf ? 'Tú' : (m.ContactName || ('~' + m.Username));
                                        return (
                                            <div key={m.Telephon} className="relative" ref={isOpen ? memberMenuRef : null}>
                                                <div
                                                    onClick={() => !isSelf && setMemberMenuOpen(isOpen ? null : m.Telephon)}
                                                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${!isSelf ? 'hover:bg-white/5 cursor-pointer' : ''}`}>
                                                    {/* Avatar */}
                                                    <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-slate-600 to-slate-500 flex items-center justify-center text-base font-bold text-white flex-shrink-0 overflow-hidden">
                                                        {(isSelf ? myAvatar : avatarMap[m.Telephon]) ? (
                                                            <img src={isSelf ? myAvatar : avatarMap[m.Telephon]} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            (m.Username || m.Telephon)?.charAt(0)?.toUpperCase()
                                                        )}
                                                    </div>
                                                    {/* Info */}
                                                    <div className="flex-1 min-w-0 border-b border-white/5 pb-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`font-medium truncate text-sm ${isSelf ? 'text-indigo-300' : 'text-slate-100'}`}>
                                                                {displayName}
                                                            </span>
                                                            {m.Role === 'admin' && (
                                                                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">admin</span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-slate-500 truncate mt-0.5">{m.Telephon}</div>
                                                    </div>
                                                </div>
                                                {isOpen && (
                                                    <div className="absolute left-4 top-full mt-0.5 bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden min-w-[190px] z-[200]">
                                                        <button
                                                            onClick={() => { setSelected({ Number: m.Telephon, Username: m.Username, ContactName: m.ContactName || '', Status: 'unknown' }); setShowMembers(false); setMemberMenuOpen(null); }}
                                                            className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10 flex items-center gap-2">
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                                            </svg>
                                                            Iniciar chat
                                                        </button>
                                                        {!isContact && (
                                                            <button
                                                                onClick={() => { setAddContactTarget({ number: m.Telephon, username: m.Username }); setAddContactOpen(true); setMemberMenuOpen(null); }}
                                                                className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10 flex items-center gap-2">
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                                                </svg>
                                                                Agregar a contactos
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="px-4 py-6 text-center text-slate-500 text-sm">Cargando participantes...</div>
                                )}
                            </div>

                            <div className="h-2 bg-slate-950/60" />

                            {/* Actions section */}
                            <div className="py-2">
                                {selectedGroup?.UserRole !== 'left' && (
                                    <button onClick={() => { setShowMembers(false); setConfirmLeave(true); }}
                                            className="w-full flex items-center gap-4 px-5 py-3.5 text-amber-400 hover:bg-amber-500/10 transition-colors">
                                        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                        </svg>
                                        <span className="text-sm font-medium">Salir del grupo</span>
                                    </button>
                                )}
                                <button onClick={() => { setShowMembers(false); setConfirmDelete(true); }}
                                        className="w-full flex items-center gap-4 px-5 py-3.5 text-red-400 hover:bg-red-500/10 transition-colors">
                                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                                    </svg>
                                    <span className="text-sm font-medium">Eliminar de mi lista</span>
                                </button>
                                <div className="border-t border-white/5 mx-4 my-1" />
                                <button onClick={() => { setShowMembers(false); setConfirmClear(true); }}
                                        className="w-full flex items-center gap-4 px-5 py-3.5 text-slate-400 hover:bg-white/5 transition-colors">
                                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    <span className="text-sm font-medium">Vaciar chat</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* slideInRight animation */}
            <style>{`@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

            {/* ── Message list ── */}
            <GroupMessageList messages={messages} myTelephon={myTelephon} activeWallpaper={activeWallpaper} />

            {/* ── Input ── */}
            <GroupMessageInput />

            {/* ── Add members modal ── */}
            <AddMembersModal
                isOpen={showAddMembers}
                onClose={() => setShowAddMembers(false)}
                group={selectedGroup}
            />

            {/* ── Add contact modal (from member tap) ── */}
            <AddContactModal
                isOpen={addContactOpen}
                onClose={() => setAddContactOpen(false)}
                initialNumber={addContactTarget.number}
                initialName={addContactTarget.username}
            />

            {/* ── Confirm leave group dialog ── */}
            {confirmLeave && (
                <div className="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                     onClick={() => setConfirmLeave(false)}>
                    <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-xs p-6 flex flex-col gap-4"
                         onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                            </div>
                            <div>
                                <p className="font-semibold text-white">¿Salir del grupo?</p>
                                <p className="text-xs text-slate-400 mt-0.5">Dejarás de poder enviar mensajes, pero podrás seguir leyendo el historial.</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmLeave(false)} disabled={loadingLeave}
                                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors disabled:opacity-50">
                                Cancelar
                            </button>
                            <button onClick={handleLeaveGroup} disabled={loadingLeave}
                                    className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
                                {loadingLeave ? 'Saliendo...' : 'Salir'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Confirm delete group dialog ── */}
            {confirmDelete && (
                <div className="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                     onClick={() => setConfirmDelete(false)}>
                    <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-xs p-6 flex flex-col gap-4"
                         onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                                </svg>
                            </div>
                            <div>
                                <p className="font-semibold text-white">¿Eliminar de tu lista?</p>
                                <p className="text-xs text-slate-400 mt-0.5">Saldrás del grupo y desaparecerá de tu lista. Esta acción no se puede deshacer.</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmDelete(false)} disabled={loadingLeave}
                                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors disabled:opacity-50">
                                Cancelar
                            </button>
                            <button onClick={handleDeleteGroup} disabled={loadingLeave}
                                    className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
                                {loadingLeave ? 'Eliminando...' : 'Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Avatar full-screen lightbox ── */}
            {viewAvatarOpen && selectedGroup.AvatarUrl && (
                <div className="fixed inset-0 z-[500] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6"
                     onClick={() => setViewAvatarOpen(false)}>
                    <button onClick={() => setViewAvatarOpen(false)}
                            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    <img
                        src={selectedGroup.AvatarUrl}
                        alt={selectedGroup.Name}
                        className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
                        onClick={e => e.stopPropagation()}
                    />
                    <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/70 text-sm font-medium">{selectedGroup.Name}</p>
                </div>
            )}

            {/* ── Confirm clear chat dialog ── */}
            {confirmClear && (
                <div className="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                     onClick={() => setConfirmClear(false)}>
                    <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-xs p-6 flex flex-col gap-4"
                         onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </div>
                            <div>
                                <p className="font-semibold text-white">¿Vaciar chat?</p>
                                <p className="text-xs text-slate-400 mt-0.5">Solo se borrará en tu dispositivo. Los demás miembros seguirán viendo los mensajes.</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmClear(false)}
                                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors">
                                Cancelar
                            </button>
                            <button onClick={handleClearChat}
                                    className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors">
                                Vaciar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Public export: wrap with providers ───────────────────────────────────────

const GroupChatWindow = () => {
    return (
        <GroupMessagingProvider>
            <GroupChatWindowInner />
        </GroupMessagingProvider>
    );
};

export default GroupChatWindow;
