import {
    createContext, useContext, useState, useEffect, useRef, useCallback, useMemo,
    type ReactNode, type Dispatch, type SetStateAction,
} from 'react';
import { isAxiosError } from 'axios';
import api from '../../../api/axios';
import { getUserGroups, getGroupMessages, getGroupDetail } from '../../../api/groupApi';
import { setChatDisappearing as apiSetChatDisappearing, getChatDisappearing, setGroupDisappearing as apiSetGroupDisappearing } from '../../../api/disappearingApi';
import { useAuth, type AuthContextValue } from '../../../context/AuthContext';
import { useWebSocket } from '../../../hooks/useWebSocket';
import {
    showNativeNotification, type NotificationPermissionState,
} from '../../../utils/notifications';
import wsManager, { type WsHandlerMap } from '../../../api/websocket';
import type {
    UserGet, ContactChat, Message, ChatGroup, GroupResponse, GroupRole, GroupDetail, GroupMessageResponse, CallType,
} from '../../../types/api';
import {
    resolveChatTarget, type DashboardChatGroupEntry, type SelectedChatTarget,
} from '../lib/chatSelection';
import {
    normalizeGroupsResponse, normalizeGroupMessagesResponse, normalizeGroupDetailMessages,
    normalizeChatMessagesResponse, normalizeHasMore,
} from '../lib/normalizeResponses';
import {
    applyReaction, applyOptimisticReaction, revertMine, currentMine, enqueuePending, shiftPending, reactionsOf, toggledEmoji,
    parseReactionEvent, parseReactionErrorContext, reactionPendingKey, type PendingReactions, type ReactionBearing, type ReactionKind,
} from '../lib/reactions';
import {
    mergeLatestWindow, isContiguousWindow, prependOlder, oldestRealMessageId, newestRealMessageId, DEFAULT_PAGING, type PagingState,
} from '../lib/mergeMessages';
import {
    createFocusedWindow, refocus, windowHasMessage, extendOlder, extendNewer, updateFocusedMessages, removeFocusedMessage,
    type FocusedWindow,
} from '../lib/focusedWindow';
import {
    getChatWindowAround, getChatAfter, getChatBefore, getGroupWindowAround, getGroupAfter, getGroupBefore, WINDOW_LIMIT,
} from '../api/historyApi';
import { useNotificationClick } from '../hooks/useNotificationClick';
import { useColdStartTarget } from '../hooks/useColdStartTarget';
import type { NotificationTarget } from '../lib/notificationClick';
import { usePushSync } from '../hooks/usePushSync';
import { useGroupReceiptAcks } from '../hooks/useGroupReceiptAcks';
import {
    marksFromMembers, mergeMarks, parseGroupReceipt, applyReceiptEvent, latestRealMessageId,
    addMemberMark, removeMemberMark, type GroupReceiptsState,
} from '../lib/groupReceipts';
import {
    parseSystemMessage, parseGroupMemberRole, parseGroupMemberRemoved, parseGroupSettings, parseGroupInfo,
} from '../lib/groupAdminEvents';
import {
    normalizeDisappearSeconds, removeMessagesByIds, removeIdsFromWindow, removeExpiredMessages, removeExpiredFromWindow,
    earliestExpiry, hasUnreadFrom, isSystemDirectMessage,
} from '../lib/disappearing';
import {
    parseDisappearingChanged, parseMessagesExpired, type DisappearingChangedEvent,
} from '../lib/disappearingEvents';
import { useExpiryTimer } from '../hooks/useExpiryTimer';
import { useOutbox, type OutboxSendResult } from '../../outbox/useOutbox';
import { readClientID, type OutboxItem, type OutboxSendInput } from '../../outbox/outboxTypes';

/** Mensajes por página al cargar historial antiguo (scroll hacia arriba). */
const OLDER_PAGE_SIZE = 50;
/** Ventana inicial de /api/v1/chats y del GET /chat/:contact sin parámetros. */
const CHAT_LATEST_WINDOW = 200;
/** Ventana inicial que devuelve el detalle de grupo. */
const GROUP_DETAIL_WINDOW = 50;

export type { PagingState, FocusedWindow };

/** Chat 1:1 (`key` = telephon) o grupo (`id`) sobre el que se abre una ventana desprendida. */
export type FocusTarget = { kind: 'chat'; key: string } | { kind: 'group'; id: number };

export type SidebarView = 'chats' | 'groups' | 'contacts' | 'estados' | 'calls';

export interface Toast {
    id: number;
    type: 'error' | 'success' | 'info';
    message: string;
    createdAt: number;
}

/** Message a reaction refers to (`groupID` is required for group messages). */
export interface ReactionTarget {
    kind: ReactionKind;
    messageID: number;
    groupID?: number;
}

export interface CallState {
    roomID: string;
    remoteTelephon: string;
    remoteName: string;
    callType: CallType;
    role: 'caller' | 'receiver';
    status: 'ringing' | 'active';
}

/**
 * `GroupResponse.UserRole` is `GroupRole` ('admin'|'member') per the backend
 * contract (types/api.ts). `GroupChatWindow.tsx`'s "leave group" flow also
 * writes the client-only sentinel `'left'` into this same field on `groups`/
 * `selectedGroup` (keeps the group visible, read-only, without an extra state
 * slot). The backend contract type stays untouched (M1's policy); the
 * client-side state widens it explicitly here so that write is typed, not cast.
 */
export type LocalGroupRole = GroupRole | 'left';
export type LocalGroup = Omit<GroupResponse, 'UserRole'> & { UserRole: LocalGroupRole };
export type SelectedGroup = LocalGroup & Partial<Pick<GroupDetail, 'Members' | 'Messages'>> & {
    /**
     * Client-only: the viewer was removed by an admin (vs. leaving voluntarily).
     * The composer uses it to show the removal wording instead of the generic
     * "no longer a member" copy; it is never sent to the backend.
     */
    RemovedByAdmin?: boolean;
};

/** System messages are now server-persisted `GroupMessageResponse` rows (`Kind: 'system'`). */
export type GroupMessageEntry = GroupMessageResponse;

