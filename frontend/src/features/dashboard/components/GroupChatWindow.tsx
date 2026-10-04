import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useDashboard, type SelectedGroup, type GroupMessageEntry, type FocusTarget } from '../context/DashboardContext';
import { GroupMessagingProvider, useGroupMessaging } from '../hooks/useGroupMessaging';
import { useLoadOlderOnScroll, type ScrollTarget } from '../hooks/useLoadOlderOnScroll';
import HighlightedText from './HighlightedText';
import api from '../../../api/axios';
import AddContactModal from './AddContactModal';
import Popover from '../../../components/ui/Popover';
import MuteMenuItems from './MuteMenu';
import MediaContent from '../../../components/MediaContent';
import GroupMessageInput from './GroupMessageInput';
import { useEscapeToClose } from '../../../hooks/useEscapeToClose';
import { useRefMap } from '../../../hooks/useRefMap';
import { getResponseError } from '../../../lib/errors';
import { groupReplySenderLabel } from '../lib/groupReply';
import { parseGroupWallpapers, type GroupWallpapers } from '../lib/groupWallpapers';
import MessageTicks from './MessageTicks';
import PendingMessages from './PendingMessages';
import { outboxItemsFor } from '../../outbox/outboxTypes';
import GroupMessageInfoModal from './GroupMessageInfoModal';
import ChatSearchBar from './ChatSearchBar';
import { useChatSearch } from '../hooks/useChatSearch';
import { searchGroup, type SearchPageOptions } from '../api/searchApi';
import { composeFocusedMessages } from '../lib/focusedWindow';
import { deriveGroupMessageStatus } from '../lib/groupReceipts';
import { isSystemGroupMessage, describeGroupSystemMessage } from '../lib/groupAdminEvents';
import { canAddMembers, canEditInfo, canManageMembers } from '../lib/groupPermissions';
import GroupSettingsSection from './GroupSettingsSection';
import { GroupDisappearingSection, DisappearingChip, ExpiryClock } from './DisappearingControls';
import ReactionPicker from './reactions/ReactionPicker';
import ReactionChips from './reactions/ReactionChips';
import ReactionTrigger from './reactions/ReactionTrigger';
import ReactionsModal from './reactions/ReactionsModal';
import FullEmojiPicker from './reactions/FullEmojiPicker';
import { useLongPress } from '../hooks/useLongPress';
import type { GroupMessageResponse, MediaUploadResult, MessageStatus, SearchPage, GroupRole, GroupInfoRequest } from '../../../types/api';

// ── Small helpers ─────────────────────────────────────────────────────────────

