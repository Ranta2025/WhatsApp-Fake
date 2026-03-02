import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '../../../api/axios';
import { useAuth } from '../../../context/AuthContext';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { onNotificationClick, offNotificationClick, showNativeNotification } from '../../../utils/notifications';

const DashboardContext = createContext();

export const useDashboard = () => {
    const context = useContext(DashboardContext);
    if (!context) {
        throw new Error('useDashboard must be used within a DashboardProvider');
    }
    return context;
};

export const DashboardProvider = ({ children }) => {
    const { user, logout } = useAuth();
    const { isConnected, on, off, sendMessage, sendReadConfirmation, sendTypingIndicator, sendEditMessage, sendDeleteMessage, sendCallOffer, sendCallAccept, sendCallReject, sendCallEnd } = useWebSocket();

    // Profile & User State
    const [profile, setProfile] = useState(null);
    const [myAvatar, setMyAvatar] = useState('');
    const [globalWallpaper, setGlobalWallpaper] = useState('');
    
    // Contacts & Presence
    const [contacts, setContacts] = useState([]);
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    const [typingUsers, setTypingUsers] = useState(new Set());
    const [lastSeenMap, setLastSeenMap] = useState({});
    const [avatarMap, setAvatarMap] = useState({});
    
    // Messaging
    const [selected, setSelected] = useState(null);
    const [messagesByChat, setMessagesByChat] = useState({});
    const [allChatGroups, setAllChatGroups] = useState({});
    const [drafts, setDrafts] = useState({});
    
    // Notifications & Toasts
    const [toasts, setToasts] = useState([]);
    const [notifPermission, setNotifPermission] = useState(
        typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
    );
    
    // Calls
    const [callState, setCallState] = useState(null);
    const [incomingCall, setIncomingCall] = useState(null);

    // UI state (sidebar view & mobile open)
    const [sidebarView, setSidebarView] = useState('chats');
    const [sidebarOpen, setSidebarOpen] = useState(true); // show sidebar by default

    // Toast functions
    const addToast = useCallback((toast) => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { ...toast, id, createdAt: Date.now() }]);
    }, []);

    const dismissToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const requestNotificationPermission = useCallback(async () => {
        if (!('Notification' in window)) return 'denied';
        const permission = await Notification.requestPermission();
        setNotifPermission(permission);
        return permission;
    }, []);

    // Función para marcar como leídos: envía WS + actualiza estado local
    const markAsRead = useCallback((contactNumber) => {
        sendReadConfirmation(contactNumber);
        // Actualización optimista: marcar todos los mensajes entrantes como 'visto' localmente
        setMessagesByChat(prev => {
            const msgs = prev[contactNumber];
            if (!msgs) return prev;
            const hasUnread = msgs.some(m => m.SenderTelephon === contactNumber && m.Status !== 'visto');
            if (!hasUnread) return prev;
            const updated = msgs.map(m =>
                m.SenderTelephon === contactNumber && m.Status !== 'visto'
                    ? { ...m, Status: 'visto' }
                    : m
            );
            return { ...prev, [contactNumber]: updated };
        });
    }, [sendReadConfirmation]);

    // Refs for WebSocket handlers to avoid stale closures
    const contactsRef = useRef([]);
    const profileRef = useRef(null);
    const selectedRef = useRef(null);
    const allChatGroupsRef = useRef({});

    useEffect(() => { contactsRef.current = contacts; }, [contacts]);
    useEffect(() => { profileRef.current = profile; }, [profile]);
    useEffect(() => { selectedRef.current = selected; }, [selected]);
    useEffect(() => { allChatGroupsRef.current = allChatGroups; }, [allChatGroups]);
    const avatarMapRef = useRef({});
    useEffect(() => { avatarMapRef.current = avatarMap; }, [avatarMap]);

    // Fetch initial data
    const fetchProfile = useCallback(async () => {
        try {
            const { data } = await api.get('/api/v1/user');
            setProfile(data);
            if (data?.avatar_url) setMyAvatar(data.avatar_url);
            if (data?.wallpaper_url) setGlobalWallpaper(data.wallpaper_url);
        } catch (err) {
            console.error('Error fetching profile:', err);
        }
    }, []);

    const fetchContacts = useCallback(async () => {
        try {
            const { data } = await api.get('/api/v1/contact');
            const list = Array.isArray(data) ? data : [];
            setContacts(list);
            
            const seenMap = {};
            const avMap = {};
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
            const { data } = await api.get('/api/v1/chats');
            const chatGroups = Array.isArray(data) ? data : [];

            // Poblar messagesByChat con los mensajes de cada grupo
            const msgMap = {};
            const groupMap = {};
            const chatAvatarMap = {};
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
            setMessagesByChat(msgMap);
            setAllChatGroups(groupMap);
            // Merge avatares de chats al avatarMap (contactos tienen prioridad, no sobreescribir)
            setAvatarMap(prev => ({ ...chatAvatarMap, ...prev }));
        } catch (err) {
            console.error('Error fetching all chats:', err);
        }
    }, []);

    // Cargar mensajes de un contacto específico (bajo demanda)
    const fetchChatMessages = useCallback(async (contactNumber) => {
        try {
            const { data } = await api.get(`/api/v1/chat/${contactNumber}`);
            const messages = Array.isArray(data) ? data : [];
            setMessagesByChat(prev => ({ ...prev, [contactNumber]: messages }));
        } catch (err) {
            console.error(`Error fetching messages for ${contactNumber}:`, err);
        }
    }, []);

    useEffect(() => {
        if (user) {
            fetchProfile();
            fetchContacts();
            fetchAllChats();
        }
    }, [user, fetchProfile, fetchContacts, fetchAllChats]);

    // WebSocket Handlers (Extracted from Dashboard.jsx)
    useEffect(() => {
        if (!isConnected) return;

        const handleIncomingMessage = (messageData) => {
            const myTelephon = profileRef.current?.Telephon;
            const currentSelected = selectedRef.current;
            const { SenderTelephon, Receptor, MessageID, Message, MediaType } = messageData;
            
            let contactNumber = SenderTelephon === myTelephon ? Receptor : SenderTelephon;
            
            setMessagesByChat(prev => {
                const existing = prev[contactNumber] || [];
                // logic for updating/replacing messages...
                const alreadyExists = existing.some(m => m.MessageID === MessageID);
                if (alreadyExists) return prev;
                return { ...prev, [contactNumber]: [...existing, messageData] };
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
                if (!body) body = Message || 'Nuevo mensaje';
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
        const handleReadConfirmation = (payload) => {
            const readerTelephon = payload?.from;
            if (!readerTelephon) return;
            // Actualizar todos los mensajes enviados a ese contacto a "visto"
            setMessagesByChat(prev => {
                const msgs = prev[readerTelephon];
                if (!msgs) return prev;
                const updated = msgs.map(m =>
                    m.Receptor === readerTelephon && (m.Status === 'enviado' || m.Status === 'entregado')
                        ? { ...m, Status: 'visto' }
                        : m
                );
                return { ...prev, [readerTelephon]: updated };
            });
        };

        // Handler: mensajes pendientes marcados como "entregado" (receptor se conectó)
        const handleMessageDelivered = (payload) => {
            const receiverTelephon = payload?.receiver;
            if (!receiverTelephon) return;
            // Actualizar todos los mensajes "enviado" dirigidos a ese receptor a "entregado"
            setMessagesByChat(prev => {
                const msgs = prev[receiverTelephon];
                if (!msgs) return prev;
                const updated = msgs.map(m =>
                    m.Receptor === receiverTelephon && m.Status === 'enviado'
                        ? { ...m, Status: 'entregado' }
                        : m
                );
                return { ...prev, [receiverTelephon]: updated };
            });
        };

        // Handler: un contacto cambió su avatar
        const handleAvatarChanged = (payload) => {
            if (!payload?.telephon) return;
            setAvatarMap(prev => ({ ...prev, [payload.telephon]: payload.avatar_url || '' }));
        };

        // Handler: un contacto cambió su username
        const handleUsernameChanged = (payload) => {
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
        const handleEditMessage = (updatedMsg) => {
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
        const handleDeleteMessage = (deletedMsg) => {
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

        on('message', handleIncomingMessage);
        on('read', handleReadConfirmation);
        on('message_delivered', handleMessageDelivered);
        on('avatar_changed', handleAvatarChanged);
        on('username_changed', handleUsernameChanged);
        on('edit_message', handleEditMessage);
        on('delete_message', handleDeleteMessage);

        return () => {
            off('message', handleIncomingMessage);
            off('read', handleReadConfirmation);
            off('message_delivered', handleMessageDelivered);
            off('avatar_changed', handleAvatarChanged);
            off('username_changed', handleUsernameChanged);
            off('edit_message', handleEditMessage);
            off('delete_message', handleDeleteMessage);
        };
    }, [isConnected, on, off, markAsRead]);

    // manejar clicks sobre notificaciones (fuerza apertura de chat)
    useEffect(() => {
        const handler = ({ telephon }) => {
            if (!telephon) return;
            // intentar seleccionar contacto o grupo existente
            const contact = contacts.find(c => c.Number === telephon);
            const group = allChatGroups[telephon];
            const sel = contact || group || { Number: telephon, Username: telephon, Status: 'unknown' };
            setSelected(sel);
            setSidebarView('chats');
            setSidebarOpen(false);
        };

        onNotificationClick(handler);
        // algunas notificaciones se disparan como evento de ventana
        window.addEventListener('notification-click', handler);
        return () => {
            offNotificationClick(handler);
            window.removeEventListener('notification-click', handler);
        };
    }, [contacts, allChatGroups, setSidebarView, setSidebarOpen]);

    const value = {
        profile, setProfile,
        myAvatar, setMyAvatar,
        globalWallpaper, setGlobalWallpaper,
        contacts, setContacts,
        onlineUsers, setOnlineUsers,
        typingUsers, setTypingUsers,
        lastSeenMap, setLastSeenMap,
        avatarMap, setAvatarMap,
        selected, setSelected,
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
        markAsRead,
        // WebSocket state & actions
        isConnected,
        sendMessage,
        sendTypingIndicator,
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
