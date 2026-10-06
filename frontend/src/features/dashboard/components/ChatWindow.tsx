import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { MessagingProvider, useMessaging } from '../hooks/useMessaging';
import MessageList from './MessageList';
import ChatSearchBar from './ChatSearchBar';
import { useChatSearch } from '../hooks/useChatSearch';
import { searchChat } from '../api/searchApi';
import MessageInput from './MessageInput';
import AddContactModal from './AddContactModal';
import ForwardMessageModal from './ForwardMessageModal';
import api from '../../../api/axios';
import Avatar from '../../../components/ui/Avatar';
import { ChatIcon, PhoneIcon as PhoneEmojiIcon, GroupIcon } from '../../../components/ui/icons';
import { formatLastSeen } from '../../../utils/format';
import { hasUnreadFrom } from '../lib/disappearing';
import { DisappearingChip } from './DisappearingControls';
import MuteMenuItems from './MuteMenu';
import Popover from '../../../components/ui/Popover';
import type { CallType, SearchPage } from '../../../types/api';
import type { SearchPageOptions } from '../api/searchApi';
import type { FocusTarget } from '../context/DashboardContext';

// Inner component: must live inside MessagingProvider to access useMessaging()
const ForwardMessageModalWrapper = () => {
    const { forwardingMessage, setForwardingMessage, executeForward } = useMessaging();
    return (
        // key: el estado interno del modal se reinicia con cada mensaje a reenviar
        <ForwardMessageModal
            key={forwardingMessage?.MessageID ?? 'closed'}
            isOpen={!!forwardingMessage}
            onClose={() => setForwardingMessage(null)}
            message={forwardingMessage}
            onForward={(targetNumbers) => executeForward(targetNumbers)}
        />
    );
};

const PhoneIcon = 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z';
const VideoIcon = 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z';
const SearchGlyph = 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z';
const ArrowDownGlyph = 'M19 9l-7 7-7-7';
const KebabGlyph = 'M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z';
const TrashIcon = 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16';