const formatTime = (iso: string | null | undefined) => {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// ── GroupMessageBubble ────────────────────────────────────────────────────────

interface GroupMessageBubbleProps {
    msg: GroupMessageResponse;
    isMine: boolean;
    /** Resolved name for the replied-to message's sender (see lib/groupReply.ts). */
    replySender: string;
    onEdit: (msg: GroupMessageResponse) => void;
    onDelete: (msg: GroupMessageResponse) => void;
    onReply: (msg: GroupMessageResponse) => void;
    onDeleteForMe: (msg: GroupMessageResponse) => void;
    menuOpen: number | null;
    setMenuOpen: (id: number | null) => void;
    /** Estado derivado de los acuses del grupo (solo se dibuja en mensajes propios). */
    status?: MessageStatus;
    /** Abre el "Info" del mensaje (entrada de menú solo en mensajes propios). */
    onInfo?: (msg: GroupMessageResponse) => void;
    /** Término de la búsqueda abierta: se resalta dentro del texto. */
    searchQuery?: string;
    /** Reaccionar con un emoji (alterna: el mismo emoji quita la reacción). Sin esto no hay UI de reacciones. */
    onReact?: (msg: GroupMessageResponse, emoji: string) => void;
    /** "+" del selector rápido: abre el selector completo de emojis. */
    onMoreReactions?: (msg: GroupMessageResponse) => void;
    /** Abre la lista de quién reaccionó. */
    onShowReactions?: (msg: GroupMessageResponse) => void;
}

export const GroupMessageBubble = ({ msg, isMine, replySender, onEdit, onDelete, onReply, onDeleteForMe, menuOpen, setMenuOpen, status, onInfo, searchQuery, onReact, onMoreReactions, onShowReactions }: GroupMessageBubbleProps) => {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const bindLongPress = useLongPress<number>(setMenuOpen);
    const myReaction = msg.Reactions?.find(r => r.Mine)?.Emoji;

    const isMenuOpen = menuOpen === msg.MessageID;

    return (
        <div data-message-id={msg.MessageID} className={`flex ${isMine ? 'justify-end' : 'justify-start'} group px-2 py-0.5`}>
            <div className={`relative max-w-[75%] min-w-[80px] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                {/* Reply preview */}
                {msg.ReplyToMessage && (
                    <div className={`text-xs px-2 py-1 rounded-lg mb-1 border-l-2 ${isMine ? 'bg-indigo-800/40 border-indigo-400 self-end' : 'bg-slate-700/60 border-slate-500 self-start'}`}>
                        <span className="font-medium text-slate-300 truncate block max-w-[200px]">
                            {replySender}
                        </span>
                        <span className="text-slate-400 truncate block max-w-[200px]">{msg.ReplyToMessage}</span>
                    </div>
                )}

                {/* Bubble */}
                <div className={`relative px-3 py-2 rounded-2xl shadow-sm text-sm leading-relaxed break-words
                    ${isMine
                        ? 'bg-indigo-600 text-white rounded-tr-sm'
                        : 'bg-slate-800 text-slate-100 rounded-tl-sm'}`
                } {...bindLongPress(msg.MessageID)}>
                    {/* Sender name for non-mine messages */}
                    {!isMine && (
                        <div className="text-xs font-semibold text-indigo-400 mb-0.5 truncate">
                            {msg.SenderUsername || msg.SenderTelephon}
                        </div>
                    )}

                    <MediaContent message={msg} isMine={isMine} />

                    {/* Text (always show unless it's a pure media URL) */}
                    {msg.Message && !(msg.MediaType && msg.Message === msg.MediaUrl) && (
                        <span><HighlightedText text={msg.Message} query={searchQuery} /></span>
                    )}

                    {/* Footer: time + edited */}
                    <div className={`text-[10px] mt-1 flex items-center gap-1 ${isMine ? 'text-indigo-200/70 justify-end' : 'text-slate-500'}`}>
                        {msg.Edited && <span>editado</span>}
                        <ExpiryClock expiresAt={msg.ExpiresAt} />
                        <span>{formatTime(msg.Time)}</span>
                        {isMine && status && <MessageTicks status={status} />}
                    </div>

                    {/* Context menu button (hover; se mantiene visible mientras el menú está abierto o con foco por teclado) */}
                    <button
                        ref={triggerRef}
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(isMenuOpen ? null : msg.MessageID); }}
                        className={`absolute top-1 ${isMine ? 'left-0 -translate-x-full' : 'right-0 translate-x-full'}
                            px-1 transition-opacity text-slate-400 hover:text-white focus-visible:opacity-100
                            ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        aria-label="Opciones"
                    >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                    </button>

                    {/* Hover smile: quick reaction row only (same reveal as "Opciones") */}
                    {onReact && (
                        <div className={`absolute top-0 ${isMine ? 'left-0 -translate-x-[calc(100%+1.75rem)]' : 'right-0 translate-x-[calc(100%+1.75rem)]'}
                            transition-opacity focus-within:opacity-100 ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                            <ReactionTrigger
                                currentEmoji={myReaction}
                                onSelect={(emoji) => onReact(msg, emoji)}
                                onMore={() => onMoreReactions?.(msg)}
                                align={isMine ? 'right' : 'left'}
                            />
                        </div>
                    )}
                </div>

                {onReact && (
                    <ReactionChips
                        reactions={msg.Reactions}
                        onToggle={(emoji) => onReact(msg, emoji)}
                        onShowWho={() => onShowReactions?.(msg)}
                        align={isMine ? 'end' : 'start'}
                    />
                )}

                {/* Context menu — portado (Popover) para no quedar recortado por el
                    overflow-y-auto de la lista de mensajes */}
                <Popover
                    open={isMenuOpen}
                    onClose={() => setMenuOpen(null)}
                    anchorRef={triggerRef}
                    align={isMine ? 'right' : 'left'}
                    className="bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden min-w-[150px]"
                >
                    {onReact && (
                        <>
                            <ReactionPicker
                                currentEmoji={myReaction}
                                onSelect={(emoji) => { onReact(msg, emoji); setMenuOpen(null); }}
                                onMore={() => { setMenuOpen(null); onMoreReactions?.(msg); }}
                            />
                            <div className="h-px bg-white/10" />
                        </>
                    )}
                    {/* Reply — always available */}
                    <button onClick={() => { onReply(msg); setMenuOpen(null); }}
                            className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        Responder
                    </button>

                    {/* Info (quién lo leyó / recibió) — only my messages */}
                    {isMine && onInfo && (
                        <button onClick={() => { onInfo(msg); setMenuOpen(null); }}
                                className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Info
                        </button>
                    )}

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
                    <button onClick={() => { onDeleteForMe(msg); setMenuOpen(null); }}
                            className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:bg-white/5 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                        Eliminar para mí
                    </button>
                </Popover>
            </div>
        </div>
    );
};

// ── GroupMessageList ──────────────────────────────────────────────────────────

interface GroupMessageListProps {
    messages: GroupMessageEntry[] | undefined;
    myTelephon: string | undefined;
    activeWallpaper: string | null;
    /** Grupo abierto: al cambiar se baja al fondo. */
    groupID: number | undefined;
    hasMore: boolean;
    loadingOlder: boolean;
    onLoadOlder: () => void | Promise<void>;
    /** Ventana desprendida (abierta desde una búsqueda): no baja al fondo y pide mensajes más recientes abajo. */
    detached?: boolean;
    hasMoreNewer?: boolean;
    loadingNewer?: boolean;
    onLoadNewer?: () => void | Promise<void>;
    scrollTarget?: ScrollTarget | null;
    /** Término de la búsqueda abierta: se resalta dentro de los mensajes. */
    searchQuery?: string;
}

/** Persisted system entries (`Kind: 'system'`) render as a centered notice; see lib/groupAdminEvents.ts. */

export const GroupMessageList = ({
    messages, myTelephon, activeWallpaper, groupID, hasMore, loadingOlder, onLoadOlder,
    detached = false, hasMoreNewer = false, loadingNewer = false, onLoadNewer, scrollTarget = null, searchQuery,
}: GroupMessageListProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const {
        handleEditMessage, handleDeleteMessage, handleDeleteMessageForMe,
        handleReplyToMessage, messageMenuOpen, setMessageMenuOpen,
    } = useGroupMessaging();
    const { selectedGroup, groupReceipts, groupMemberNames, reactToMessage, outboxItems } = useDashboard();
    // Outbox (PW9): own texts not yet acked, shown after the live list (not in a detached window).
    const pendingItems = useMemo(
        () => (groupID !== undefined && !detached ? outboxItemsFor(outboxItems, { kind: 'group', target: groupID }, messages) : []),
        [groupID, detached, outboxItems, messages],
    );
    // El Info se ata al grupo en que se abrió: si cambia el grupo o el mensaje
    // ya no está en la lista (borrado), se descarta durante el render.
    const [info, setInfo] = useState<{ groupID: number | undefined; message: GroupMessageResponse } | null>(null);
    if (info && (info.groupID !== groupID || !messages?.some(m => m.MessageID === info.message.MessageID))) {
        setInfo(null);
    }
    const infoMessage = info?.message ?? null;
    const openInfo = (message: GroupMessageResponse) => setInfo({ groupID, message });
    // Reacciones: selector completo y lista de "quién reaccionó", atados al grupo abierto.
    const [fullPicker, setFullPicker] = useState<{ groupID: number | undefined; messageID: number } | null>(null);
    const [who, setWho] = useState<{ groupID: number | undefined; messageID: number } | null>(null);
    const activeFullPicker = fullPicker?.groupID === groupID ? fullPicker : null;
    const activeWho = who?.groupID === groupID ? who : null;
    const reactTo = useCallback((messageID: number, emoji: string) => {
        if (groupID === undefined) return;
        reactToMessage({ kind: 'group', messageID, groupID }, emoji);
    }, [groupID, reactToMessage]);

    // Nombres para los eventos de sistema: la caché del contexto (sobrevive a que
    // un miembro salga) con fallback a los miembros actuales del grupo abierto.
    const resolveSystemName = useCallback((telephon: string): string | undefined => {
        if (groupID === undefined) return undefined;
        return groupMemberNames?.[groupID]?.[telephon]
            ?? selectedGroup?.Members?.find(m => m.Telephon === telephon)?.Username
            ?? undefined;
    }, [groupID, groupMemberNames, selectedGroup]);

    // Al fondo al abrir un grupo o al llegar un mensaje nuevo al final; al llegar
    // arriba se cargan mensajes anteriores sin saltar la vista.
    useLoadOlderOnScroll({
        containerRef,
        chatKey: groupID,
        firstKey: messages?.[0]?.MessageID,
        lastKey: pendingItems.at(-1)?.entry.clientID ?? messages?.[messages.length - 1]?.MessageID,
        hasMore,
        loadingOlder,
        loadOlder: onLoadOlder,
        smoothTail: true,
        detached,
        hasMoreNewer,
        loadingNewer,
        loadNewer: onLoadNewer,
        scrollTarget,
    });

    const containerStyle = activeWallpaper
        ? { backgroundImage: `url(${activeWallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
        : undefined;
    // Sin fondo personalizado se usa la superficie de chat del tema
    const surfaceClass = activeWallpaper ? '' : 'chat-surface';

    if ((!messages || messages.length === 0) && pendingItems.length === 0) {
        return (
            <div className={`flex-1 flex items-center justify-center text-slate-500 text-sm ${surfaceClass}`} style={containerStyle}>
                No hay mensajes aún. ¡Sé el primero en escribir!
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className={`flex-1 overflow-y-auto relative py-3 px-2 sm:px-6 lg:px-10 space-y-0.5 ${surfaceClass}`}
            // overflow-anchor: none => el reajuste de scroll al anteponer es solo nuestro
            style={{ ...containerStyle, overflowAnchor: 'none' }}
        >
            {messages?.map((msg) => {
                if (isSystemGroupMessage(msg)) {
                    return (
                        <div key={msg.MessageID} className="flex justify-center py-1 px-4">
                            <span className="bg-black/40 backdrop-blur-sm text-slate-300 text-xs px-3 py-1 rounded-full">
                                {describeGroupSystemMessage(msg, myTelephon, resolveSystemName)}
                            </span>
                        </div>
                    );
                }
                return (
                    <GroupMessageBubble
                        key={msg.MessageID}
                        msg={msg}
                        isMine={msg.SenderTelephon === myTelephon}
                        replySender={groupReplySenderLabel(msg.ReplyToTelephon, myTelephon, selectedGroup?.Members)}
                        onEdit={handleEditMessage}
                        onDelete={handleDeleteMessage}
                        onReply={handleReplyToMessage}
                        onDeleteForMe={handleDeleteMessageForMe}
                        menuOpen={messageMenuOpen}
                        setMenuOpen={setMessageMenuOpen}
                        status={msg.SenderTelephon === myTelephon
                            ? deriveGroupMessageStatus(msg.MessageID, msg.SenderTelephon, groupID === undefined ? undefined : groupReceipts[groupID])
                            : undefined}
                        onInfo={openInfo}
                        searchQuery={searchQuery}
                        onReact={(m, emoji) => reactTo(m.MessageID, emoji)}
                        onMoreReactions={(m) => setFullPicker({ groupID, messageID: m.MessageID })}
                        onShowReactions={(m) => setWho({ groupID, messageID: m.MessageID })}
                    />
                );
            })}
            <PendingMessages items={pendingItems} />
            {infoMessage && <GroupMessageInfoModal message={infoMessage} onClose={() => setInfo(null)} />}
            {activeFullPicker && (
                <FullEmojiPicker
                    onClose={() => setFullPicker(null)}
                    onSelect={(emoji) => { reactTo(activeFullPicker.messageID, emoji); setFullPicker(null); }}
                />
            )}
            {activeWho && groupID !== undefined && (
                <ReactionsModal
                    target={{ kind: 'group', messageID: activeWho.messageID, groupID }}
                    myTelephon={myTelephon}
                    onClose={() => setWho(null)}
                />
            )}
            {/* Indicador de carga: absoluto y sin margen de space-y (no mueve el contenido) */}
            {loadingOlder && (
                <div className="absolute inset-x-0 top-2 mt-0! z-20 flex justify-center pointer-events-none">
                    <span role="status" className="bg-black/50 backdrop-blur-sm text-slate-300 text-[11px] px-3 py-1 rounded-full">
                        Cargando mensajes anteriores…
                    </span>
                </div>
            )}
        </div>
    );
};

// ── AddMembersModal ────────────────────────────────────────────────────────────

interface AddMembersModalProps {
    isOpen: boolean;
    onClose: () => void;
    group: SelectedGroup;
}

const AddMembersModal = ({ isOpen, onClose, group }: AddMembersModalProps) => {
    const { contacts, addToast, fetchUserGroups } = useDashboard();
    const [selected, setSelected] = useState<Set<string>>(new Set());
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

    const toggle = (num: string) => setSelected(prev => {
        const next = new Set(prev);
        if (next.has(num)) next.delete(num);
        else next.add(num);
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
            addToast({ type: 'error', message: getResponseError(err) || 'Error al añadir miembros' });
        } finally {
            setLoading(false);
        }
    };

    useEscapeToClose(onClose, isOpen);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-modal bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
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
        groupPaging, loadOlderGroupMessages,
        focusedGroup, openMessageAt, returnToLatest, loadOlderFocused, loadNewerFocused,
        typingUsers, profile,
        contacts,
        setSelected,
        avatarMap, myAvatar,
        setGroups, addToast,
        globalWallpaper, selectedDisappearSeconds,
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
    const [memberMenuOpen, setMemberMenuOpen]     = useState<string | null>(null);
    const [addContactOpen, setAddContactOpen]     = useState(false);
    const [addContactTarget, setAddContactTarget] = useState({ number: '', username: '' });
    const [confirmRemoveMember, setConfirmRemoveMember] = useState<{ telephon: string; username: string } | null>(null);
    const [memberActionLoading, setMemberActionLoading] = useState(false);
    const [editingInfo, setEditingInfo]           = useState(false);
    const [infoName, setInfoName]                 = useState('');
    const [infoDescription, setInfoDescription]   = useState('');
    const [savingInfo, setSavingInfo]             = useState(false);
    const optionsRef                               = useRef<HTMLDivElement>(null);
    const avatarInputRef                           = useRef<HTMLInputElement>(null);
    const avatarTriggerRef                         = useRef<HTMLButtonElement>(null); // disparador del menú de avatar (Popover)
    const getMemberTriggerRef                      = useRefMap<HTMLDivElement>();  // disparador del menú de cada miembro, por telephon (Popover)

    // Per-group wallpapers from localStorage
    const [groupWallpapers, setGroupWallpapers] = useState<GroupWallpapers>(() => {
        try { return parseGroupWallpapers(localStorage.getItem('group_wallpapers')); } catch { return {}; }
    });
    useEffect(() => {
        const onCustom = (e: Event) => setGroupWallpapers(parseGroupWallpapers((e as CustomEvent<unknown>).detail));
        window.addEventListener('group-wallpaper-changed', onCustom);
        return () => window.removeEventListener('group-wallpaper-changed', onCustom);
    }, []);

    const activeWallpaper = (selectedGroup && groupWallpapers[selectedGroup.ID]) || globalWallpaper || null;

    const handleGroupWallpaperUpload = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedGroup?.ID) return;
        setUploadingWallpaper(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const { data } = await api.post<MediaUploadResult | null>('/api/v1/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            // TODO(types): a body without `url` still reports success (pre-existing;
            // the entry is just not stored) — no toast/behavior change in this migration.
            const url = data?.url;
            const newWps: GroupWallpapers = url ? { ...groupWallpapers, [selectedGroup.ID]: url } : { ...groupWallpapers };
            setGroupWallpapers(newWps);
            localStorage.setItem('group_wallpapers', JSON.stringify(newWps));
            window.dispatchEvent(new CustomEvent('group-wallpaper-changed', { detail: newWps }));
            addToast({ type: 'success', message: 'Fondo del grupo actualizado' });
        } catch (err) {
            addToast({ type: 'error', message: getResponseError(err) || 'Error al subir el fondo' });
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

    // Close options dropdown when clicking outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (optionsRef.current && !(e.target instanceof Node && optionsRef.current.contains(e.target))) setShowOptions(false);
        };
        if (showOptions) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showOptions]);

    const handleClearChat = () => {
        if (!selectedGroup) return;
        setGroupMessages(prev => ({ ...prev, [selectedGroup.ID]: [] }));
        setConfirmClear(false);
        setShowOptions(false);
    };

    const handleLeaveGroup = async () => {
        if (!selectedGroup) return;
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
            addToast({ type: 'error', message: getResponseError(err) || 'Error al salir del grupo' });
        } finally {
            setLoadingLeave(false);
            setConfirmLeave(false);
        }
    };

    const handleDeleteGroup = async () => {
        if (!selectedGroup) return;
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
        } catch {
            // Ignore — local state already cleaned up
        }
        addToast({ type: 'success', message: 'Grupo eliminado de tu lista' });
    };

    const handleGroupAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedGroup?.ID) return;
        setUploadingAvatar(true);
        try {
            // 1. Upload image to MinIO
            const formData = new FormData();
            formData.append('file', file);
            const uploadRes = await api.post<MediaUploadResult | null>('/api/v1/upload', formData, {
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
            addToast({ type: 'error', message: getResponseError(err) || 'Error al actualizar la foto' });
        } finally {
            setUploadingAvatar(false);
            e.target.value = '';
        }
    };

    const myTelephon = profile?.Telephon;
    const liveMessages = selectedGroup ? groupMessages[selectedGroup.ID] : undefined;
    // Ventana desprendida (abierta desde una búsqueda): se muestra en lugar de los últimos mensajes.
    const focused = selectedGroup ? focusedGroup[selectedGroup.ID] : undefined;
    const messages: GroupMessageEntry[] = (focused ? composeFocusedMessages<GroupMessageEntry>(focused, liveMessages) : liveMessages) || [];

    const focusedTargetId = focused?.targetId;
    const focusedSeq = focused?.seq;
    const scrollTarget = useMemo(
        () => (focusedTargetId !== undefined && focusedSeq !== undefined ? { id: focusedTargetId, seq: focusedSeq } : null),
        [focusedTargetId, focusedSeq],
    );

    // Búsqueda dentro del grupo (barra bajo la cabecera; salta a cada coincidencia)
    const groupId = selectedGroup?.ID;
    const searchTarget = useMemo<FocusTarget | null>(
        () => (groupId !== undefined ? { kind: 'group', id: groupId } : null),
        [groupId],
    );
    const searchMessages = useCallback(
        (q: string, opts: SearchPageOptions): Promise<SearchPage> => searchGroup(groupId ?? 0, q, opts),
        [groupId],
    );
    const chatSearch = useChatSearch({ target: searchTarget, search: searchMessages, openMessageAt });
    // El backend solo busca para miembros activos: un grupo que ya abandonaste no se puede buscar.
    const canSearch = selectedGroup?.UserRole !== 'left';

    // Group-specific typing keys: "group:<groupID>:<telephon>"
    const typingInGroup = selectedGroup
        ? Array.from(typingUsers).filter(k => k.startsWith(`group:${selectedGroup.ID}:`))
        : [];

    // Load full detail (members + messages) if not yet loaded or if Members are missing.
    // La caché de mensajes se lee por ref: el efecto solo debe dispararse al cambiar de grupo.
    const groupMessagesRef = useRef(groupMessages);
    useEffect(() => { groupMessagesRef.current = groupMessages; }, [groupMessages]);
    useEffect(() => {
        if (!selectedGroup?.ID) return;
        if (!selectedGroup.Members) {
            // selectedGroup is a lightweight GroupResponse — load the full GroupDetail
            fetchGroupDetail(selectedGroup.ID);
        } else if (!groupMessagesRef.current[selectedGroup.ID]) {
            // Detail already loaded but no cached messages yet
            fetchGroupMessages(selectedGroup.ID);
        }
    }, [selectedGroup?.ID, selectedGroup?.Members, fetchGroupDetail, fetchGroupMessages]);

    // Escape cierra, en orden, lo que esté "más arriba": el panel de info del
    // grupo, o los diálogos de confirmación / el visor de avatar (cada
    // useEscapeToClose se apila y solo la capa abierta más reciente reacciona).
    useEscapeToClose(() => setShowMembers(false), showMembers);
    useEscapeToClose(() => setConfirmLeave(false), confirmLeave);
    useEscapeToClose(() => setConfirmDelete(false), confirmDelete);
    useEscapeToClose(() => setConfirmClear(false), confirmClear);
    useEscapeToClose(() => setViewAvatarOpen(false), viewAvatarOpen);
    useEscapeToClose(() => setConfirmRemoveMember(null), confirmRemoveMember !== null);
    useEscapeToClose(() => setEditingInfo(false), editingInfo);

    if (!selectedGroup) return null;

    // Permisos del grupo para este espectador (matriz de lib/groupPermissions).
    // Hiding controls is convenience only: el backend valida cada camino.
    const canManageMembersNow = canManageMembers(selectedGroup.UserRole);
    const canAddMembersNow = canAddMembers(selectedGroup.UserRole, selectedGroup);
    const canEditInfoNow = canEditInfo(selectedGroup.UserRole, selectedGroup);

    const openEditInfo = () => {
        setInfoName(selectedGroup.Name);
        setInfoDescription(selectedGroup.Description ?? '');
        setEditingInfo(true);
    };

    const saveGroupInfo = async () => {
        const gid = selectedGroup.ID;
        const patch: GroupInfoRequest = {};
        const nextName = infoName.trim();
        const nextDescription = infoDescription.trim();
        if (nextName && nextName !== selectedGroup.Name) patch.name = nextName;
        if (nextDescription !== (selectedGroup.Description ?? '')) patch.description = nextDescription;
        if (Object.keys(patch).length === 0) { setEditingInfo(false); return; }
        setSavingInfo(true);
        try {
            const { updateGroupInfo } = await import('../../../api/groupApi');
            const { data } = await updateGroupInfo(gid, patch);
            setSelectedGroup(prev => (prev && prev.ID === gid ? { ...prev, Name: data.name, Description: data.description } : prev));
            setGroups(prev => prev.map(g => (g.ID === gid ? { ...g, Name: data.name, Description: data.description } : g)));
            addToast({ type: 'success', message: 'Información del grupo actualizada' });
            setEditingInfo(false);
        } catch (err) {
            addToast({ type: 'error', message: getResponseError(err) || 'No se pudo actualizar la información' });
        } finally {
            setSavingInfo(false);
        }
    };

    const handleMemberRole = async (telephon: string, role: GroupRole, displayName: string) => {
        const gid = selectedGroup.ID;
        setMemberMenuOpen(null);
        try {
            const { changeGroupMemberRole } = await import('../../../api/groupApi');
            await changeGroupMemberRole(gid, telephon, role);
            setSelectedGroup(prev => (prev && prev.ID === gid
                ? { ...prev, Members: prev.Members?.map(m => (m.Telephon === telephon ? { ...m, Role: role } : m)) }
                : prev));
            addToast({ type: 'success', message: role === 'admin' ? `${displayName} es admin` : `${displayName} ya no es admin` });
        } catch (err) {
            addToast({ type: 'error', message: getResponseError(err) || 'No se pudo cambiar el rol' });
        }
    };

    const handleRemoveMember = async () => {
        if (!confirmRemoveMember) return;
        const gid = selectedGroup.ID;
        const { telephon } = confirmRemoveMember;
        setMemberActionLoading(true);
        try {
            const { removeGroupMember } = await import('../../../api/groupApi');
            await removeGroupMember(gid, telephon);
            setSelectedGroup(prev => (prev && prev.ID === gid
                ? {
                    ...prev,
                    MemberCount: Math.max((prev.MemberCount || 1) - 1, 0),
                    Members: prev.Members?.filter(m => m.Telephon !== telephon),
                }
                : prev));
            setGroups(prev => prev.map(g => (g.ID === gid ? { ...g, MemberCount: Math.max((g.MemberCount || 1) - 1, 0) } : g)));
            addToast({ type: 'success', message: 'Miembro eliminado' });
            setConfirmRemoveMember(null);
        } catch (err) {
            addToast({ type: 'error', message: getResponseError(err) || 'No se pudo eliminar al miembro' });
        } finally {
            setMemberActionLoading(false);
        }
    };

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

                <DisappearingChip seconds={selectedDisappearSeconds} />

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                    {canSearch && (
                        <button onClick={chatSearch.isOpen ? chatSearch.close : chatSearch.open}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
                                title="Buscar" aria-label="Buscar en el chat" aria-pressed={chatSearch.isOpen}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </button>
                    )}
                    {/* More options kebab */}
                    <div className="relative" ref={optionsRef}>
                        <button onClick={() => setShowOptions(v => !v)}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
                                title="Más opciones" aria-label="Más opciones" aria-haspopup="menu" aria-expanded={showOptions}>
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                        </button>
                        {showOptions && (
                            <div role="menu" className="absolute right-0 top-full mt-1 bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden min-w-[220px] z-dropdown">
                                {selectedGroup.UserRole !== 'left' && (
                                    <>
                                        <MuteMenuItems key={selectedGroup.ID} target={{ kind: 'group', id: selectedGroup.ID }} onDone={() => setShowOptions(false)} />
                                        <div className="border-t border-white/5" />
                                    </>
                                )}
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

            {chatSearch.isOpen && canSearch && <ChatSearchBar search={chatSearch} />}

            {/* ── Group info side panel (WhatsApp-style) ── */}
            {showMembers && (
                <>
                    {/* Backdrop */}
                    <div className="absolute inset-0 z-modal bg-black/40"
                         onClick={() => setShowMembers(false)} />

                    {/* Panel */}
                    <div className="absolute top-0 right-0 h-full w-full sm:w-96 z-modal bg-slate-900 flex flex-col shadow-2xl"
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
                                <div className="relative group/avatar mb-4">
                                    <button
                                        ref={avatarTriggerRef}
                                        onClick={() => setShowAvatarMenu(v => !v)}
                                        className="relative w-24 h-24 rounded-full overflow-hidden shadow-xl focus:outline-none"
                                        aria-label="Foto del grupo"
                                        disabled={uploadingAvatar || (!selectedGroup.AvatarUrl && !canEditInfoNow)}>
                                        <div className="w-full h-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-4xl font-bold text-white">
                                            {selectedGroup.AvatarUrl
                                                ? <img src={selectedGroup.AvatarUrl} alt="grupo" className="w-full h-full object-cover" />
                                                : selectedGroup.Name?.charAt(0)?.toUpperCase()
                                            }
                                        </div>
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                                            {uploadingAvatar
                                                ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                : canEditInfoNow
                                                    ? <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                                      </svg>
                                                    : <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                      </svg>
                                            }
                                        </div>
                                    </button>

                                    {/* Avatar action menu — portado (Popover) para no quedar recortado
                                        por el overflow-y-auto del panel de info del grupo */}
                                    <Popover
                                        open={showAvatarMenu}
                                        onClose={() => setShowAvatarMenu(false)}
                                        anchorRef={avatarTriggerRef}
                                        className="w-44 bg-slate-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-fade-in"
                                    >
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
                                        {canEditInfoNow && (
                                            <label className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer">
                                                <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                                {uploadingAvatar ? 'Subiendo...' : 'Cambiar foto'}
                                                <input type="file" accept="image/*" className="hidden" onChange={(e) => { setShowAvatarMenu(false); handleGroupAvatarChange(e); }} disabled={uploadingAvatar} />
                                            </label>
                                        )}
                                    </Popover>

                                    {/* Hidden file input (kept for ref compatibility) */}
                                    <input
                                        ref={avatarInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleGroupAvatarChange}
                                    />
                                </div>
                                {editingInfo ? (
                                    <div className="w-full max-w-xs flex flex-col gap-2 mt-1" data-testid="group-info-edit">
                                        <input
                                            type="text"
                                            value={infoName}
                                            onChange={e => setInfoName(e.target.value)}
                                            maxLength={60}
                                            aria-label="Nombre del grupo"
                                            placeholder="Nombre del grupo"
                                            className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
                                        />
                                        <textarea
                                            value={infoDescription}
                                            onChange={e => setInfoDescription(e.target.value)}
                                            maxLength={200}
                                            rows={2}
                                            aria-label="Descripción del grupo"
                                            placeholder="Descripción del grupo"
                                            className="w-full resize-none bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
                                        />
                                        <div className="flex gap-2">
                                            <button onClick={() => setEditingInfo(false)} disabled={savingInfo}
                                                    className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors disabled:opacity-50">
                                                Cancelar
                                            </button>
                                            <button onClick={saveGroupInfo} disabled={savingInfo || !infoName.trim()}
                                                    className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
                                                {savingInfo ? 'Guardando...' : 'Guardar'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-center gap-2 mt-0">
                                            <h2 className="text-xl font-bold text-white text-center">{selectedGroup.Name}</h2>
                                            {canEditInfoNow && (
                                                <button onClick={openEditInfo} aria-label="Editar info del grupo"
                                                        className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                        {selectedGroup.Description && (
                                            <p className="text-sm text-slate-400 text-center mt-1 max-w-xs">{selectedGroup.Description}</p>
                                        )}
                                    </>
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
                                    {canAddMembersNow && (
                                        <button onClick={() => { setShowMembers(false); setShowAddMembers(true); }}
                                                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                            </svg>
                                            Añadir
                                        </button>
                                    )}
                                </div>

                                {selectedGroup.Members ? (
                                    selectedGroup.Members.map((m) => {
                                        const isSelf     = m.Telephon === myTelephon;
                                        const isOpen     = memberMenuOpen === m.Telephon;
                                        const isContact  = contacts.some(c => c.Number === m.Telephon && c.Status === 'accepted');
                                        const displayName = isSelf ? 'Tú' : (m.ContactName || ('~' + m.Username));
                                        return (
                                            <div key={m.Telephon} className="relative">
                                                <div
                                                    ref={(el) => {
                                                        // R3-refmap-unbounded: liberar la entrada al desmontarse
                                                        // (el === null), en vez de dejarla colgada para siempre.
                                                        if (el) getMemberTriggerRef(m.Telephon).current = el;
                                                        else getMemberTriggerRef.release(m.Telephon);
                                                    }}
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
                                                {/* Menú de miembro — portado (Popover) para no quedar recortado
                                                    por el overflow-y-auto del panel de info del grupo; se abre
                                                    dentro de ese panel, por eso dropdown > modal en la escala. */}
                                                <Popover
                                                    open={isOpen}
                                                    onClose={() => setMemberMenuOpen(null)}
                                                    anchorRef={getMemberTriggerRef(m.Telephon)}
                                                    className="bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden min-w-[190px]"
                                                >
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
                                                    {canManageMembersNow && (
                                                        <>
                                                            <div className="border-t border-white/5" />
                                                            {m.Role === 'admin' ? (
                                                                <button onClick={() => { void handleMemberRole(m.Telephon, 'member', m.ContactName || m.Username); }}
                                                                        className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10 flex items-center gap-2">
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                    </svg>
                                                                    Descartar como admin
                                                                </button>
                                                            ) : (
                                                                <button onClick={() => { void handleMemberRole(m.Telephon, 'admin', m.ContactName || m.Username); }}
                                                                        className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10 flex items-center gap-2">
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622C17.176 19.29 21 14.591 21 9c0-1.042-.133-2.052-.382-3.016z" />
                                                                    </svg>
                                                                    Designar como admin
                                                                </button>
                                                            )}
                                                            <button onClick={() => { setConfirmRemoveMember({ telephon: m.Telephon, username: m.ContactName || m.Username }); setMemberMenuOpen(null); }}
                                                                    className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2">
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                                                                </svg>
                                                                Eliminar
                                                            </button>
                                                        </>
                                                    )}
                                                </Popover>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="px-4 py-6 text-center text-slate-500 text-sm">Cargando participantes...</div>
                                )}
                            </div>

                            {/* Configuración del grupo (permisos) */}
                            <GroupSettingsSection />

                            {/* Mensajes temporales */}
                            <GroupDisappearingSection />

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
            <div className="relative flex-1 min-h-0 flex flex-col">
                <GroupMessageList
                    messages={messages}
                    myTelephon={myTelephon}
                    activeWallpaper={activeWallpaper}
                    groupID={selectedGroup?.ID}
                    hasMore={focused ? focused.hasMoreOlder : (selectedGroup ? (groupPaging[selectedGroup.ID]?.hasMore ?? false) : false)}
                    loadingOlder={focused ? focused.loadingOlder : (selectedGroup ? (groupPaging[selectedGroup.ID]?.loadingOlder ?? false) : false)}
                    onLoadOlder={() => {
                        if (!selectedGroup) return;
                        return focused
                            ? loadOlderFocused({ kind: 'group', id: selectedGroup.ID })
                            : loadOlderGroupMessages(selectedGroup.ID);
                    }}
                    detached={!!focused}
                    hasMoreNewer={focused?.hasMoreNewer ?? false}
                    loadingNewer={focused?.loadingNewer ?? false}
                    onLoadNewer={() => { if (selectedGroup) return loadNewerFocused({ kind: 'group', id: selectedGroup.ID }); }}
                    scrollTarget={scrollTarget}
                    searchQuery={chatSearch.activeQuery}
                />
                {focused && selectedGroup && (
                    <button
                        onClick={() => returnToLatest({ kind: 'group', id: selectedGroup.ID })}
                        className="absolute bottom-4 right-4 z-20 flex items-center gap-2 px-4 py-2 rounded-full glass shadow-lg text-sm font-medium text-slate-100 hover:bg-white/10 transition-colors"
                        aria-label="Ir a los mensajes recientes"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                        Ir a los mensajes recientes
                    </button>
                )}
            </div>

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
                <div className="fixed inset-0 z-modal bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
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

            {/* ── Confirm remove member dialog ── */}
            {confirmRemoveMember && (
                <div className="fixed inset-0 z-modal bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                     onClick={() => setConfirmRemoveMember(null)}>
                    <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-xs p-6 flex flex-col gap-4"
                         onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                                </svg>
                            </div>
                            <div>
                                <p className="font-semibold text-white">¿Eliminar a {confirmRemoveMember.username || confirmRemoveMember.telephon}?</p>
                                <p className="text-xs text-slate-400 mt-0.5">Dejará de ser miembro del grupo. Podrás volver a añadirlo después.</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmRemoveMember(null)} disabled={memberActionLoading}
                                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors disabled:opacity-50">
                                Cancelar
                            </button>
                            <button onClick={handleRemoveMember} disabled={memberActionLoading}
                                    className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
                                {memberActionLoading ? 'Eliminando...' : 'Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Confirm delete group dialog ── */}
            {confirmDelete && (
                <div className="fixed inset-0 z-modal bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
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
                <div className="fixed inset-0 z-modal bg-black/90 backdrop-blur-sm flex items-center justify-center p-6"
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
                <div className="fixed inset-0 z-modal bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
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
