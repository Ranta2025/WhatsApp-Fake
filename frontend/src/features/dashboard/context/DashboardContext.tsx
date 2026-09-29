import {
    createContext, useContext, useState, useEffect, useRef, useCallback,
    type ReactNode, type Dispatch, type SetStateAction,
} from 'react';
import api from '../../../api/axios';
import { getUserGroups, getGroupMessages, getGroupDetail } from '../../../api/groupApi';
import { useAuth, type AuthContextValue } from '../../../context/AuthContext';
import { useWebSocket } from '../../../hooks/useWebSocket';
import {
    showNativeNotification, type NotificationPermissionState,
} from '../../../utils/notifications';
import type { WsHandlerMap } from '../../../api/websocket';
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
    mergeLatestWindow, isContiguousWindow, prependOlder, oldestRealMessageId, DEFAULT_PAGING, type PagingState,
} from '../lib/mergeMessages';
import { useNotificationClick } from '../hooks/useNotificationClick';

/** Mensajes por página al cargar historial antiguo (scroll hacia arriba). */
const OLDER_PAGE_SIZE = 50;
/** Ventana inicial de /api/v1/chats y del GET /chat/:contact sin parámetros. */
const CHAT_LATEST_WINDOW = 200;
/** Ventana inicial que devuelve el detalle de grupo. */
const GROUP_DETAIL_WINDOW = 50;

export type { PagingState };

export type SidebarView = 'chats' | 'groups' | 'contacts' | 'estados' | 'calls';

