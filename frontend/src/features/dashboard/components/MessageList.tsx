import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useDashboard, type ReactionTarget } from '../context/DashboardContext';
import { useMessaging } from '../hooks/useMessaging';
import { useLoadOlderOnScroll } from '../hooks/useLoadOlderOnScroll';
import { composeFocusedMessages } from '../lib/focusedWindow';
import { isSystemDirectMessage, describeDirectSystemMessage } from '../lib/disappearing';
import HighlightedText from './HighlightedText';
import { formatDaySeparator, formatTime } from '../../../utils/format';
import MediaContent from '../../../components/MediaContent';
import { isMediaUrl, replyPreviewText } from '../../../lib/mediaMessage';
import Popover from '../../../components/ui/Popover';
import { useRefMap } from '../../../hooks/useRefMap';
import MessageTicks from './MessageTicks';
import PendingMessages from './PendingMessages';
import { outboxItemsFor } from '../../outbox/outboxTypes';
import { ExpiryClock } from './DisappearingControls';
import ReactionPicker from './reactions/ReactionPicker';
import ReactionChips from './reactions/ReactionChips';
import ReactionTrigger from './reactions/ReactionTrigger';
import ReactionsModal from './reactions/ReactionsModal';
import FullEmojiPicker from './reactions/FullEmojiPicker';
import { useLongPress } from '../hooks/useLongPress';
import { useStickerLibrary } from '../../stickers/useStickerLibrary';
import { findBuiltinSticker } from '../../stickers/builtinPack';
import type { Message } from '../../../types/api';

/**
 * MessageList Component
 * Renderiza la lista de mensajes de un chat con optimizaciones de UI/UX.
 */

/**
 * `Message` (types/api.ts) solo tiene `Time` (requerido) — `Timestamp` no
 * existe en el contrato del backend; el fallback `m.Time || m.Timestamp` es
 * código muerto preexistente (`Time` siempre está presente), documentado en
 * vez de removido sin test (mismo criterio que CallHistory/MediaUploadMenu).
 */
type MessageWithLegacyTimestamp = Message & { Timestamp?: string };

// Lee los fondos por chat guardados en localStorage (puede fallar en modo privado)
const readChatWallpapers = (): Record<string, string> => {
    try {
        return JSON.parse(localStorage.getItem('chat_wallpapers') || '{}') || {};
    } catch {
        return {};
    }
};

interface MessageListProps {
    /** Término de la búsqueda abierta: se resalta dentro de los mensajes. */
    searchQuery?: string;
}