const Svg = ({ d, className = 'h-5 w-5' }: { d: string; className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
);

/** Pantalla de bienvenida (escritorio) cuando no hay chat abierto */
const WelcomePane = ({ isConnected }: { isConnected: boolean }) => (
    <div className="hidden lg:flex flex-1 flex-col min-h-0 min-w-0 chat-surface relative">
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-fade-in">
            <div className="relative mb-8">
                <div className="absolute inset-0 rounded-[2rem] bg-indigo-500/20 blur-2xl" />
                <div className="relative w-24 h-24 rounded-[2rem] bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-glow">
                    <img src="/todos.svg" alt="" className="w-14 h-14" />
                </div>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-100 mb-3">todos para escritorio</h2>
            <p className="max-w-md text-slate-400 leading-relaxed">
                Envía mensajes, fotos, notas de voz y haz llamadas en tiempo real.
                Elige una conversación de la lista para empezar.
            </p>
            <div className="mt-10 grid grid-cols-3 gap-3 max-w-lg w-full">
                {[
                    { Icon: ChatIcon, label: 'Chats en tiempo real' },
                    { Icon: PhoneEmojiIcon, label: 'Voz y videollamadas' },
                    { Icon: GroupIcon, label: 'Grupos' },
                ].map((f) => (
                    <div key={f.label} className="glass rounded-2xl px-3 py-4 text-sm text-slate-300">
                        <div className="mb-1.5 text-indigo-300 flex justify-center">
                            <f.Icon className="w-6 h-6" />
                        </div>
                        {f.label}
                    </div>
                ))}
            </div>
            <div className="mt-10 inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium">
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-indigo-400' : 'bg-amber-400 animate-pulse'}`} />
                <span className={isConnected ? 'text-slate-300' : 'text-amber-300'}>
                    {isConnected ? 'Conectado' : 'Conectando…'}
                </span>
            </div>
        </div>
    </div>
);

interface ChatWindowProps {
    onShowContactDetails: () => void;
    onStartCall?: (callType?: CallType) => void;
}

const ChatWindow = ({ onShowContactDetails, onStartCall }: ChatWindowProps) => {
    const {
        selected, setSelected, isConnected, avatarMap, onlineUsers, typingUsers,
        lastSeenMap, setMessagesByChat, contacts, addToast,
        messagesByChat, fetchChatMessages, profile, allChatGroups, markAsRead,
        focusedChat, openMessageAt, returnToLatest, selectedDisappearSeconds,
    } = useDashboard();
    const [showAddContactModal, setShowAddContactModal] = useState(false);
    const [optionsOpen, setOptionsOpen] = useState(false);
    const optionsTriggerRef = useRef<HTMLButtonElement>(null);
    const closeOptions = useCallback(() => setOptionsOpen(false), []);

    // Búsqueda dentro del chat (barra bajo la cabecera; salta a cada coincidencia)
    const selectedNumber = selected?.Number;
    const searchTarget = useMemo<FocusTarget | null>(
        () => (selectedNumber ? { kind: 'chat', key: selectedNumber } : null),
        [selectedNumber],
    );
    const searchMessages = useCallback(
        (q: string, opts: SearchPageOptions): Promise<SearchPage> => searchChat(selectedNumber ?? '', q, opts),
        [selectedNumber],
    );
    const chatSearch = useChatSearch({ target: searchTarget, search: searchMessages, openMessageAt });

    // Cargar mensajes al seleccionar un contacto si aún no están en cache.
    // Se lee la caché por ref: el efecto solo debe dispararse al cambiar de chat.
    const messagesByChatRef = useRef(messagesByChat);
    useEffect(() => { messagesByChatRef.current = messagesByChat; }, [messagesByChat]);
    useEffect(() => {
        if (selected?.Number && !messagesByChatRef.current[selected.Number]) {
            fetchChatMessages(selected.Number);
        }
    }, [selected?.Number, fetchChatMessages]);

    // Marcar mensajes como "visto" cuando se abre un chat con mensajes no leídos
    useEffect(() => {
        if (!selected?.Number || !isConnected || !profile?.Telephon) return;
        const msgs = messagesByChat[selected.Number];
        if (!msgs || msgs.length === 0) return;
        if (hasUnreadFrom(msgs, selected.Number)) {
            markAsRead(selected.Number);
        }
    }, [selected?.Number, messagesByChat, isConnected, profile?.Telephon, markAsRead]);

    if (!selected) {
        // En móvil el sidebar ocupa toda la pantalla; en escritorio se muestra la bienvenida.
        return <WelcomePane isConnected={isConnected} />;
    }

    const displayName = selected.ContactName || selected.Username || selected.Number;
    const isOnline = onlineUsers.has(selected.Number);
    const isTyping = typingUsers.has(selected.Number);
    // Es desconocido si no está en la lista de contactos (se actualiza al agregarlo)
    const isUnknown = !contacts.some(c => c.Number === selected.Number);

    const handleClearChat = async () => {
        if (!window.confirm(`¿Seguro que quieres vaciar el chat con ${displayName}?`)) return;
        try {
            await api.delete(`/api/v1/chat/${selected.Number}`);
            setMessagesByChat(prev => ({ ...prev, [selected.Number]: [] }));
            addToast({ type: 'success', message: 'Chat vaciado' });
        } catch {
            addToast({ type: 'error', message: 'No se pudo vaciar el chat' });
        }
    };

    const handleCallClick = (type: CallType) => {
        if (!isConnected) {
            addToast({ type: 'error', message: 'Sin conexión con el servidor' });
            return;
        }
        onStartCall?.(type);
    };

    return (
        <MessagingProvider>
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-slate-950">
            {/* Cabecera */}
            <header className="flex-shrink-0 h-[68px] px-3 sm:px-4 border-b border-fg/[0.06] bg-slate-900/80 backdrop-blur-xl flex items-center gap-2 z-10">
                <button
                    onClick={() => setSelected(null)}
                    className="lg:hidden icon-btn -ml-1"
                    aria-label="Volver a chats"
                >
                    <Svg d="M15 19l-7-7 7-7" className="h-6 w-6" />
                </button>

                <button
                    className="flex items-center gap-3 min-w-0 flex-1 rounded-xl p-1.5 -ml-1 hover:bg-fg/[0.04] transition-colors text-left"
                    onClick={onShowContactDetails}
                    title="Ver información del contacto"
                >
                    <Avatar src={avatarMap[selected.Number]} name={displayName} size="md" online={isOnline} />
                    <div className="min-w-0">
                        <div className="font-semibold text-slate-100 truncate">{displayName}</div>
                        <div className="text-xs truncate">
                            {isTyping ? (
                                <span className="text-indigo-400 font-medium">escribiendo…</span>
                            ) : isOnline ? (
                                <span className="text-indigo-400">en línea</span>
                            ) : (
                                <span className="text-slate-500">{formatLastSeen(lastSeenMap[selected.Number]) || selected.Number}</span>
                            )}
                        </div>
                    </div>
                </button>

                <DisappearingChip seconds={selectedDisappearSeconds} />

                <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button onClick={() => handleCallClick('audio')} disabled={!isConnected} className="icon-btn" title="Llamada de voz" aria-label="Llamada de voz">
                        <Svg d={PhoneIcon} />
                    </button>
                    <button onClick={() => handleCallClick('video')} disabled={!isConnected} className="icon-btn" title="Videollamada" aria-label="Videollamada">
                        <Svg d={VideoIcon} />
                    </button>
                    <button onClick={chatSearch.isOpen ? chatSearch.close : chatSearch.open} className="icon-btn" title="Buscar" aria-label="Buscar en el chat" aria-pressed={chatSearch.isOpen}>
                        <Svg d={SearchGlyph} />
                    </button>
                    <span className="w-px h-6 bg-fg/10 mx-1" />
                    <button onClick={handleClearChat} className="icon-btn hover:!text-rose-400 hover:!bg-rose-500/10" title="Vaciar chat" aria-label="Vaciar chat">
                        <Svg d={TrashIcon} />
                    </button>
                    <button ref={optionsTriggerRef} onClick={() => setOptionsOpen(v => !v)} className="icon-btn"
                            title="Más opciones" aria-label="Más opciones" aria-haspopup="menu" aria-expanded={optionsOpen}>
                        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                            <path d={KebabGlyph} />
                        </svg>
                    </button>
                    <Popover
                        open={optionsOpen}
                        onClose={closeOptions}
                        anchorRef={optionsTriggerRef}
                        align="right"
                        menuNavigation
                        className="bg-slate-800 border border-fg/10 rounded-xl shadow-xl overflow-hidden min-w-[220px]"
                    >
                        <MuteMenuItems key={selected.Number} target={{ kind: 'direct', key: selected.Number }} onDone={closeOptions} />
                    </Popover>
                </div>
            </header>

            {chatSearch.isOpen && <ChatSearchBar search={chatSearch} />}

            {/* Aviso para remitentes que no están en contactos */}
            {isUnknown && (
                <div className="flex-shrink-0 px-4 py-2.5 bg-amber-500/[0.08] border-b border-amber-500/15 flex items-center justify-between gap-3 animate-fade-in">
                    <span className="text-sm text-amber-200/90 truncate">
                        <strong className="font-semibold">{allChatGroups[selected.Number]?.ContactUsername || selected.Number}</strong> no está en tus contactos
                    </span>
                    <button
                        onClick={() => setShowAddContactModal(true)}
                        className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-indigo-500 hover:bg-indigo-400 text-slate-950 transition-colors flex-shrink-0"
                    >
                        Agregar
                    </button>
                </div>
            )}

            <div className="relative flex-1 min-h-0 flex flex-col">
                <MessageList searchQuery={chatSearch.activeQuery} />
                {focusedChat[selected.Number] && (
                    <button
                        onClick={() => returnToLatest({ kind: 'chat', key: selected.Number })}
                        className="absolute bottom-4 right-4 z-20 flex items-center gap-2 px-4 py-2 rounded-full glass shadow-lg text-sm font-medium text-slate-100 hover:bg-fg/10 transition-colors"
                        aria-label="Ir a los mensajes recientes"
                    >
                        <Svg d={ArrowDownGlyph} className="h-4 w-4" />
                        Ir a los mensajes recientes
                    </button>
                )}
            </div>
            <MessageInput />

            <AddContactModal
                isOpen={showAddContactModal}
                onClose={() => setShowAddContactModal(false)}
                initialNumber={selected?.Number || ''}
                initialName={allChatGroups[selected?.Number]?.ContactUsername || ''}
            />

            <ForwardMessageModalWrapper />
        </div>
        </MessagingProvider>
    );
};

export default ChatWindow;