export interface Toast {
    id: number;
    type: 'error' | 'success' | 'info';
    message: string;
    createdAt: number;
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
export type SelectedGroup = LocalGroup & Partial<Pick<GroupDetail, 'Members' | 'Messages'>>;

/** System message injected locally for "member added"/"member left" (not sent by the backend). */
export interface SystemGroupMessage {
    MessageID: string;
    GroupID: number;
    IsSystem: true;
    Message: string;
    Time: string;
}

export type GroupMessageEntry = GroupMessageResponse | SystemGroupMessage;

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
    isConnected: boolean;
    sendMessage: ReturnType<typeof useWebSocket>['sendMessage'];
    sendTypingIndicator: ReturnType<typeof useWebSocket>['sendTypingIndicator'];
    sendGroupMessage: ReturnType<typeof useWebSocket>['sendGroupMessage'];
    sendGroupTyping: ReturnType<typeof useWebSocket>['sendGroupTyping'];
    sendGroupEditMessage: ReturnType<typeof useWebSocket>['sendGroupEditMessage'];
    sendGroupDeleteMessage: ReturnType<typeof useWebSocket>['sendGroupDeleteMessage'];
    sendGroupJoin: ReturnType<typeof useWebSocket>['sendGroupJoin'];
    user: AuthContextValue['user'];
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

/** `X-Has-More: true|false` (backend 1:1 history); undefined when absent (e.g. not exposed). */
const readHasMoreHeader = (headers: unknown): boolean | undefined => {
    if (!headers || typeof headers !== 'object') return undefined;
    const raw = (headers as Record<string, unknown>)['x-has-more'];
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return undefined;
};

export const DashboardProvider = ({ children }: { children: ReactNode }) => {
    const { user, logout } = useAuth();
    const {
        isConnected, on, off,
        sendMessage, sendReadConfirmation, sendTypingIndicator,
        sendGroupMessage, sendGroupTyping, sendGroupEditMessage, sendGroupDeleteMessage,
        sendGroupJoin,
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

    // Groups
    const [groups, setGroups] = useState<LocalGroup[]>([]);
    const [groupMessages, setGroupMessages] = useState<Record<number, GroupMessageEntry[]>>({}); // { [groupID]: GroupMessageResponse[] }
    const [groupPaging, setGroupPaging] = useState<Record<number, PagingState>>({});
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
            const hasUnread = msgs.some(m => m.SenderTelephon === contactNumber && m.Status !== 'visto');
            if (!hasUnread) return prev;
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
    // Cursor/estado de paginación leídos por loadOlder* sin recrear los callbacks.
    const messagesByChatRef = useRef<Record<string, Message[]>>({});
    const groupMessagesRef = useRef<Record<number, GroupMessageEntry[]>>({});
    const chatPagingRef = useRef<Record<string, PagingState>>({});
    const groupPagingRef = useRef<Record<number, PagingState>>({});
    useEffect(() => { messagesByChatRef.current = messagesByChat; }, [messagesByChat]);
    useEffect(() => { groupMessagesRef.current = groupMessages; }, [groupMessages]);
    useEffect(() => { chatPagingRef.current = chatPaging; }, [chatPaging]);
    useEffect(() => { groupPagingRef.current = groupPaging; }, [groupPaging]);
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
            chatGroups.forEach(group => {
                const key = group.ContactTelephon;
                if (key) {
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

    // Cargar la página anterior de un grupo (scroll hacia arriba). Las entradas
    // sintéticas (IsSystem) nunca son cursor: oldestRealMessageId las ignora.
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

    // Fetch full detail (with members) for a specific group and update selectedGroup
    const fetchGroupDetail = useCallback(async (groupID: number) => {
        try {
            const { data } = await getGroupDetail(groupID);
            // data is GroupDetail: GroupResponse + Members + Messages
            setSelectedGroupState(prev => {
                // Only update if it's still the same group selected
                if (prev?.ID !== groupID) return prev;
                return { ...prev, ...data };
            });
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
    useEffect(() => {
        if (!user) return;
        fetchProfile();
        fetchContacts();
        fetchAllChats();
        fetchUserGroups();
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

            setMessagesByChat(prev => {
                const existing = prev[contactNumber] || [];
                const alreadyExists = existing.some(m => m.MessageID === MessageID);
                if (alreadyExists) return prev;
                return { ...prev, [contactNumber]: [...existing, messageData] };
            });
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
        };

        // ── Group event handlers ───────────────────────────────────────────────────

        /** Incoming group message (from sender confirm or group broadcast). */
        const handleGroupChatMessage = (msg: WsHandlerMap['group_chat']) => {
            if (!msg?.GroupID) return;
            setGroupMessages(prev => {
                const existing = prev[msg.GroupID] || [];
                if (existing.some(m => m.MessageID === msg.MessageID)) return prev;
                return { ...prev, [msg.GroupID]: [...existing, msg] };
            });
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

        /** Members were added to a group — inject system messages and update member list. */
        const handleGroupMemberAdded = (payload: WsHandlerMap['group_member_added']) => {
            if (!payload?.groupID || !payload?.addedMembers?.length) return;
            const adder = payload.addedByUsername || 'Alguien';
            const now = Date.now();
            const systemMsgs: SystemGroupMessage[] = payload.addedMembers.map((m, i) => ({
                MessageID: `system_add_${now}_${i}_${m.telephon}`,
                GroupID: payload.groupID,
                IsSystem: true,
                Message: `${adder} añadió a ${m.username || m.telephon}`,
                Time: new Date().toISOString(),
            }));
            setGroupMessages(prev => {
                const msgs = prev[payload.groupID] || [];
                return { ...prev, [payload.groupID]: [...msgs, ...systemMsgs] };
            });
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
        };

        /** A group member left — inject a system message and update member count/list. */
        const handleGroupMemberLeft = (payload: WsHandlerMap['group_member_left']) => {
            if (!payload?.groupID) return;
            const displayName = payload.username || payload.telephon;
            const systemMsg: SystemGroupMessage = {
                MessageID: `system_${Date.now()}_${Math.random()}`,
                GroupID: payload.groupID,
                IsSystem: true,
                Message: `${displayName} salió del grupo`,
                Time: new Date().toISOString(),
            };
            setGroupMessages(prev => {
                const msgs = prev[payload.groupID] || [];
                return { ...prev, [payload.groupID]: [...msgs, systemMsg] };
            });
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
        };
    }, [isConnected, on, off, markAsRead, fetchUserGroups]);

    // Whenever the user opens a group (or reconnects while one is open), re-join the WS room.
    // This is the definitive fix for "admin sends a message and others don't see it in real time".
    useEffect(() => {
        const groupId = selectedGroup?.ID;
        if (!groupId || !isConnected) return;
        sendGroupJoin(groupId);
    }, [selectedGroup?.ID, isConnected, sendGroupJoin]);

    // manejar clicks sobre notificaciones (fuerza apertura de chat)
    const handleNotificationClick = useCallback((telephon: string) => {
        // intentar seleccionar contacto o grupo existente
        setSelectedContact(resolveChatTarget(telephon, contacts, allChatGroups));
        setSidebarView('chats');
        setSidebarOpen(false);
    }, [contacts, allChatGroups, setSidebarView, setSidebarOpen, setSelectedContact]);
    useNotificationClick(handleNotificationClick);

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
        // Groups
        groups, setGroups,
        groupMessages, setGroupMessages,
        selectedGroup, setSelectedGroup,
        fetchUserGroups,
        fetchGroupMessages,
        fetchGroupDetail,
        groupPaging,
        loadOlderGroupMessages,
        // WebSocket state & actions
        isConnected,
        sendMessage,
        sendTypingIndicator,
        sendGroupMessage,
        sendGroupTyping,
        sendGroupEditMessage,
        sendGroupDeleteMessage,
        sendGroupJoin,
        // Auth passthrough
        user,
        logout
    };

    return (
        <DashboardContext.Provider value={value}>
            {children}
        </DashboardContext.Provider>
    );
};