const MessageList = ({ searchQuery }: MessageListProps) => {
    const { 
        selected, messagesByChat, profile, globalWallpaper,
        chatPaging, loadOlderMessages,
        focusedChat, loadOlderFocused, loadNewerFocused, reactToMessage, outboxItems,
        addToast,
    } = useDashboard();

    // Per-chat wallpapers from localStorage (set via ContactDetails)
    const [chatWallpapers, setChatWallpapers] = useState<Record<string, string>>(readChatWallpapers);

    useEffect(() => {
        // Listen for storage changes (cross-tab)
        const onStorage = (e: StorageEvent) => {
            if (e.key === 'chat_wallpapers') {
                try { setChatWallpapers(e.newValue ? JSON.parse(e.newValue) : {}); } catch { /* ignore */ }
            }
        };
        // Listen for same-tab wallpaper changes (dispatched by ContactDetails)
        const onCustom = (e: Event) => {
            const detail = (e as CustomEvent<Record<string, string>>).detail;
            setChatWallpapers(detail || {});
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

    const messagesContainerRef = useRef<HTMLDivElement>(null);
    // Reactions: "+" full picker and who-reacted modal, both tied to one message id.
    const [fullPickerFor, setFullPickerFor] = useState<number | null>(null);
    const [whoFor, setWhoFor] = useState<number | null>(null);
    const bindLongPress = useLongPress<number>(setMessageMenuOpen);
    // Disparadores del menú de cada mensaje, para el Popover portado (ver T4:
    // R2 — el menú ya no depende del hover del padre para mantenerse visible).
    const getMenuTriggerRef = useRefMap();

    // Received stickers (SF6): the message menu can favorite a built-in sticker
    // or save a custom one into "Mis stickers". The hook is inert until a menu
    // item is used (it does not fetch the library).
    const stickerLibrary = useStickerLibrary();
    const addStickerFavorite = async (url: string): Promise<void> => {
        const ok = await stickerLibrary.toggleFavorite(url, true);
        addToast?.({ type: ok ? 'success' : 'error', message: ok ? 'Añadido a favoritos' : 'No se pudo añadir a favoritos' });
    };
    const saveStickerToLibrary = async (url: string): Promise<void> => {
        const saved = await stickerLibrary.saveFromMessage(url);
        addToast?.({ type: saved ? 'success' : 'error', message: saved ? 'Añadido a Mis stickers' : 'No se pudo añadir el sticker' });
    };

    // Scroll: al fondo al abrir un chat o cuando llega un mensaje nuevo al final de
    // ESTE chat; al llegar arriba se cargan mensajes anteriores sin saltar la vista.
    const selectedNumber = selected?.Number;
    const liveMessages = selectedNumber ? messagesByChat[selectedNumber] : undefined;
    const paging = selectedNumber ? chatPaging[selectedNumber] : undefined;
    // Ventana desprendida (abierta desde una búsqueda): se muestra en lugar de los últimos mensajes.
    const focused = selectedNumber ? focusedChat[selectedNumber] : undefined;
    const currentMessages = useMemo(
        () => (focused ? composeFocusedMessages(focused, liveMessages) : liveMessages),
        [focused, liveMessages],
    );
    // Outbox (PW9): own texts not yet acked, shown after the live list (not in a detached window).
    const pendingItems = useMemo(
        () => (selectedNumber && !focused ? outboxItemsFor(outboxItems, { kind: 'direct', target: selectedNumber }, liveMessages) : []),
        [selectedNumber, focused, outboxItems, liveMessages],
    );
    const loadOlder = useCallback(() => {
        if (!selectedNumber) return;
        return focused
            ? loadOlderFocused({ kind: 'chat', key: selectedNumber })
            : loadOlderMessages(selectedNumber);
    }, [selectedNumber, focused, loadOlderFocused, loadOlderMessages]);
    const loadNewer = useCallback(() => {
        if (selectedNumber) return loadNewerFocused({ kind: 'chat', key: selectedNumber });
    }, [selectedNumber, loadNewerFocused]);
    const focusedTargetId = focused?.targetId;
    const focusedSeq = focused?.seq;
    const scrollTarget = useMemo(
        () => (focusedTargetId !== undefined && focusedSeq !== undefined ? { id: focusedTargetId, seq: focusedSeq } : null),
        [focusedTargetId, focusedSeq],
    );
    useLoadOlderOnScroll({
        containerRef: messagesContainerRef,
        chatKey: selectedNumber,
        firstKey: currentMessages?.[0]?.MessageID,
        lastKey: pendingItems.at(-1)?.entry.clientID ?? currentMessages?.[currentMessages.length - 1]?.MessageID,
        hasMore: focused ? focused.hasMoreOlder : (paging?.hasMore ?? false),
        loadingOlder: focused ? focused.loadingOlder : (paging?.loadingOlder ?? false),
        loadOlder,
        detached: !!focused,
        hasMoreNewer: focused?.hasMoreNewer ?? false,
        loadingNewer: focused?.loadingNewer ?? false,
        loadNewer,
        scrollTarget,
    });

    interface MessageGroup {
        date: string;
        label: string;
        messages: MessageWithLegacyTimestamp[];
    }

    // Agrupación de mensajes por fecha
    const groupedMessages = useMemo((): MessageGroup[] => {
        if (!selected) return [];
        const messages = (currentMessages || []) as MessageWithLegacyTimestamp[];
        const groups: MessageGroup[] = [];
        let currentGroup: MessageGroup | null = null;

        messages.forEach((m) => {
            const date = new Date(m.Time || m.Timestamp || '');
            const dayKey = date.toDateString();

            if (!currentGroup || currentGroup.date !== dayKey) {
                currentGroup = { date: dayKey, label: formatDaySeparator(date), messages: [] };
                groups.push(currentGroup);
            }
            currentGroup.messages.push(m);
        });

        return groups;
    }, [currentMessages, selected]);

    if (!selected) return null;

    const resolveSystemName = (telephon: string): string | undefined => (
        telephon === selected.Number ? (selected.ContactName || selected.Username || selected.Number) : undefined
    );

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
            // overflow-anchor: none => el reajuste de scroll al anteponer es solo nuestro
            style={{ ...containerStyle, overflowAnchor: 'none' }}
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
                            // Avisos de sistema (p. ej. mensajes temporales): píldora centrada, sin burbuja ni acciones.
                            if (isSystemDirectMessage(m)) {
                                return (
                                    <div key={m.MessageID} data-message-id={m.MessageID} data-system-message="true" className="flex justify-center py-1 px-4">
                                        <span className="bg-chip backdrop-blur-sm text-slate-300 text-xs px-3 py-1 rounded-full text-center">
                                            {describeDirectSystemMessage(m, profile?.Telephon, resolveSystemName)}
                                        </span>
                                    </div>
                                );
                            }
                            const isMine = m.SenderTelephon === profile?.Telephon;
                            const isSticker = m.MediaType === 'sticker';
                            const stickerUrl = isSticker ? (m.MediaUrl || m.Message || '').trim() : '';
                            const builtinSticker = stickerUrl ? findBuiltinSticker(stickerUrl) : undefined;
                            const isCustomSticker = isSticker && !builtinSticker && stickerUrl.startsWith('/storage/');
                            const isMenuOpen = messageMenuOpen === m.MessageID;
                            const time = formatTime(m.Time || m.Timestamp || '');
                            const reactionTarget: ReactionTarget = { kind: 'direct', messageID: m.MessageID };
                            const myReaction = m.Reactions?.find(r => r.Mine)?.Emoji;

                            return (
                                <div 
                                    key={m.MessageID} 
                                    data-message-id={m.MessageID}
                                    className={`group flex ${isMine ? 'justify-end' : 'justify-start'} items-end gap-2 animate-slide-up`}
                                >
                                    <div className={`relative max-w-[85%] sm:max-w-[70%] group/bubble`} {...bindLongPress(m.MessageID)}>
                                        {/* Disparador del menú: revelado con hover como antes, pero ya NO
                                            envuelve al menú (ver T4: R2 — antes, al dejar de hacer hover, todo
                                            el contenedor (disparador + menú abierto) se volvía invisible por
                                            CSS aunque el estado siguiera "abierto"). También queda visible
                                            si el menú está abierto, o con foco de teclado (accesible/táctil). */}
                                        <div className={`absolute top-0 ${isMine ? '-left-[4.5rem]' : '-right-[4.5rem]'} flex items-center gap-1 transition-opacity z-20 ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover/bubble:opacity-100 focus-within:opacity-100'}`}>
                            <ReactionTrigger
                                                currentEmoji={myReaction}
                                                onSelect={(emoji) => reactToMessage(reactionTarget, emoji)}
                                                onMore={() => setFullPickerFor(m.MessageID)}
                                                align={isMine ? 'left' : 'right'}
                                            />
                                            <button
                                                ref={(el: HTMLButtonElement | null) => {
                                                    // R3-refmap-unbounded: liberar la entrada al desmontarse
                                                    // (el === null), en vez de dejarla colgada para siempre.
                                                    if (el) getMenuTriggerRef(m.MessageID).current = el;
                                                    else getMenuTriggerRef.release(m.MessageID);
                                                }}
                                                onClick={() => setMessageMenuOpen(isMenuOpen ? null : m.MessageID)}
                                                className="p-1.5 glass rounded-full text-slate-400 hover:text-fg transition-all shadow-lg"
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
                                            className="w-60 p-1 bg-slate-800 border border-fg/10 rounded-xl shadow-2xl overflow-hidden animate-fade-in"
                                        >
                                            <ReactionPicker
                                                currentEmoji={myReaction}
                                                onSelect={(emoji) => { reactToMessage(reactionTarget, emoji); setMessageMenuOpen(null); }}
                                                onMore={() => { setMessageMenuOpen(null); setFullPickerFor(m.MessageID); }}
                                            />
                                            <div className="my-1 h-px bg-fg/10" />
                                            <button onClick={() => { handleReplyToMessage(m); setMessageMenuOpen(null); }} className="w-full px-3 py-2 rounded-lg text-left text-[13px] font-medium text-slate-200 hover:bg-fg/[0.06] transition-colors flex items-center gap-2.5">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                                                Responder
                                            </button>
                                            <button onClick={() => { handleForwardMessage(m); setMessageMenuOpen(null); }} className="w-full px-3 py-2 rounded-lg text-left text-[13px] font-medium text-slate-200 hover:bg-fg/[0.06] transition-colors flex items-center gap-2.5">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                                                Reenviar
                                            </button>
                                            {builtinSticker && (
                                                <button onClick={() => { void addStickerFavorite(stickerUrl); setMessageMenuOpen(null); }} className="w-full px-3 py-2 rounded-lg text-left text-[13px] font-medium text-slate-200 hover:bg-fg/[0.06] transition-colors flex items-center gap-2.5">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.48 3.5l2.31 4.68 5.17.75-3.74 3.64.88 5.15-4.62-2.43-4.62 2.43.88-5.15L3.99 8.93l5.17-.75 2.32-4.68z" /></svg>
                                                    Añadir a favoritos
                                                </button>
                                            )}
                                            {isCustomSticker && (
                                                <button onClick={() => { void saveStickerToLibrary(stickerUrl); setMessageMenuOpen(null); }} className="w-full px-3 py-2 rounded-lg text-left text-[13px] font-medium text-slate-200 hover:bg-fg/[0.06] transition-colors flex items-center gap-2.5">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14" /></svg>
                                                    Añadir a mis stickers
                                                </button>
                                            )}
                                            {isMine && !isSticker && (
                                                <button onClick={() => { handleEditMessage(m); setMessageMenuOpen(null); }} className="w-full px-3 py-2 rounded-lg text-left text-[13px] font-medium text-slate-200 hover:bg-fg/[0.06] transition-colors flex items-center gap-2.5">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 00-2 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                    Editar
                                                </button>
                                            )}
                                            {isMine && (
                                                <button onClick={() => { handleDeleteMessage(m); setMessageMenuOpen(null); }} className="w-full px-3 py-2 rounded-lg text-left text-[13px] font-medium text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-2.5">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    Eliminar para todos
                                                </button>
                                            )}
                                            <button onClick={() => { handleDeleteMessageForMe(m); setMessageMenuOpen(null); }} className="w-full px-3 py-2 rounded-lg text-left text-[13px] font-medium text-slate-200 hover:bg-fg/[0.06] transition-colors flex items-center gap-2.5">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                Eliminar para mí
                                            </button>
                                        </Popover>

                                        {/* Burbuja de mensaje — un sticker va sin fondo: la imagen es la burbuja */}
                                        <div className={
                                            isSticker
                                                ? 'relative'
                                                : `px-3.5 py-2 rounded-2xl shadow-md ${isMine ? 'bg-indigo-700 text-on-accent rounded-br-md' : 'bg-slate-800 text-slate-100 rounded-bl-md'}`
                                        }>
                                            {/* Respuesta */}
                                            {m.ReplyToMessage && (
                                                <div className={`mb-1.5 px-2.5 py-1.5 rounded-lg border-l-[3px] ${isMine ? 'bg-black/15 border-on-accent/40' : 'bg-quote border-indigo-400'} text-[12px] ${isMine ? 'text-on-accent/80' : 'text-fg/80'} line-clamp-2`}>
                                                    <div className={`font-semibold text-[11px] mb-0.5 ${isMine ? 'text-on-accent/90' : 'text-indigo-300'}`}>Respuesta</div>
                                                    {replyPreviewText(m.ReplyToMessage)}
                                                </div>
                                            )}

                                            {/* Media */}
                                            <MediaContent message={m} isMine={isMine} />

                                            {/* Texto del mensaje - Ocultar si es una URL de media */}
                                            {m.Message && !isMediaUrl(m) && (
                                                <div className="text-[14.5px] leading-snug break-words whitespace-pre-wrap">
                                                    {editingMessageId === m.MessageID ? (
                                                        <div className="flex flex-col gap-2 min-w-[200px]">
                                                            <textarea 
                                                                autoFocus
                                                                value={editingMessageText}
                                                                onChange={handleEditMessageChange}
                                                                className="w-full bg-black/20 border border-fg/10 rounded-lg p-2 text-sm focus:outline-none focus:ring-1 focus:ring-fg/30"
                                                                rows={2}
                                                            />
                                                            <div className="flex justify-end gap-2">
                                                                <button onClick={handleEditMessageCancel} className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest">Cancelar</button>
                                                                <button onClick={handleEditMessageSave} className="px-2 py-1 bg-fg/20 rounded-md text-[10px] font-bold uppercase tracking-widest">Guardar</button>
                                                            </div>
                                                        </div>
                                                    ) : <HighlightedText text={m.Message} query={searchQuery} />}
                                                </div>
                                            )}

                                            {/* Info de pie de burbuja — en stickers es una píldora aparte */}
                                            {isSticker ? (
                                                <div className="mt-1 flex justify-end">
                                                    <div className="flex items-center gap-1 rounded-full bg-chip-strong px-2 py-0.5 text-[10px] text-slate-200">
                                                        <ExpiryClock expiresAt={m.ExpiresAt} />
                                                        <span>{m.Edited && 'editado · '}{time}</span>
                                                        {isMine && <MessageTicks status={m.Status} />}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="mt-0.5 -mb-0.5 flex items-center justify-end gap-1">
                                                    <span className={isMine ? 'text-on-accent/60' : 'text-slate-400'}><ExpiryClock expiresAt={m.ExpiresAt} /></span>
                                                    <span className={`text-[11px] ${isMine ? 'text-on-accent/60' : 'text-slate-400'}`}>
                                                        {m.Edited && 'editado · '}{time}
                                                    </span>
                                                    {isMine && <MessageTicks status={m.Status} />}
                                                </div>
                                            )}
                                        </div>
                                        <ReactionChips
                                            reactions={m.Reactions}
                                            onToggle={(emoji) => reactToMessage(reactionTarget, emoji)}
                                            onShowWho={() => setWhoFor(m.MessageID)}
                                            align={isMine ? 'end' : 'start'}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
            <PendingMessages items={pendingItems} />
            {fullPickerFor !== null && (
                <FullEmojiPicker
                    onClose={() => setFullPickerFor(null)}
                    onSelect={(emoji) => { reactToMessage({ kind: 'direct', messageID: fullPickerFor }, emoji); setFullPickerFor(null); }}
                />
            )}
            {whoFor !== null && (
                <ReactionsModal target={{ kind: 'direct', messageID: whoFor }} myTelephon={profile?.Telephon} onClose={() => setWhoFor(null)} />
            )}
            {/* Indicador de carga de mensajes anteriores: absoluto y al final del DOM
                (fuera del flujo y sin margen de space-y) para no mover el contenido */}
            {(focused ? focused.loadingOlder : paging?.loadingOlder) && (
                <div className="absolute inset-x-0 top-2 mt-0! z-20 flex justify-center pointer-events-none">
                    <span role="status" className="px-3 py-1 glass rounded-full text-[11px] text-slate-300 shadow-lg">
                        Cargando mensajes anteriores…
                    </span>
                </div>
            )}
        </div>
    );
};

export default MessageList;