export interface DashboardContextValue {
    profile: UserGet | null;
    setProfile: Dispatch<SetStateAction<UserGet | null>>;
    myAvatar: string;
    setMyAvatar: Dispatch<SetStateAction<string>>;
    globalWallpaper: string;
    setGlobalWallpaper: Dispatch<SetStateAction<string>>;
    contacts: ContactChat[];
    setContacts: Dispatch<SetStateAction<ContactChat[]>>;
    onlineUsers: Set<string>;
    setOnlineUsers: Dispatch<SetStateAction<Set<string>>>;
    typingUsers: Set<string>;
    setTypingUsers: Dispatch<SetStateAction<Set<string>>>;
    lastSeenMap: Record<string, string>;
    setLastSeenMap: Dispatch<SetStateAction<Record<string, string>>>;
    avatarMap: Record<string, string>;
    setAvatarMap: Dispatch<SetStateAction<Record<string, string>>>;
    selected: SelectedChatTarget | null;
    setSelected: (
        contactOrUpdater: SelectedChatTarget | null | ((prev: SelectedChatTarget | null) => SelectedChatTarget | null)
    ) => void;
    messagesByChat: Record<string, Message[]>;
    setMessagesByChat: Dispatch<SetStateAction<Record<string, Message[]>>>;
    allChatGroups: Record<string, DashboardChatGroupEntry>;
    setAllChatGroups: Dispatch<SetStateAction<Record<string, DashboardChatGroupEntry>>>;
    drafts: Record<string, string>;
    setDrafts: Dispatch<SetStateAction<Record<string, string>>>;
    toasts: Toast[];
    addToast: (toast: Omit<Toast, 'id' | 'createdAt'>) => void;
    dismissToast: (id: number) => void;
    notifPermission: NotificationPermissionState;
    setNotifPermission: Dispatch<SetStateAction<NotificationPermissionState>>;
    requestNotificationPermission: () => Promise<NotificationPermission>;
    callState: CallState | null;
    setCallState: Dispatch<SetStateAction<CallState | null>>;
    incomingCall: WsHandlerMap['incoming_call'] | null;
    setIncomingCall: Dispatch<SetStateAction<WsHandlerMap['incoming_call'] | null>>;
    sidebarView: SidebarView;
    setSidebarView: Dispatch<SetStateAction<SidebarView>>;
    sidebarOpen: boolean;
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
    fetchContacts: () => Promise<void>;
    fetchProfile: () => Promise<void>;
    fetchAllChats: () => Promise<void>;
    fetchChatMessages: (contactNumber: string) => Promise<void>;
    /** Estado de paginación por chat 1:1 (hasMore / loadingOlder). */
    chatPaging: Record<string, PagingState>;
    /** Carga la página anterior de un chat 1:1 (cursor = id del mensaje más antiguo). */
    loadOlderMessages: (contactNumber: string) => Promise<void>;
    markAsRead: (contactNumber: string) => void;
    /** Per-chat disappearing timer in seconds, keyed by the other participant's telephon (0 = off, absent = unknown). */
    chatDisappear: Record<string, number>;
    /** Timer (seconds) of the selected chat or group; 0 when off or not yet known. */
    selectedDisappearSeconds: number;
    /**
     * Sets the 1:1 timer through the REST API and applies the result through the same
     * path as the WS `disappearing_changed` event (idempotent). false (+ error toast) on failure.
     */
    setChatDisappearing: (contact: string, seconds: number) => Promise<boolean>;
    /** Group counterpart of `setChatDisappearing` (same permission as editing the group info). */
    setGroupDisappearing: (groupID: number, seconds: number) => Promise<boolean>;
    groups: LocalGroup[];
    setGroups: Dispatch<SetStateAction<LocalGroup[]>>;
    groupMessages: Record<number, GroupMessageEntry[]>;
    setGroupMessages: Dispatch<SetStateAction<Record<number, GroupMessageEntry[]>>>;
    selectedGroup: SelectedGroup | null;
    setSelectedGroup: (
        groupOrUpdater: SelectedGroup | null | ((prev: SelectedGroup | null) => SelectedGroup | null)
    ) => void;
    fetchUserGroups: () => Promise<void>;
    fetchGroupMessages: (groupID: number) => Promise<void>;
    fetchGroupDetail: (groupID: number) => Promise<void>;
    /** Estado de paginación por grupo (hasMore / loadingOlder). */
    groupPaging: Record<number, PagingState>;
    /** Carga la página anterior de un grupo (cursor = id del mensaje real más antiguo). */
    loadOlderGroupMessages: (groupID: number) => Promise<void>;
    /**
     * Ventanas desprendidas (buscar → "ir al mensaje"): tramos del historial que NO están
     * en messagesByChat / groupMessages para no romper su paginación anclada al último mensaje.
     */
    focusedChat: Record<string, FocusedWindow<Message>>;
    focusedGroup: Record<number, FocusedWindow<GroupMessageResponse>>;
    /** Abre (o re-apunta) la ventana desprendida en un mensaje; false si no se pudo abrir. */
    openMessageAt: (target: FocusTarget, messageId: number) => Promise<boolean>;
    /** Carga la página anterior / posterior de la ventana desprendida. */
    loadOlderFocused: (target: FocusTarget) => Promise<void>;
    loadNewerFocused: (target: FocusTarget) => Promise<void>;
    /** Descarta la ventana desprendida y vuelve a la lista normal (los últimos mensajes). */
    returnToLatest: (target: FocusTarget) => void;
    isConnected: boolean;
    sendMessage: ReturnType<typeof useWebSocket>['sendMessage'];
    sendTypingIndicator: ReturnType<typeof useWebSocket>['sendTypingIndicator'];
    sendGroupMessage: ReturnType<typeof useWebSocket>['sendGroupMessage'];
    sendGroupTyping: ReturnType<typeof useWebSocket>['sendGroupTyping'];
    sendGroupEditMessage: ReturnType<typeof useWebSocket>['sendGroupEditMessage'];
    sendGroupDeleteMessage: ReturnType<typeof useWebSocket>['sendGroupDeleteMessage'];
    sendGroupJoin: ReturnType<typeof useWebSocket>['sendGroupJoin'];
    /**
     * Reacts to a message with `emoji`; tapping my current emoji removes it. Optimistic: the
     * chips update at once and roll back if the server answers a WS `error` for that react.
     */
    reactToMessage: (target: ReactionTarget, emoji: string) => void;
    /** groupID -> telephon -> receipt watermarks (fed by group detail and `group_receipt`). */
    groupReceipts: GroupReceiptsState;
    /**
     * groupID -> telephon -> username, cached from member lists and admin events so
     * system messages can name a target that already left (it is gone from Members).
     */
    groupMemberNames: Record<number, Record<string, string>>;
    /**
     * Offline outbox (PW9): own text messages not yet acknowledged by the server.
     * `pending` = queued (clock icon), `failed` = dropped after a permanent error.
     */
    outboxItems: readonly OutboxItem[];
    /**
     * Sends a text message with a fresh clientID: right away when online, otherwise
     * queued in the outbox and flushed in order when the WebSocket opens.
     */
    sendText: (input: OutboxSendInput) => Promise<OutboxSendResult>;
    user: AuthContextValue['user'];
    /** Clears this user's outbox, then logs out. */
    logout: AuthContextValue['logout'];
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export const useDashboard = (): DashboardContextValue => {
    const context = useContext(DashboardContext);
    if (!context) {
        throw new Error('useDashboard must be used within a DashboardProvider');
    }
    return context;
};

/**
 * Paging state after a "latest window" fetch: if older pages were already
 * loaded their hasMore stays authoritative; otherwise use the fetched value.
 */
const windowPaging = (prev: PagingState | undefined, hasMore: boolean, contiguous = true): PagingState => (
    prev?.olderLoaded && contiguous
        ? prev
        : { hasMore, loadingOlder: prev?.loadingOlder ?? false, olderLoaded: false }
);

const focusKey = (target: FocusTarget): string => (
    target.kind === 'chat' ? `chat:${target.key}` : `group:${target.id}`
);

/** `X-Has-More: true|false` (backend 1:1 history); undefined when absent (e.g. not exposed). */
const readHasMoreHeader = (headers: unknown): boolean | undefined => {
    if (!headers || typeof headers !== 'object') return undefined;
    const raw = (headers as Record<string, unknown>)['x-has-more'];
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return undefined;
};

type ListMapper = <T extends ReactionBearing>(list: T[]) => T[];

/** Applies a list reducer to a detached window; same object when nothing changed. */
const mapWindow = <T extends ReactionBearing>(w: FocusedWindow<T>, fn: ListMapper): FocusedWindow<T> => {
    const messages = fn(w.messages);
    return messages === w.messages ? w : { ...w, messages };
};

export const DashboardProvider = ({ children }: { children: ReactNode }) => {
    const { user, logout } = useAuth();
    const {
        isConnected, on, off,
        sendMessage, sendReadConfirmation, sendTypingIndicator,
        sendGroupMessage, sendGroupTyping, sendGroupEditMessage, sendGroupDeleteMessage,
        sendGroupJoin, sendGroupDelivered, sendGroupRead,
    } = useWebSocket();

    // Profile & User State
    const [profile, setProfile] = useState<UserGet | null>(null);
    const [myAvatar, setMyAvatar] = useState('');
    const [globalWallpaper, setGlobalWallpaper] = useState('');

    // Contacts & Presence
    const [contacts, setContacts] = useState<ContactChat[]>([]);
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
    const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
    const [lastSeenMap, setLastSeenMap] = useState<Record<string, string>>({});
    const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});

    // Messaging — 1-to-1
    const [selected, setSelected] = useState<SelectedChatTarget | null>(null);
    const [messagesByChat, setMessagesByChat] = useState<Record<string, Message[]>>({});
    const [allChatGroups, setAllChatGroups] = useState<Record<string, DashboardChatGroupEntry>>({});
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [chatPaging, setChatPaging] = useState<Record<string, PagingState>>({});
    const [chatDisappear, setChatDisappear] = useState<Record<string, number>>({});

    // Groups
    const [groups, setGroups] = useState<LocalGroup[]>([]);
    const [groupMessages, setGroupMessages] = useState<Record<number, GroupMessageEntry[]>>({}); // { [groupID]: GroupMessageResponse[] }
    const [groupPaging, setGroupPaging] = useState<Record<number, PagingState>>({});
    const [groupReceipts, setGroupReceipts] = useState<GroupReceiptsState>({});
    const [groupMemberNames, setGroupMemberNames] = useState<Record<number, Record<string, string>>>({});
    // Ventanas desprendidas (ver DashboardContextValue.focusedChat)
    const [focusedChat, setFocusedChat] = useState<Record<string, FocusedWindow<Message>>>({});
    const [focusedGroup, setFocusedGroup] = useState<Record<number, FocusedWindow<GroupMessageResponse>>>({});
    const [selectedGroup, setSelectedGroupState] = useState<SelectedGroup | null>(null);

    /**
     * Selecciona un grupo y limpia la selección 1:1 (son excluyentes).
     * Acepta también una función updater, que solo modifica el grupo actual.
     */
    const setSelectedGroup = useCallback((
        groupOrUpdater: SelectedGroup | null | ((prev: SelectedGroup | null) => SelectedGroup | null)
    ) => {
        if (typeof groupOrUpdater === 'function') {
            setSelectedGroupState(groupOrUpdater);
            return;
        }
        setSelectedGroupState(groupOrUpdater);
        if (groupOrUpdater) setSelected(null);
    }, []);

    /** Selecciona un chat 1:1 y limpia el grupo seleccionado (acepta updater). */
    const setSelectedContact = useCallback((
        contactOrUpdater: SelectedChatTarget | null | ((prev: SelectedChatTarget | null) => SelectedChatTarget | null)
    ) => {
        if (typeof contactOrUpdater === 'function') {
            setSelected(contactOrUpdater);
            return;
        }
        setSelected(contactOrUpdater);
        if (contactOrUpdater) setSelectedGroupState(null);
    }, []);

    // Notifications & Toasts
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [notifPermission, setNotifPermission] = useState<NotificationPermissionState>(
        typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
    );

    // Calls
    const [callState, setCallState] = useState<CallState | null>(null);
    const [incomingCall, setIncomingCall] = useState<WsHandlerMap['incoming_call'] | null>(null);

    // UI state (sidebar view & mobile open)
    const [sidebarView, setSidebarView] = useState<SidebarView>('chats');
    const [sidebarOpen, setSidebarOpen] = useState(true); // show sidebar by default

    // Toast functions
    const addToast = useCallback((toast: Omit<Toast, 'id' | 'createdAt'>) => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { ...toast, id, createdAt: Date.now() }]);
    }, []);

    const dismissToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const requestNotificationPermission = useCallback(async (): Promise<NotificationPermission> => {
        if (!('Notification' in window)) return 'denied';
        const permission = await Notification.requestPermission();
        setNotifPermission(permission);
        return permission;
    }, []);

    // Función para marcar como leídos: envía WS + actualiza estado local
    const markAsRead = useCallback((contactNumber: string) => {
        sendReadConfirmation(contactNumber);
        // Actualización optimista: marcar todos los mensajes entrantes como 'visto' localmente
        setMessagesByChat(prev => {
            const msgs = prev[contactNumber];
            if (!msgs) return prev;
            if (!hasUnreadFrom(msgs, contactNumber)) return prev;
            const updated = msgs.map(m =>
                m.SenderTelephon === contactNumber && m.Status !== 'visto'
                    ? { ...m, Status: 'visto' as const }
                    : m
            );
            return { ...prev, [contactNumber]: updated };
        });
    }, [sendReadConfirmation]);

    // Refs for WebSocket handlers to avoid stale closures
    const contactsRef = useRef<ContactChat[]>([]);
    const profileRef = useRef<UserGet | null>(null);
    const selectedRef = useRef<SelectedChatTarget | null>(null);
    const allChatGroupsRef = useRef<Record<string, DashboardChatGroupEntry>>({});

    useEffect(() => { contactsRef.current = contacts; }, [contacts]);
    useEffect(() => { profileRef.current = profile; }, [profile]);
    useEffect(() => { selectedRef.current = selected; }, [selected]);
    useEffect(() => { allChatGroupsRef.current = allChatGroups; }, [allChatGroups]);
    const avatarMapRef = useRef<Record<string, string>>({});
    useEffect(() => { avatarMapRef.current = avatarMap; }, [avatarMap]);
    const selectedGroupRef = useRef<SelectedGroup | null>(null);
    useEffect(() => { selectedGroupRef.current = selectedGroup; }, [selectedGroup]);
    const groupMemberNamesRef = useRef<Record<number, Record<string, string>>>({});
    useEffect(() => { groupMemberNamesRef.current = groupMemberNames; }, [groupMemberNames]);
    const selfTelephonRef = useRef<string | undefined>(user?.telephon);
    useEffect(() => { selfTelephonRef.current = user?.telephon; }, [user?.telephon]);
    const outbox = useOutbox({ owner: user?.telephon || null, connected: isConnected });
    const { ack: outboxAck, handleError: outboxHandleError, reconcile: outboxReconcile, clear: clearOutbox } = outbox;
    // Cursor/estado de paginación leídos por loadOlder* sin recrear los callbacks.
    const messagesByChatRef = useRef<Record<string, Message[]>>({});
    const groupMessagesRef = useRef<Record<number, GroupMessageEntry[]>>({});
    const chatPagingRef = useRef<Record<string, PagingState>>({});
    const groupPagingRef = useRef<Record<number, PagingState>>({});
    const focusedChatRef = useRef<Record<string, FocusedWindow<Message>>>({});
    const focusedGroupRef = useRef<Record<number, FocusedWindow<GroupMessageResponse>>>({});
    // Época de la ventana por chat/grupo: sube solo cuando la ventana se reemplaza o se
    // descarta (nunca al *empezar* una apertura); las cargas de página capturan la época al
    // empezar y descartan su respuesta si cambió. Una apertura que falla no la toca, así la
    // ventana original conserva sus cargas en curso y sus flags de loading se limpian solos.
    const focusEpochRef = useRef<Map<string, number>>(new Map());
    // Petición de apertura vigente por chat/grupo: sube al abrir, re-enfocar, volver a lo
    // reciente o salir del chat; una apertura cuya petición ya no es la vigente se descarta.
    const openSeqRef = useRef<Map<string, number>>(new Map());
    useEffect(() => { messagesByChatRef.current = messagesByChat; }, [messagesByChat]);
    useEffect(() => { groupMessagesRef.current = groupMessages; }, [groupMessages]);
    useEffect(() => { chatPagingRef.current = chatPaging; }, [chatPaging]);
    useEffect(() => { groupPagingRef.current = groupPaging; }, [groupPaging]);
    useEffect(() => { focusedChatRef.current = focusedChat; }, [focusedChat]);
    useEffect(() => { focusedGroupRef.current = focusedGroup; }, [focusedGroup]);
    const chatDisappearRef = useRef<Record<string, number>>({});
    useEffect(() => { chatDisappearRef.current = chatDisappear; }, [chatDisappear]);
    // Acuses de grupo del cliente: entrega (agrupada) y lectura (throttled) del grupo abierto.
    const { noteIncomingGroupMessage } = useGroupReceiptAcks({
        selfTelephon: user?.telephon,
        isConnected,
        openGroupId: selectedGroup && selectedGroup.UserRole !== 'left' ? selectedGroup.ID : null,
        openGroupMessages: selectedGroup ? groupMessages[selectedGroup.ID] : undefined,
        sendGroupDelivered,
        sendGroupRead,
    });
    // Cargas de páginas antiguas en curso (evita peticiones duplicadas por scroll repetido).
    const loadingOlderRef = useRef<Set<string>>(new Set());

    // Fetch initial data
    const fetchProfile = useCallback(async () => {
        try {
            // El cuerpo puede llegar vacío/null (204, sesión recién creada);
            // `data?.` restaura la tolerancia que tenía la versión JS.
            const { data } = await api.get<UserGet | null>('/api/v1/user');
            setProfile(data);
            if (data?.avatar_url) setMyAvatar(data.avatar_url);
            if (data?.wallpaper_url) setGlobalWallpaper(data.wallpaper_url);
        } catch (err) {
            console.error('Error fetching profile:', err);
        }
    }, []);

    const fetchContacts = useCallback(async () => {
        try {
            const { data } = await api.get<ContactChat[]>('/api/v1/contact');
            const list = Array.isArray(data) ? data : [];
            setContacts(list);

            const seenMap: Record<string, string> = {};
            const avMap: Record<string, string> = {};
            list.forEach(c => {
                if (c.last_seen) seenMap[c.Number] = c.last_seen;
                if (c.avatar_url) avMap[c.Number] = c.avatar_url;
            });
            setLastSeenMap(prev => ({ ...prev, ...seenMap }));
            setAvatarMap(prev => ({ ...prev, ...avMap }));
        } catch (err) {
            console.error('Error fetching contacts:', err);
        }
    }, []);

    // Cargar todos los chats (historial de mensajes) desde el backend
    const fetchAllChats = useCallback(async () => {
        try {
            const { data } = await api.get<ChatGroup[]>('/api/v1/chats');
            const chatGroups = Array.isArray(data) ? data : [];

            // Poblar messagesByChat con los mensajes de cada grupo
            const msgMap: Record<string, Message[]> = {};
            const groupMap: Record<string, DashboardChatGroupEntry> = {};
            const chatAvatarMap: Record<string, string> = {};
            const timers: Record<string, number> = {};
            chatGroups.forEach(group => {
                const key = group.ContactTelephon;
                if (key) {
                    timers[key] = normalizeDisappearSeconds(group.DisappearSeconds);
                    msgMap[key] = Array.isArray(group.Messages) ? group.Messages : [];
                    groupMap[key] = {
                        ContactTelephon: group.ContactTelephon,
                        ContactUsername: group.ContactUsername,
                        ContactName: group.ContactName,
                        IsContact: group.IsContact,
                    };
                    // Guardar avatar de todos los participantes (incluidos no-contactos)
                    if (group.ContactAvatarUrl) {
                        chatAvatarMap[key] = group.ContactAvatarUrl;
                    }
                }
            });
            // Mezclar con lo ya cargado: las páginas antiguas no se pierden al re-sincronizar.
            // Si llegaron más mensajes que una ventana, el bloque antiguo se descarta
            // y el paginado se reinicia desde la ventana nueva (sin huecos).
            const loadedChats = messagesByChatRef.current;
            const windowMore: Record<string, boolean> = {};
            const contiguousChats: Record<string, boolean> = {};
            Object.entries(msgMap).forEach(([key, fresh]) => {
                windowMore[key] = fresh.length >= CHAT_LATEST_WINDOW;
                contiguousChats[key] = isContiguousWindow(loadedChats[key], fresh, windowMore[key]);
            });
            setMessagesByChat(prev => {
                const merged: Record<string, Message[]> = {};
                Object.entries(msgMap).forEach(([key, fresh]) => {
                    merged[key] = mergeLatestWindow(prev[key], fresh, windowMore[key]);
                });
                return merged;
            });
            setChatPaging(prev => {
                const next: Record<string, PagingState> = {};
                Object.entries(msgMap).forEach(([key]) => {
                    next[key] = windowPaging(prev[key], windowMore[key] ?? false, contiguousChats[key]);
                });
                return next;
            });
            setAllChatGroups(groupMap);
            setChatDisappear(prev => ({ ...prev, ...timers }));
            // Merge avatares de chats al avatarMap (contactos tienen prioridad, no sobreescribir)
            setAvatarMap(prev => ({ ...chatAvatarMap, ...prev }));
        } catch (err) {
            console.error('Error fetching all chats:', err);
        }
    }, []);

    // Cargar mensajes de un contacto específico (bajo demanda)
    const fetchChatMessages = useCallback(async (contactNumber: string) => {
        try {
            const { data, headers } = await api.get<unknown>(`/api/v1/chat/${contactNumber}`);
            const messages = normalizeChatMessagesResponse(data);
            const hasMore = readHasMoreHeader(headers) ?? messages.length >= CHAT_LATEST_WINDOW;
            const contiguous = isContiguousWindow(messagesByChatRef.current[contactNumber], messages, hasMore);
            setMessagesByChat(prev => ({ ...prev, [contactNumber]: mergeLatestWindow(prev[contactNumber], messages, hasMore) }));
            setChatPaging(prev => ({ ...prev, [contactNumber]: windowPaging(prev[contactNumber], hasMore, contiguous) }));
        } catch (err) {
            console.error(`Error fetching messages for ${contactNumber}:`, err);
        }
    }, []);

    // Cargar la página anterior de un chat 1:1 (scroll hacia arriba).
    const loadOlderMessages = useCallback(async (contactNumber: string) => {
        const guardKey = `chat:${contactNumber}`;
        const paging = chatPagingRef.current[contactNumber];
        const before = oldestRealMessageId(messagesByChatRef.current[contactNumber]);
        if (!paging?.hasMore || before === null || loadingOlderRef.current.has(guardKey)) return;

        loadingOlderRef.current.add(guardKey);
        setChatPaging(prev => ({ ...prev, [contactNumber]: { ...(prev[contactNumber] ?? DEFAULT_PAGING), loadingOlder: true } }));
        try {
            const { data, headers } = await api.get<unknown>(`/api/v1/chat/${contactNumber}`, {
                params: { before, limit: OLDER_PAGE_SIZE },
            });
            const older = normalizeChatMessagesResponse(data);
            const hasMore = older.length > 0 && (readHasMoreHeader(headers) ?? older.length >= OLDER_PAGE_SIZE);
            // Refs al día en el acto: el guard se libera en `finally` antes de que el
            // efecto los refresque y un segundo scroll repetiría el mismo cursor.
            messagesByChatRef.current = { ...messagesByChatRef.current, [contactNumber]: prependOlder(messagesByChatRef.current[contactNumber], older) };
            chatPagingRef.current = { ...chatPagingRef.current, [contactNumber]: { hasMore, loadingOlder: false, olderLoaded: true } };
            setMessagesByChat(prev => ({ ...prev, [contactNumber]: prependOlder(prev[contactNumber], older) }));
            setChatPaging(prev => ({ ...prev, [contactNumber]: { hasMore, loadingOlder: false, olderLoaded: true } }));
        } catch (err) {
            console.error(`Error loading older messages for ${contactNumber}:`, err);
            setChatPaging(prev => ({ ...prev, [contactNumber]: { ...(prev[contactNumber] ?? DEFAULT_PAGING), loadingOlder: false } }));
        } finally {
            loadingOlderRef.current.delete(guardKey);
        }
    }, []);

    // Fetch groups belonging to the current user
    const fetchUserGroups = useCallback(async () => {
        try {
            const { data } = await getUserGroups();
            setGroups(normalizeGroupsResponse(data));
        } catch (err) {
            console.error('Error fetching groups:', err);
        }
    }, []);

    // Fetch message history for a specific group (on demand)
    const fetchGroupMessages = useCallback(async (groupID: number) => {
        try {
            const { data } = await getGroupMessages(groupID);
            const messages = normalizeGroupMessagesResponse(data);
            const hasMore = normalizeHasMore(data) ?? messages.length >= GROUP_DETAIL_WINDOW;
            const contiguous = isContiguousWindow(groupMessagesRef.current[groupID], messages, hasMore);
            setGroupMessages(prev => ({ ...prev, [groupID]: mergeLatestWindow<GroupMessageEntry>(prev[groupID], messages, hasMore) }));
            setGroupPaging(prev => ({ ...prev, [groupID]: windowPaging(prev[groupID], hasMore, contiguous) }));
        } catch (err) {
            console.error(`Error fetching messages for group ${groupID}:`, err);
        }
    }, []);

    // Cargar la página anterior de un grupo (scroll hacia arriba). Los eventos de
    // sistema persistidos son mensajes reales (id numérico) y también son cursor;
    // oldestRealMessageId ignora cualquier entrada sin id numérico.
    const loadOlderGroupMessages = useCallback(async (groupID: number) => {
        const guardKey = `group:${groupID}`;
        const paging = groupPagingRef.current[groupID];
        const before = oldestRealMessageId(groupMessagesRef.current[groupID]);
        if (!paging?.hasMore || before === null || loadingOlderRef.current.has(guardKey)) return;

        loadingOlderRef.current.add(guardKey);
        setGroupPaging(prev => ({ ...prev, [groupID]: { ...(prev[groupID] ?? DEFAULT_PAGING), loadingOlder: true } }));
        try {
            const { data } = await getGroupMessages(groupID, OLDER_PAGE_SIZE, 0, before);
            const older = normalizeGroupMessagesResponse(data);
            const hasMore = older.length > 0 && (normalizeHasMore(data) ?? older.length >= OLDER_PAGE_SIZE);
            // Refs al día en el acto (ver loadOlderMessages).
            groupMessagesRef.current = { ...groupMessagesRef.current, [groupID]: prependOlder<GroupMessageEntry>(groupMessagesRef.current[groupID], older) };
            groupPagingRef.current = { ...groupPagingRef.current, [groupID]: { hasMore, loadingOlder: false, olderLoaded: true } };
            setGroupMessages(prev => ({ ...prev, [groupID]: prependOlder<GroupMessageEntry>(prev[groupID], older) }));
            setGroupPaging(prev => ({ ...prev, [groupID]: { hasMore, loadingOlder: false, olderLoaded: true } }));
        } catch (err) {
            console.error(`Error loading older messages for group ${groupID}:`, err);
            setGroupPaging(prev => ({ ...prev, [groupID]: { ...(prev[groupID] ?? DEFAULT_PAGING), loadingOlder: false } }));
        } finally {
            loadingOlderRef.current.delete(guardKey);
        }
    }, []);

    // ── Ventanas desprendidas (buscar → "ir al mensaje") ────────────────────────
    // Escriben ref y estado con la misma función pura: el ref permite coalescer cargas
    // en el acto y el updater funcional convive con los handlers WS que también actualizan.
    const patchFocusedChat = useCallback((key: string, fn: (w: FocusedWindow<Message>) => FocusedWindow<Message> | null) => {
        const apply = (rec: Record<string, FocusedWindow<Message>>) => {
            const cur = rec[key];
            if (!cur) return rec;
            const next = fn(cur);
            if (next === cur) return rec;
            const out = { ...rec };
            if (next) out[key] = next; else delete out[key];
            return out;
        };
        focusedChatRef.current = apply(focusedChatRef.current);
        setFocusedChat(apply);
    }, []);

    const patchFocusedGroup = useCallback((id: number, fn: (w: FocusedWindow<GroupMessageResponse>) => FocusedWindow<GroupMessageResponse> | null) => {
        const apply = (rec: Record<number, FocusedWindow<GroupMessageResponse>>) => {
            const cur = rec[id];
            if (!cur) return rec;
            const next = fn(cur);
            if (next === cur) return rec;
            const out = { ...rec };
            if (next) out[id] = next; else delete out[id];
            return out;
        };
        focusedGroupRef.current = apply(focusedGroupRef.current);
        setFocusedGroup(apply);
    }, []);

    const putFocusedChat = useCallback((key: string, win: FocusedWindow<Message>) => {
        const apply = (rec: Record<string, FocusedWindow<Message>>) => ({ ...rec, [key]: win });
        focusedChatRef.current = apply(focusedChatRef.current);
        setFocusedChat(apply);
    }, []);

    const putFocusedGroup = useCallback((id: number, win: FocusedWindow<GroupMessageResponse>) => {
        const apply = (rec: Record<number, FocusedWindow<GroupMessageResponse>>) => ({ ...rec, [id]: win });
        focusedGroupRef.current = apply(focusedGroupRef.current);
        setFocusedGroup(apply);
    }, []);

    // ── Mensajes temporales ─────────────────────────────────────────────────────
    /** Appends a server-persisted group system message, deduping by its server id. */
    const appendSystemMessage = useCallback((groupID: number, msg: GroupMessageResponse | undefined) => {
        if (!msg) return;
        setGroupMessages(prev => {
            const list = prev[groupID] ?? [];
            if (list.some(m => m.MessageID === msg.MessageID)) return prev;
            return { ...prev, [groupID]: [...list, msg] };
        });
    }, []);

    /** 1:1 counterpart: appends the persisted system message to the chat list, deduping by id. */
    const appendDirectSystemMessage = useCallback((chatKey: string, msg: Message | undefined) => {
        if (!msg) return;
        setMessagesByChat(prev => {
            const list = prev[chatKey] ?? [];
            if (list.some(m => m.MessageID === msg.MessageID)) return prev;
            return { ...prev, [chatKey]: [...list, msg] };
        });
        setAllChatGroups(prev => {
            if (prev[chatKey]) return prev;
            const isContact = contactsRef.current.some(c => c.Number === chatKey);
            return {
                ...prev,
                [chatKey]: { ContactTelephon: chatKey, ContactUsername: chatKey, ContactName: '', IsContact: isContact },
            };
        });
    }, []);

    /**
     * Single entry point for a timer change, shared by the WS `disappearing_changed` event and
     * the REST result of the actor: both carry the same envelope, so applying it twice is a no-op
     * (the timer is idempotent and the system message dedupes by its server id).
     */
    const applyDisappearingChanged = useCallback((event: DisappearingChangedEvent) => {
        if (event.kind === 'direct') {
            setChatDisappear(prev => (prev[event.key] === event.seconds ? prev : { ...prev, [event.key]: event.seconds }));
            appendDirectSystemMessage(event.key, event.systemMessage);
            return;
        }
        const patch = { DisappearSeconds: event.seconds };
        setGroups(prev => prev.map(g => (g.ID === event.key ? { ...g, ...patch } : g)));
        setSelectedGroupState(prev => (prev?.ID === event.key ? { ...prev, ...patch } : prev));
        appendSystemMessage(event.key, event.systemMessage);
    }, [appendDirectSystemMessage, appendSystemMessage]);

    /** Removes messages by id (server `messages_expired`) from the normal list AND the detached window. */
    const removeExpiredIds = useCallback((kind: 'direct' | 'group', key: string | number, messageIDs: readonly number[]) => {
        const idSet: ReadonlySet<number> = new Set(messageIDs);
        if (kind === 'direct' && typeof key === 'string') {
            setMessagesByChat(prev => {
                const list = prev[key];
                if (!list) return prev;
                const next = removeMessagesByIds(list, idSet);
                return next === list ? prev : { ...prev, [key]: next };
            });
            patchFocusedChat(key, w => removeIdsFromWindow(w, idSet));
        } else if (kind === 'group' && typeof key === 'number') {
            setGroupMessages(prev => {
                const list = prev[key];
                if (!list) return prev;
                const next = removeMessagesByIds(list, idSet);
                return next === list ? prev : { ...prev, [key]: next };
            });
            patchFocusedGroup(key, w => removeIdsFromWindow(w, idSet));
        }
    }, [patchFocusedChat, patchFocusedGroup]);

    /** Local expiry sweep: drops every loaded message with `now >= ExpiresAt` (lists and windows). */
    const sweepExpired = useCallback((now: number) => {
        const sweepRecord = <T extends { MessageID: number | string; Time: string; ExpiresAt?: string; ReplyToMessageID?: number; ReplyToTelephon?: string; ReplyToMessage?: string }, K extends string | number>(
            prev: Record<K, T[]>,
        ): Record<K, T[]> => {
            let out = prev;
            for (const key of Object.keys(prev) as unknown as K[]) {
                const list = prev[key];
                const next = removeExpiredMessages(list, now);
                if (next === list) continue;
                if (out === prev) out = { ...prev };
                out[key] = next;
            }
            return out;
        };
        setMessagesByChat(sweepRecord);
        setGroupMessages(sweepRecord);
        for (const key of Object.keys(focusedChatRef.current)) patchFocusedChat(key, w => removeExpiredFromWindow(w, now));
        for (const id of Object.keys(focusedGroupRef.current).map(Number)) patchFocusedGroup(id, w => removeExpiredFromWindow(w, now));
    }, [patchFocusedChat, patchFocusedGroup]);

    // One timeout for the earliest ExpiresAt among everything loaded (all chats, groups, windows).
    const earliestExpiresAt = useMemo(() => earliestExpiry([
        ...Object.values(messagesByChat),
        ...Object.values(groupMessages),
        ...Object.values(focusedChat).map(w => w.messages),
        ...Object.values(focusedGroup).map(w => w.messages),
    ]), [messagesByChat, groupMessages, focusedChat, focusedGroup]);
    useExpiryTimer({ earliest: earliestExpiresAt, onExpire: sweepExpired });

    const reportDisappearingFailure = useCallback(() => {
        addToast({ type: 'error', message: 'No se pudo cambiar los mensajes temporales' });
    }, [addToast]);

    const setChatDisappearing = useCallback(async (contact: string, seconds: number): Promise<boolean> => {
        try {
            const event = await apiSetChatDisappearing(contact, seconds);
            if (!event) { reportDisappearingFailure(); return false; }
            applyDisappearingChanged(event);
            return true;
        } catch (err) {
            console.error(`Error setting disappearing messages for ${contact}:`, err);
            reportDisappearingFailure();
            return false;
        }
    }, [applyDisappearingChanged, reportDisappearingFailure]);

    const setGroupDisappearing = useCallback(async (groupID: number, seconds: number): Promise<boolean> => {
        try {
            const event = await apiSetGroupDisappearing(groupID, seconds);
            if (!event) { reportDisappearingFailure(); return false; }
            applyDisappearingChanged(event);
            return true;
        } catch (err) {
            console.error(`Error setting disappearing messages for group ${groupID}:`, err);
            reportDisappearingFailure();
            return false;
        }
    }, [applyDisappearingChanged, reportDisappearingFailure]);

    // Timer of a chat that has no value yet (e.g. a chat without messages in /chats): ask once on open.
    const selectedChatNumber = selected?.Number;
    useEffect(() => {
        if (!selectedChatNumber || chatDisappearRef.current[selectedChatNumber] !== undefined) return;
        let cancelled = false;
        getChatDisappearing(selectedChatNumber)
            .then(seconds => {
                if (cancelled || seconds === null) return;
                setChatDisappear(prev => (prev[selectedChatNumber] !== undefined ? prev : { ...prev, [selectedChatNumber]: seconds }));
            })
            .catch(err => console.error(`Error fetching settings for ${selectedChatNumber}:`, err));
        return () => { cancelled = true; };
    }, [selectedChatNumber]);

    // ── Reacciones ──────────────────────────────────────────────────────────────
    // Las reacciones viajan dentro de cada mensaje; el mismo reducer puro se aplica a la lista
    // normal y a la ventana desprendida del chat. Un mensaje 1:1 se busca por id en todos los
    // chats (el evento no trae el contacto cuando el actor soy yo).
    const mapReactionContainers = useCallback((kind: ReactionKind, groupID: number | undefined, fn: ListMapper) => {
        if (kind === 'group') {
            if (groupID === undefined) return;
            setGroupMessages(prev => {
                const list = prev[groupID];
                if (!list) return prev;
                const next = fn(list);
                return next === list ? prev : { ...prev, [groupID]: next };
            });
            patchFocusedGroup(groupID, w => mapWindow(w, fn));
            return;
        }
        setMessagesByChat(prev => {
            let out = prev;
            for (const [key, list] of Object.entries(prev)) {
                const next = fn(list);
                if (next === list) continue;
                if (out === prev) out = { ...prev };
                out[key] = next;
            }
            return out;
        });
        for (const key of Object.keys(focusedChatRef.current)) patchFocusedChat(key, w => mapWindow(w, fn));
    }, [patchFocusedChat, patchFocusedGroup]);

    /** Per-message FIFO of my unconfirmed reaction sends (each remembers my previous emoji). */
    const pendingReactionsRef = useRef<PendingReactions>(new Map());

    const reactToMessage = useCallback((target: ReactionTarget, tapped: string) => {
        const { kind, messageID, groupID } = target;
        if (kind === 'group' && groupID === undefined) return;
        const lists: ReactionBearing[][] = [];
        if (kind === 'group' && groupID !== undefined) {
            const normal = groupMessagesRef.current[groupID];
            const focused = focusedGroupRef.current[groupID];
            if (normal) lists.push(normal);
            if (focused) lists.push(focused.messages);
        } else {
            lists.push(...Object.values(messagesByChatRef.current));
            lists.push(...Object.values(focusedChatRef.current).map(w => w.messages));
        }
        const current = reactionsOf(lists, messageID);
        const emoji = toggledEmoji(current, tapped);
        const prevMine = currentMine(current);
        mapReactionContainers(kind, groupID, list => applyOptimisticReaction(list, messageID, emoji));
        if (wsManager.sendReaction(kind, messageID, emoji, groupID)) {
            enqueuePending(pendingReactionsRef.current, reactionPendingKey(kind, messageID), prevMine, Date.now());
        } else {
            mapReactionContainers(kind, groupID, list => revertMine(list, messageID, prevMine));
            addToast({ type: 'error', message: 'No se pudo enviar la reacción' });
        }
    }, [mapReactionContainers, addToast]);

    const bumpFocusEpoch = useCallback((fk: string): number => {
        const next = (focusEpochRef.current.get(fk) ?? 0) + 1;
        focusEpochRef.current.set(fk, next);
        return next;
    }, []);

    const bumpOpenSeq = useCallback((fk: string): number => {
        const next = (openSeqRef.current.get(fk) ?? 0) + 1;
        openSeqRef.current.set(fk, next);
        return next;
    }, []);

    // Descarta la ventana y cualquier apertura pendiente de ese chat/grupo.
    const dropFocusState = useCallback((fk: string) => {
        bumpOpenSeq(fk);
        bumpFocusEpoch(fk);
    }, [bumpFocusEpoch, bumpOpenSeq]);

    const openMessageAt = useCallback(async (target: FocusTarget, messageId: number): Promise<boolean> => {
        const fk = focusKey(target);
        const existingChat = target.kind === 'chat' ? focusedChatRef.current[target.key] : undefined;
        const existingGroup = target.kind === 'group' ? focusedGroupRef.current[target.id] : undefined;
        // Toda petición nueva (también el re-enfoque sin red) sustituye a una apertura pendiente:
        // la última elección del usuario gana.
        const openSeq = bumpOpenSeq(fk);
        if (existingChat && windowHasMessage(existingChat, messageId) && target.kind === 'chat') {
            // Ya está en la ventana: solo se re-apunta (sin petición).
            patchFocusedChat(target.key, w => refocus(w, messageId));
            return true;
        }
        if (existingGroup && windowHasMessage(existingGroup, messageId) && target.kind === 'group') {
            patchFocusedGroup(target.id, w => refocus(w, messageId));
            return true;
        }
        try {
            if (target.kind === 'chat') {
                const win = await getChatWindowAround(target.key, messageId, WINDOW_LIMIT);
                if (openSeqRef.current.get(fk) !== openSeq) return false;
                if (!win.messages.some(m => m.MessageID === messageId)) throw new Error('target missing from window');
                // seq sobre la ventana vigente *ahora* (un re-enfoque intermedio ya lo subió).
                const seq = (focusedChatRef.current[target.key]?.seq ?? 0) + 1;
                bumpFocusEpoch(fk); // las cargas de la ventana anterior pasan a ser obsoletas
                putFocusedChat(target.key, createFocusedWindow(win.messages, win, messageId, seq));
            } else {
                const win = await getGroupWindowAround(target.id, messageId, WINDOW_LIMIT);
                if (openSeqRef.current.get(fk) !== openSeq) return false;
                if (!win.messages.some(m => m.MessageID === messageId)) throw new Error('target missing from window');
                const seq = (focusedGroupRef.current[target.id]?.seq ?? 0) + 1;
                bumpFocusEpoch(fk);
                putFocusedGroup(target.id, createFocusedWindow(win.messages, win, messageId, seq));
            }
            return true;
        } catch (err) {
            if (openSeqRef.current.get(fk) !== openSeq) return false;
            console.error(`Error opening message ${messageId} in ${fk}:`, err);
            const gone = isAxiosError(err) && err.response?.status === 404;
            addToast({ type: 'error', message: gone ? 'El mensaje ya no está disponible' : 'No se pudo abrir el mensaje' });
            return false;
        }
    }, [addToast, bumpFocusEpoch, bumpOpenSeq, patchFocusedChat, patchFocusedGroup, putFocusedChat, putFocusedGroup]);

    const loadOlderFocused = useCallback(async (target: FocusTarget): Promise<void> => {
        const fk = focusKey(target);
        const win = target.kind === 'chat' ? focusedChatRef.current[target.key] : focusedGroupRef.current[target.id];
        if (!win || !win.hasMoreOlder || win.loadingOlder) return;
        const before = oldestRealMessageId(win.messages);
        if (before === null) return;
        const epoch = focusEpochRef.current.get(fk);
        try {
            if (target.kind === 'chat') {
                patchFocusedChat(target.key, w => ({ ...w, loadingOlder: true }));
                const page = await getChatBefore(target.key, before, OLDER_PAGE_SIZE);
                if (focusEpochRef.current.get(fk) !== epoch) return;
                patchFocusedChat(target.key, w => extendOlder(w, page.messages, page.hasMore));
            } else {
                patchFocusedGroup(target.id, w => ({ ...w, loadingOlder: true }));
                const page = await getGroupBefore(target.id, before, OLDER_PAGE_SIZE);
                if (focusEpochRef.current.get(fk) !== epoch) return;
                patchFocusedGroup(target.id, w => extendOlder(w, page.messages, page.hasMore));
            }
        } catch (err) {
            console.error(`Error loading older messages for ${fk}:`, err);
            if (focusEpochRef.current.get(fk) !== epoch) return;
            if (target.kind === 'chat') patchFocusedChat(target.key, w => ({ ...w, loadingOlder: false }));
            else patchFocusedGroup(target.id, w => ({ ...w, loadingOlder: false }));
        }
    }, [patchFocusedChat, patchFocusedGroup]);

    const loadNewerFocused = useCallback(async (target: FocusTarget): Promise<void> => {
        const fk = focusKey(target);
        const win = target.kind === 'chat' ? focusedChatRef.current[target.key] : focusedGroupRef.current[target.id];
        if (!win || !win.hasMoreNewer || win.loadingNewer) return;
        const after = newestRealMessageId(win.messages);
        if (after === null) return;
        const epoch = focusEpochRef.current.get(fk);
        try {
            if (target.kind === 'chat') {
                patchFocusedChat(target.key, w => ({ ...w, loadingNewer: true }));
                const page = await getChatAfter(target.key, after, OLDER_PAGE_SIZE);
                if (focusEpochRef.current.get(fk) !== epoch) return;
                patchFocusedChat(target.key, w => extendNewer(w, page.messages, page.hasMoreNewer));
            } else {
                patchFocusedGroup(target.id, w => ({ ...w, loadingNewer: true }));
                const page = await getGroupAfter(target.id, after, OLDER_PAGE_SIZE);
                if (focusEpochRef.current.get(fk) !== epoch) return;
                patchFocusedGroup(target.id, w => extendNewer(w, page.messages, page.hasMoreNewer));
            }
        } catch (err) {
            console.error(`Error loading newer messages for ${fk}:`, err);
            if (focusEpochRef.current.get(fk) !== epoch) return;
            if (target.kind === 'chat') patchFocusedChat(target.key, w => ({ ...w, loadingNewer: false }));
            else patchFocusedGroup(target.id, w => ({ ...w, loadingNewer: false }));
        }
    }, [patchFocusedChat, patchFocusedGroup]);

    const returnToLatest = useCallback((target: FocusTarget) => {
        dropFocusState(focusKey(target));
        if (target.kind === 'chat') patchFocusedChat(target.key, () => null);
        else patchFocusedGroup(target.id, () => null);
    }, [dropFocusState, patchFocusedChat, patchFocusedGroup]);

    // Salir de un chat/grupo descarta su ventana desprendida (y cualquier apertura en curso).
    const selectedChatKey = selected?.Number;
    const selectedGroupKey = selectedGroup?.ID;
    useEffect(() => {
        for (const key of Object.keys(focusedChatRef.current)) {
            if (key !== selectedChatKey) { dropFocusState(focusKey({ kind: 'chat', key })); patchFocusedChat(key, () => null); }
        }
        for (const id of Object.keys(focusedGroupRef.current).map(Number)) {
            if (id !== selectedGroupKey) { dropFocusState(focusKey({ kind: 'group', id })); patchFocusedGroup(id, () => null); }
        }
    }, [selectedChatKey, selectedGroupKey, dropFocusState, patchFocusedChat, patchFocusedGroup]);

    // Fetch full detail (with members) for a specific group and update selectedGroup
    const fetchGroupDetail = useCallback(async (groupID: number) => {
        try {
            const { data } = await getGroupDetail(groupID);
            // data is GroupDetail: GroupResponse + Members + Messages
            setSelectedGroupState(prev => {
                // Only update if it's still the same group selected
                if (prev?.ID !== groupID) return prev;
                // DisappearSeconds is omitempty: absent in the detail means "off", not "unchanged".
                return { ...prev, ...data, ...(data ? { DisappearSeconds: normalizeDisappearSeconds(data.DisappearSeconds) } : {}) };
            });
            // Sin lista de miembros (null/ausente) no se toca lo ya conocido.
            const detailMembers = data?.Members;
            if (Array.isArray(detailMembers)) {
                setGroupReceipts(prev => ({
                    ...prev,
                    [groupID]: mergeMarks(prev[groupID], marksFromMembers(detailMembers)),
                }));
                setGroupMemberNames(prev => {
                    const known = prev[groupID] ?? {};
                    let changed = false;
                    const next = { ...known };
                    for (const m of detailMembers) {
                        if (typeof m?.Telephon === 'string' && m.Telephon !== '' && typeof m.Username === 'string' && m.Username !== '' && next[m.Telephon] !== m.Username) {
                            next[m.Telephon] = m.Username;
                            changed = true;
                        }
                    }
                    return changed ? { ...prev, [groupID]: next } : prev;
                });
            }
            // Pre-populate message cache if backend returned messages
            const detailMessages = normalizeGroupDetailMessages(data);
            if (detailMessages.length > 0) {
                const hasMore = detailMessages.length >= GROUP_DETAIL_WINDOW;
                const contiguous = isContiguousWindow(groupMessagesRef.current[groupID], detailMessages, hasMore);
                setGroupMessages(prev => ({
                    ...prev,
                    [groupID]: mergeLatestWindow<GroupMessageEntry>(prev[groupID], detailMessages, hasMore),
                }));
                setGroupPaging(prev => ({
                    ...prev,
                    [groupID]: windowPaging(prev[groupID], hasMore, contiguous),
                }));
            }
        } catch (err) {
            console.error(`Error fetching detail for group ${groupID}:`, err);
        }
    }, []);

    // Carga inicial y re-sincronización tras cada reconexión del WebSocket:
    // los mensajes que llegaron mientras estábamos desconectados no se
    // recibieron por WS, así que se recargan chats y grupos desde la API.
    const wasConnectedRef = useRef(false);
    // true once the first contacts/chats/groups load settles (gates the notification cold-start deep link).
    const [initialDataLoaded, setInitialDataLoaded] = useState(false);
    useEffect(() => {
        if (!user) return;
        fetchProfile();
        void Promise.allSettled([fetchContacts(), fetchAllChats(), fetchUserGroups()])
            .then(() => setInitialDataLoaded(true));
    }, [user, fetchProfile, fetchContacts, fetchAllChats, fetchUserGroups]);

    useEffect(() => {
        if (!isConnected) return;
        if (wasConnectedRef.current) {
            fetchAllChats();
            fetchUserGroups();
        }
        wasConnectedRef.current = true;
    }, [isConnected, fetchAllChats, fetchUserGroups]);

    // WebSocket Handlers (Extracted from Dashboard.jsx)
    useEffect(() => {
        if (!isConnected) return;

        const handleIncomingMessage = (messageData: WsHandlerMap['message']) => {
            const myTelephon = profileRef.current?.Telephon;
            const currentSelected = selectedRef.current;
            const { SenderTelephon, Receptor, MessageID, Message: messageText, MediaType } = messageData;

            const contactNumber = SenderTelephon === myTelephon ? Receptor : SenderTelephon;
            const clientID = readClientID(messageData);
            // Outbox ack: a possible server replay (retried send) may be a message deleted
            // since; reload the chat from history instead of inserting the echo.
            if (clientID && outboxAck(clientID) === 'replayed') {
                void fetchChatMessages(contactNumber);
                return;
            }

            setMessagesByChat(prev => {
                const existing = prev[contactNumber] || [];
                const alreadyExists = existing.some(m => m.MessageID === MessageID || (clientID !== null && m.ClientID === clientID));
                if (alreadyExists) return prev;
                return { ...prev, [contactNumber]: [...existing, messageData] };
            });
            // Enviar un mensaje estando en una ventana desprendida vuelve a los últimos mensajes.
            if (SenderTelephon === myTelephon) returnToLatest({ kind: 'chat', key: contactNumber });
            // Primer mensaje de alguien que aún no tenemos en la lista de chats
            setAllChatGroups(prev => {
                if (prev[contactNumber]) return prev;
                const isContact = contactsRef.current.some(c => c.Number === contactNumber);
                return {
                    ...prev,
                    [contactNumber]: {
                        ContactTelephon: contactNumber,
                        ContactUsername: contactNumber,
                        ContactName: '',
                        IsContact: isContact,
                    },
                };
            });

            // si recibimos un mensaje de otro contacto y no lo tenemos abierto, notificar
            // Un mensaje de sistema (p. ej. cambio de temporizador) nunca notifica ni cuenta como no leído.
            if (isSystemDirectMessage(messageData)) return;

            if (SenderTelephon !== myTelephon && currentSelected?.Number !== contactNumber) {
                // buscar nombre para mostrar
                const contact = contactsRef.current.find(c => c.Number === contactNumber);
                const group = allChatGroupsRef.current[contactNumber];
                const title = contact?.ContactName || group?.ContactName || group?.ContactUsername || contactNumber;
                let body = '';
                if (MediaType) {
                    if (MediaType === 'audio') body = '🎵 Audio';
                    else if (MediaType === 'image') body = '📷 Foto';
                    else if (MediaType === 'video') body = '🎥 Video';
                    else if (MediaType === 'document') body = '📄 Documento';
                }
                if (!body) body = messageText || 'Nuevo mensaje';
                // Obtener avatar del contacto para la notificación
                const icon = avatarMapRef.current[contactNumber] || undefined;
                // Si es imagen, incluirla como preview en la notificación nativa
                const image = MediaType === 'image' ? (messageData.MediaUrl || undefined) : undefined;

                // El usuario pidió explícitamente QUITAR la notificación interna (Toast)
                // y enviar siempre la notificación nativa externa del sistema
                showNativeNotification({
                    title,
                    body,
                    icon,
                    image,
                    tag: contactNumber,
                    data: { telephon: contactNumber },
                    contactName: title,
                });
            }

            if (SenderTelephon !== myTelephon && currentSelected?.Number === contactNumber) {
                markAsRead(contactNumber);
            }
        };

        // Handler: mensajes marcados como "visto" por el receptor
        const handleReadConfirmation = (payload: WsHandlerMap['read']) => {
            const readerTelephon = payload?.from;
            if (!readerTelephon) return;
            // Actualizar todos los mensajes enviados a ese contacto a "visto"
            setMessagesByChat(prev => {
                const msgs = prev[readerTelephon];
                if (!msgs) return prev;
                const updated = msgs.map(m =>
                    m.Receptor === readerTelephon && (m.Status === 'enviado' || m.Status === 'entregado')
                        ? { ...m, Status: 'visto' as const }
                        : m
                );
                return { ...prev, [readerTelephon]: updated };
            });
            patchFocusedChat(readerTelephon, w => updateFocusedMessages(w, m =>
                m.Receptor === readerTelephon && (m.Status === 'enviado' || m.Status === 'entregado')
                    ? { ...m, Status: 'visto' as const }
                    : m
            ));
        };

        // Handler: mensajes pendientes marcados como "entregado" (receptor se conectó)
        const handleMessageDelivered = (payload: WsHandlerMap['message_delivered']) => {
            const receiverTelephon = payload?.receiver;
            if (!receiverTelephon) return;
            // Actualizar todos los mensajes "enviado" dirigidos a ese receptor a "entregado"
            setMessagesByChat(prev => {
                const msgs = prev[receiverTelephon];
                if (!msgs) return prev;
                const updated = msgs.map(m =>
                    m.Receptor === receiverTelephon && m.Status === 'enviado'
                        ? { ...m, Status: 'entregado' as const }
                        : m
                );
                return { ...prev, [receiverTelephon]: updated };
            });
            patchFocusedChat(receiverTelephon, w => updateFocusedMessages(w, m =>
                m.Receptor === receiverTelephon && m.Status === 'enviado'
                    ? { ...m, Status: 'entregado' as const }
                    : m
            ));
        };

        // Handler: un contacto cambió su avatar
        const handleAvatarChanged = (payload: WsHandlerMap['avatar_changed']) => {
            if (!payload?.telephon) return;
            setAvatarMap(prev => ({ ...prev, [payload.telephon]: payload.avatar_url || '' }));
        };

        // Handler: un contacto cambió su username
        const handleUsernameChanged = (payload: WsHandlerMap['username_changed']) => {
            if (!payload?.telephon) return;
            const { telephon, new_username } = payload;
            // Actualizar en contactos
            setContacts(prev => prev.map(c =>
                c.Number === telephon ? { ...c, Username: new_username } : c
            ));
            // Actualizar en allChatGroups
            setAllChatGroups(prev => {
                if (!prev[telephon]) return prev;
                return { ...prev, [telephon]: { ...prev[telephon], ContactUsername: new_username } };
            });
        };

        // Handler: un mensaje fue editado (por mí o por el otro participante)
        const handleEditMessage = (updatedMsg: WsHandlerMap['edit_message']) => {
            if (!updatedMsg?.MessageID) return;
            const myTelephon = profileRef.current?.Telephon;
            // Determinar en qué chat está este mensaje
            const contactNumber = updatedMsg.SenderTelephon === myTelephon
                ? updatedMsg.Receptor
                : updatedMsg.SenderTelephon;

            setMessagesByChat(prev => {
                const msgs = prev[contactNumber];
                if (!msgs) return prev;
                const updated = msgs.map(m =>
                    m.MessageID === updatedMsg.MessageID
                        ? { ...m, Message: updatedMsg.Message, Edited: true }
                        : m
                );
                return { ...prev, [contactNumber]: updated };
            });
            patchFocusedChat(contactNumber, w => updateFocusedMessages(w, m =>
                m.MessageID === updatedMsg.MessageID ? { ...m, Message: updatedMsg.Message, Edited: true } : m
            ));
        };

        // Handler: un mensaje fue eliminado para todos (por mí o por el otro participante)
        const handleDeleteMessage = (deletedMsg: WsHandlerMap['delete_message']) => {
            if (!deletedMsg?.MessageID) return;
            const myTelephon = profileRef.current?.Telephon;
            // Determinar en qué chat está este mensaje
            const contactNumber = deletedMsg.SenderTelephon === myTelephon
                ? deletedMsg.Receptor
                : deletedMsg.SenderTelephon;

            setMessagesByChat(prev => {
                const msgs = prev[contactNumber];
                if (!msgs) return prev;
                const updated = msgs.filter(m => m.MessageID !== deletedMsg.MessageID);
                return { ...prev, [contactNumber]: updated };
            });
            patchFocusedChat(contactNumber, w => removeFocusedMessage(w, deletedMsg.MessageID));
        };

        // ── Group event handlers ───────────────────────────────────────────────────

        /** Incoming group message (from sender confirm or group broadcast). */
        const handleGroupChatMessage = (msg: WsHandlerMap['group_chat']) => {
            if (!msg?.GroupID) return;
            const clientID = readClientID(msg);
            // Same as 1:1: a possibly-replayed outbox ack reloads the group instead.
            if (clientID && outboxAck(clientID) === 'replayed') {
                void fetchGroupMessages(msg.GroupID);
                return;
            }
            setGroupMessages(prev => {
                const existing = prev[msg.GroupID] || [];
                if (existing.some(m => m.MessageID === msg.MessageID || (clientID !== null && m.ClientID === clientID))) return prev;
                return { ...prev, [msg.GroupID]: [...existing, msg] };
            });
            // Enviar un mensaje estando en una ventana desprendida vuelve a los últimos mensajes.
            if (msg.SenderTelephon === profileRef.current?.Telephon) returnToLatest({ kind: 'group', id: msg.GroupID });
            noteIncomingGroupMessage(msg.GroupID, msg.MessageID, msg.SenderTelephon);
        };

        /** A member's delivered/read watermarks advanced (only used to draw our own ticks). */
        const handleGroupReceipt = (payload: WsHandlerMap['group_receipt']) => {
            const event = parseGroupReceipt(payload);
            if (!event) return;
            setGroupReceipts(prev => applyReceiptEvent(prev, event));
        };

        /** Someone (or I, from another session / the echo) set, changed or removed a reaction. */
        const handleReaction = (payload: WsHandlerMap['reaction']) => {
            const event = parseReactionEvent(payload);
            if (!event) return;
            const me = profileRef.current?.Telephon ?? selfTelephonRef.current;
            if (event.telephon === me) shiftPending(pendingReactionsRef.current, reactionPendingKey(event.kind, event.messageID), Date.now());
            mapReactionContainers(event.kind, event.groupID, list => applyReaction(list, event, me));

            // Author notification: only for a new/changed emoji from somebody else, in a chat that is not open.
            if (event.emoji === '' || !me || event.authorTelephon !== me || event.telephon === me) return;
            let name: string | undefined;
            if (event.kind === 'group') {
                if (selectedGroupRef.current?.ID === event.groupID) return;
                name = event.groupID === undefined ? undefined : groupMemberNamesRef.current[event.groupID]?.[event.telephon];
            } else {
                if (selectedRef.current?.Number === event.telephon) return;
                const known = contactsRef.current.find(c => c.Number === event.telephon);
                name = known?.ContactName || known?.Username || undefined;
            }
            const who = name || event.username || event.telephon;
            addToast({
                type: 'info',
                message: event.preview
                    ? `${who} reaccionó ${event.emoji} a: ${event.preview}`
                    : `${who} reaccionó ${event.emoji} a tu mensaje`,
            });
        };

        /** A failed `react` (WS error with context): undo the optimistic change of that message. */
        const handleWsError = (envelope: WsHandlerMap['error']) => {
            if (typeof envelope?.error === 'string') outboxHandleError(envelope.error);
            const target = parseReactionErrorContext(envelope);
            if (!target) return;
            const entry = shiftPending(pendingReactionsRef.current, reactionPendingKey(target.kind, target.messageID), Date.now());
            if (entry) {
                mapReactionContainers(target.kind, target.groupID, list => revertMine(list, target.messageID, entry.prevMine));
                addToast({ type: 'error', message: 'No se pudo enviar la reacción' });
            }
        };

        /** Someone in a group is typing. */
        const handleGroupTyping = (payload: WsHandlerMap['group_typing']) => {
            if (!payload?.groupID || !payload?.from) return;
            // Reuse typingUsers with a composite key so it does not conflict with 1:1.
            const key = `group:${payload.groupID}:${payload.from}`;
            setTypingUsers(prev => {
                const next = new Set(prev);
                next.add(key);
                return next;
            });
            setTimeout(() => {
                setTypingUsers(prev => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
            }, 3000);
        };

        /** A group message was edited. */
        const handleGroupEditMessage = (updatedMsg: WsHandlerMap['group_edit_message']) => {
            if (!updatedMsg?.MessageID || !updatedMsg?.GroupID) return;
            setGroupMessages(prev => {
                const msgs = prev[updatedMsg.GroupID];
                if (!msgs) return prev;
                return {
                    ...prev,
                    [updatedMsg.GroupID]: msgs.map(m =>
                        m.MessageID === updatedMsg.MessageID
                            ? { ...m, Message: updatedMsg.Message, Edited: true }
                            : m
                    ),
                };
            });
            patchFocusedGroup(updatedMsg.GroupID, w => updateFocusedMessages(w, m =>
                m.MessageID === updatedMsg.MessageID ? { ...m, Message: updatedMsg.Message, Edited: true } : m
            ));
        };

        /** A group message was deleted for everyone. */
        const handleGroupDeleteMessage = (deletedMsg: WsHandlerMap['group_delete_message']) => {
            if (!deletedMsg?.MessageID || !deletedMsg?.GroupID) return;
            setGroupMessages(prev => {
                const msgs = prev[deletedMsg.GroupID];
                if (!msgs) return prev;
                return {
                    ...prev,
                    [deletedMsg.GroupID]: msgs.filter(m => m.MessageID !== deletedMsg.MessageID),
                };
            });
            patchFocusedGroup(deletedMsg.GroupID, w => removeFocusedMessage(w, deletedMsg.MessageID));
        };

        /**
         * Another user added us to a group (or member was added).
         * We just refresh the full groups list so our role/count are always accurate.
         */
        const handleGroupAdded = () => {
            fetchUserGroups();
        };

        // Nota: dentro de los handlers se usa setSelectedGroupState (setter
        // directo). El wrapper setSelectedGroup deselecciona el chat 1:1 cuando
        // recibe un valor "truthy", y una función updater lo es: cualquier cambio
        // de avatar o de miembros de un grupo cerraba el chat abierto.

        /** A group avatar was updated — update it in the groups list and selectedGroup. */
        const handleGroupAvatarUpdate = (payload: WsHandlerMap['group_avatar_update']) => {
            if (!payload?.groupID || payload.avatarUrl === undefined) return;
            setGroups(prev => prev.map(g =>
                g.ID === payload.groupID ? { ...g, AvatarUrl: payload.avatarUrl } : g
            ));
            setSelectedGroupState(prev =>
                prev?.ID === payload.groupID ? { ...prev, AvatarUrl: payload.avatarUrl } : prev
            );
        };

        /** Caches telephon -> username so a member who left can still be named later. */
        const rememberNames = (groupID: number, entries: ReadonlyArray<{ telephon: string; username: string }>) => {
            setGroupMemberNames(prev => {
                const known = prev[groupID] ?? {};
                let changed = false;
                const next = { ...known };
                for (const e of entries) {
                    if (e.telephon && e.username && next[e.telephon] !== e.username) {
                        next[e.telephon] = e.username;
                        changed = true;
                    }
                }
                return changed ? { ...prev, [groupID]: next } : prev;
            });
        };

        /** Members were added to a group — track receipts/names and append the persisted notice. */
        const handleGroupMemberAdded = (payload: WsHandlerMap['group_member_added']) => {
            if (!payload?.groupID || !payload?.addedMembers?.length) return;
            rememberNames(payload.groupID, payload.addedMembers);
            const latestKnownId = latestRealMessageId(groupMessagesRef.current[payload.groupID]);
            setGroupReceipts(prev => payload.addedMembers.reduce(
                (acc, m) => addMemberMark(acc, payload.groupID, m.telephon, latestKnownId),
                prev,
            ));
            setGroups(prev => prev.map(g =>
                g.ID === payload.groupID
                    ? { ...g, MemberCount: payload.newMemberCount ?? g.MemberCount }
                    : g
            ));
            setSelectedGroupState(prev => {
                if (!prev || prev.ID !== payload.groupID) return prev;
                const newMembers = (payload.addedMembers || []).map(m => ({
                    Telephon: m.telephon,
                    Username: m.username,
                    Role: 'member' as const,
                }));
                const existing = new Set((prev.Members || []).map(m => m.Telephon));
                const toAdd = newMembers.filter(m => !existing.has(m.Telephon));
                return {
                    ...prev,
                    MemberCount: payload.newMemberCount ?? prev.MemberCount,
                    Members: [...(prev.Members || []), ...toAdd],
                };
            });
            appendSystemMessage(payload.groupID, parseSystemMessage(payload.systemMessage));
        };

        /** A group member left — update member list/names and append the persisted notice. */
        const handleGroupMemberLeft = (payload: WsHandlerMap['group_member_left']) => {
            if (!payload?.groupID) return;
            rememberNames(payload.groupID, [{ telephon: payload.telephon, username: payload.username }]);
            setGroupReceipts(prev => removeMemberMark(prev, payload.groupID, payload.telephon));
            // Update member count and remove from members list
            setGroups(prev => prev.map(g =>
                g.ID === payload.groupID
                    ? { ...g, MemberCount: Math.max((g.MemberCount || 1) - 1, 0) }
                    : g
            ));
            setSelectedGroupState(prev => {
                if (!prev || prev.ID !== payload.groupID) return prev;
                return {
                    ...prev,
                    MemberCount: Math.max((prev.MemberCount || 1) - 1, 0),
                    Members: prev.Members
                        ? prev.Members.filter(m => m.Telephon !== payload.telephon)
                        : prev.Members,
                };
            });
            appendSystemMessage(payload.groupID, parseSystemMessage(payload.systemMessage));
        };

        /** A member was promoted/dismissed — update roles (self included) and append the notice. */
        const handleGroupMemberRole = (payload: WsHandlerMap['group_member_role']) => {
            const event = parseGroupMemberRole(payload);
            if (!event) return;
            const myTelephon = profileRef.current?.Telephon;
            const iAmTarget = event.telephon === myTelephon;
            setGroups(prev => prev.map(g =>
                g.ID === event.groupID && iAmTarget ? { ...g, UserRole: event.role } : g
            ));
            setSelectedGroupState(prev => {
                if (!prev || prev.ID !== event.groupID) return prev;
                return {
                    ...prev,
                    ...(iAmTarget ? { UserRole: event.role } : {}),
                    Members: prev.Members?.map(m =>
                        m.Telephon === event.telephon ? { ...m, Role: event.role } : m
                    ),
                };
            });
            appendSystemMessage(event.groupID, event.systemMessage);
        };

        /** A member was removed by an admin — the removed user also receives this and moves to `left`. */
        const handleGroupMemberRemoved = (payload: WsHandlerMap['group_member_removed']) => {
            const event = parseGroupMemberRemoved(payload);
            if (!event) return;
            const myTelephon = profileRef.current?.Telephon;
            if (event.username) rememberNames(event.groupID, [{ telephon: event.telephon, username: event.username }]);
            setGroupReceipts(prev => removeMemberMark(prev, event.groupID, event.telephon));
            const iAmRemoved = event.telephon === myTelephon;
            setGroups(prev => prev.map(g => {
                if (g.ID !== event.groupID) return g;
                const MemberCount = event.newMemberCount ?? Math.max((g.MemberCount || 1) - 1, 0);
                return iAmRemoved ? { ...g, MemberCount, UserRole: 'left' } : { ...g, MemberCount };
            }));
            setSelectedGroupState(prev => {
                if (!prev || prev.ID !== event.groupID) return prev;
                const MemberCount = event.newMemberCount ?? Math.max((prev.MemberCount || 1) - 1, 0);
                const Members = prev.Members
                    ? prev.Members.filter(m => m.Telephon !== event.telephon)
                    : prev.Members;
                return iAmRemoved
                    ? { ...prev, MemberCount, Members, UserRole: 'left', RemovedByAdmin: true }
                    : { ...prev, MemberCount, Members };
            });
            appendSystemMessage(event.groupID, event.systemMessage);
        };

        /** Group permission settings changed. */
        const handleGroupSettings = (payload: WsHandlerMap['group_settings']) => {
            const event = parseGroupSettings(payload);
            if (!event) return;
            const patch = {
                OnlyAdminsCanSend: event.onlyAdminsCanSend,
                OnlyAdminsCanEditInfo: event.onlyAdminsCanEditInfo,
                OnlyAdminsCanAddMembers: event.onlyAdminsCanAddMembers,
            };
            setGroups(prev => prev.map(g => g.ID === event.groupID ? { ...g, ...patch } : g));
            setSelectedGroupState(prev => prev?.ID === event.groupID ? { ...prev, ...patch } : prev);
            appendSystemMessage(event.groupID, event.systemMessage);
        };

        /** Group name/description changed. */
        const handleGroupInfo = (payload: WsHandlerMap['group_info']) => {
            const event = parseGroupInfo(payload);
            if (!event) return;
            setGroups(prev => prev.map(g =>
                g.ID === event.groupID ? { ...g, Name: event.name, Description: event.description } : g
            ));
            setSelectedGroupState(prev => prev?.ID === event.groupID
                ? { ...prev, Name: event.name, Description: event.description }
                : prev);
            appendSystemMessage(event.groupID, event.systemMessage);
        };

        /** The disappearing timer of a chat/group changed (either side, or my own REST echo). */
        const handleDisappearingChanged = (payload: WsHandlerMap['disappearing_changed']) => {
            const event = parseDisappearingChanged(payload);
            if (event) applyDisappearingChanged(event);
        };

        /** The server hard-deleted expired messages: drop them from every store and detached window. */
        const handleMessagesExpired = (payload: WsHandlerMap['messages_expired']) => {
            const event = parseMessagesExpired(payload);
            if (event) removeExpiredIds(event.kind, event.key, event.messageIDs);
        };

        on('message', handleIncomingMessage);
        on('read', handleReadConfirmation);
        on('message_delivered', handleMessageDelivered);
        on('avatar_changed', handleAvatarChanged);
        on('username_changed', handleUsernameChanged);
        on('edit_message', handleEditMessage);
        on('delete_message', handleDeleteMessage);
        // Group events
        on('group_chat', handleGroupChatMessage);
        on('group_typing', handleGroupTyping);
        on('group_edit_message', handleGroupEditMessage);
        on('group_delete_message', handleGroupDeleteMessage);
        on('group_added', handleGroupAdded);
        on('group_avatar_update', handleGroupAvatarUpdate);
        on('group_member_added', handleGroupMemberAdded);
        on('group_member_left', handleGroupMemberLeft);
        on('group_member_role', handleGroupMemberRole);
        on('group_member_removed', handleGroupMemberRemoved);
        on('group_settings', handleGroupSettings);
        on('group_info', handleGroupInfo);
        on('group_receipt', handleGroupReceipt);
        on('reaction', handleReaction);
        on('disappearing_changed', handleDisappearingChanged);
        on('messages_expired', handleMessagesExpired);
        on('error', handleWsError);

        return () => {
            off('message', handleIncomingMessage);
            off('read', handleReadConfirmation);
            off('message_delivered', handleMessageDelivered);
            off('avatar_changed', handleAvatarChanged);
            off('username_changed', handleUsernameChanged);
            off('edit_message', handleEditMessage);
            off('delete_message', handleDeleteMessage);
            off('group_chat', handleGroupChatMessage);
            off('group_typing', handleGroupTyping);
            off('group_edit_message', handleGroupEditMessage);
            off('group_delete_message', handleGroupDeleteMessage);
            off('group_added', handleGroupAdded);
            off('group_avatar_update', handleGroupAvatarUpdate);
            off('group_member_added', handleGroupMemberAdded);
            off('group_member_left', handleGroupMemberLeft);
            off('group_member_role', handleGroupMemberRole);
            off('group_member_removed', handleGroupMemberRemoved);
            off('group_settings', handleGroupSettings);
            off('group_info', handleGroupInfo);
            off('group_receipt', handleGroupReceipt);
            off('reaction', handleReaction);
            off('disappearing_changed', handleDisappearingChanged);
            off('messages_expired', handleMessagesExpired);
            off('error', handleWsError);
        };
    }, [isConnected, on, off, markAsRead, fetchUserGroups, noteIncomingGroupMessage, patchFocusedChat, patchFocusedGroup, returnToLatest, mapReactionContainers, addToast, appendSystemMessage, applyDisappearingChanged, removeExpiredIds, outboxAck, outboxHandleError, fetchChatMessages, fetchGroupMessages]);

    // Outbox: a queued entry whose ClientID already came back in loaded history (e.g. sent
    // before a reload, ack lost) is delivered; drop it so it never shows twice.
    const outboxItems = outbox.items;
    useEffect(() => {
        if (!outboxItems.some(i => i.state === 'pending')) return;
        const known = new Set<string>();
        const collect = (list: readonly unknown[] | undefined) => list?.forEach(m => {
            const id = readClientID(m);
            if (id) known.add(id);
        });
        outboxItems.forEach(({ entry }) => {
            if (entry.kind === 'direct') collect(messagesByChat[entry.target]);
            else collect(groupMessages[entry.target]);
        });
        if (known.size > 0) outboxReconcile(known);
    }, [outboxItems, messagesByChat, groupMessages, outboxReconcile]);

    const logoutAndClearOutbox = useCallback(async () => {
        try {
            await clearOutbox();
        } catch (err) {
            console.error('Error clearing the outbox on logout:', err);
        }
        await logout();
    }, [clearOutbox, logout]);

    // Whenever the user opens a group (or reconnects while one is open), re-join the WS room.
    // This is the definitive fix for "admin sends a message and others don't see it in real time".
    useEffect(() => {
        const groupId = selectedGroup?.ID;
        if (!groupId || !isConnected) return;
        sendGroupJoin(groupId);
    }, [selectedGroup?.ID, isConnected, sendGroupJoin]);

    // manejar clicks sobre notificaciones (fuerza apertura del chat 1:1 o del grupo)
    const handleNotificationClick = useCallback((target: NotificationTarget) => {
        if (target.kind === 'group') {
            // Igual que el Sidebar: solo se puede abrir un grupo que ya está en `groups`.
            const group = groups.find(g => g.ID === target.groupID);
            if (!group) {
                addToast({ type: 'error', message: 'No se pudo abrir el grupo' });
                return;
            }
            setSelectedGroup(group);
            setSidebarView('groups');
            setSidebarOpen(false);
            return;
        }
        // intentar seleccionar contacto o chat existente
        setSelectedContact(resolveChatTarget(target.telephon, contacts, allChatGroups));
        setSidebarView('chats');
        setSidebarOpen(false);
    }, [groups, contacts, allChatGroups, addToast, setSidebarView, setSidebarOpen, setSelectedContact, setSelectedGroup]);
    useNotificationClick(handleNotificationClick);
    // Cold start: el SW abrió /dashboard?chat=… o ?group=… (ninguna ventana abierta).
    useColdStartTarget(initialDataLoaded, handleNotificationClick);

    // Web Push: re-sync the subscription on boot and right after permission is granted (banner).
    usePushSync(user?.telephon || null, notifPermission);

    const selectedDisappearSeconds = selectedGroup
        ? normalizeDisappearSeconds(selectedGroup.DisappearSeconds)
        : (selected ? chatDisappear[selected.Number] ?? 0 : 0);

    const value: DashboardContextValue = {
        profile, setProfile,
        myAvatar, setMyAvatar,
        globalWallpaper, setGlobalWallpaper,
        contacts, setContacts,
        onlineUsers, setOnlineUsers,
        typingUsers, setTypingUsers,
        lastSeenMap, setLastSeenMap,
        avatarMap, setAvatarMap,
        selected, setSelected: setSelectedContact,
        messagesByChat, setMessagesByChat,
        allChatGroups, setAllChatGroups,
        drafts, setDrafts,
        toasts, addToast, dismissToast,
        notifPermission, setNotifPermission, requestNotificationPermission,
        callState, setCallState,
        incomingCall, setIncomingCall,
        sidebarView, setSidebarView,
        sidebarOpen, setSidebarOpen,
        fetchContacts,
        fetchProfile,
        fetchAllChats,
        fetchChatMessages,
        chatPaging,
        loadOlderMessages,
        markAsRead,
        chatDisappear,
        selectedDisappearSeconds,
        setChatDisappearing,
        setGroupDisappearing,
        // Groups
        groups, setGroups,
        groupMessages, setGroupMessages,
        selectedGroup, setSelectedGroup,
        fetchUserGroups,
        fetchGroupMessages,
        fetchGroupDetail,
        groupPaging,
        loadOlderGroupMessages,
        focusedChat,
        focusedGroup,
        openMessageAt,
        loadOlderFocused,
        loadNewerFocused,
        returnToLatest,
        // WebSocket state & actions
        isConnected,
        sendMessage,
        sendTypingIndicator,
        sendGroupMessage,
        sendGroupTyping,
        sendGroupEditMessage,
        sendGroupDeleteMessage,
        sendGroupJoin,
        reactToMessage,
        groupReceipts,
        groupMemberNames,
        outboxItems,
        sendText: outbox.sendText,
        // Auth passthrough
        user,
        logout: logoutAndClearOutbox,
    };

    return (
        <DashboardContext.Provider value={value}>
            {children}
        </DashboardContext.Provider>
    );
};
