import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '../../../api/axios';
import { getUserGroups, getGroupMessages, getGroupDetail } from '../../../api/groupApi';
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
    const {
        isConnected, on, off,
        sendMessage, sendReadConfirmation, sendTypingIndicator, sendEditMessage, sendDeleteMessage,
        sendCallOffer, sendCallAccept, sendCallReject, sendCallEnd,
        sendGroupMessage, sendGroupTyping, sendGroupEditMessage, sendGroupDeleteMessage,
        sendGroupJoin,
    } = useWebSocket();

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
    
    // Messaging — 1-to-1
    const [selected, setSelected] = useState(null);
    const [messagesByChat, setMessagesByChat] = useState({});
    const [allChatGroups, setAllChatGroups] = useState({});
    const [drafts, setDrafts] = useState({});

    // Groups
    const [groups, setGroups] = useState([]);
    const [groupMessages, setGroupMessages] = useState({}); // { [groupID]: GroupMessageResponse[] }
    const [selectedGroup, setSelectedGroupState] = useState(null);

    /** Set selected group and clear 1-to-1 selection (mutual exclusivity). */
    const setSelectedGroup = useCallback((group) => {
        setSelectedGroupState(group);
        if (group) setSelected(null);
    }, []);

    /** Override setSelected to also clear selectedGroup. */
    const setSelectedContact = useCallback((contact) => {
        setSelected(contact);
        if (contact) setSelectedGroupState(null);
    }, []);
    
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

    // Loading state — tracks which of the 4 initial fetches are done
    const [loadingSteps, setLoadingSteps] = useState({
        profile: false, contacts: false, chats: false, groups: false,
    });
    const markStep = useCallback((key) => {
        setLoadingSteps(prev => prev[key] ? prev : { ...prev, [key]: true });
    }, []);

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
        } finally {
            markStep('profile');
        }
    }, [markStep]);

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
        } finally {
            markStep('contacts');
        }
    }, [markStep]);

    // Renombra el alias local de un contacto vía PUT /api/v1/contact
    const renameContact = useCallback(async (number, newName) => {
        const trimmed = newName.trim();
        if (!trimmed) throw new Error('El nombre no puede estar vacío');
        await api.put('/api/v1/contact', { number, contact_name: trimmed });
        // Actualización optimista en lista de contactos
        setContacts(prev =>
            prev.map(c => c.Number === number ? { ...c, ContactName: trimmed } : c)
        );
        // Actualizar el contacto seleccionado si es el mismo
        setSelected(prev =>
            prev?.Number === number ? { ...prev, ContactName: trimmed } : prev
        );
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
        } finally {
            markStep('chats');
        }
    }, [markStep]);

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

    // Fetch groups belonging to the current user
    const fetchUserGroups = useCallback(async () => {
        try {
            const { data } = await getUserGroups();
            setGroups(Array.isArray(data?.groups) ? data.groups : []);
        } catch (err) {
            console.error('Error fetching groups:', err);
        } finally {
            markStep('groups');
        }
    }, [markStep]);

    // Fetch message history for a specific group (on demand)
    const fetchGroupMessages = useCallback(async (groupID) => {
        try {
            const { data } = await getGroupMessages(groupID);
            const messages = Array.isArray(data?.messages) ? data.messages : [];
            const sorted = [...messages].sort((a, b) => new Date(a.Time) - new Date(b.Time));
            setGroupMessages(prev => ({ ...prev, [groupID]: sorted }));
        } catch (err) {
            console.error(`Error fetching messages for group ${groupID}:`, err);
        }
    }, []);

    // Fetch full detail (with members) for a specific group and update selectedGroup
    const fetchGroupDetail = useCallback(async (groupID) => {
        try {
            const { data } = await getGroupDetail(groupID);
            // data is GroupDetail: GroupResponse + Members + Messages
            setSelectedGroupState(prev => {
                // Only update if it's still the same group selected
                if (prev?.ID !== groupID) return prev;
                return { ...prev, ...data };
            });
            // Pre-populate message cache if backend returned messages
            if (Array.isArray(data?.Messages) && data.Messages.length > 0) {
                const sorted = [...data.Messages].sort((a, b) => new Date(a.Time) - new Date(b.Time));
                setGroupMessages(prev => ({
                    ...prev,
                    [groupID]: sorted,
                }));
            }
        } catch (err) {
            console.error(`Error fetching detail for group ${groupID}:`, err);
        }
    }, []);

    // Reset loading steps when user changes (re-login)
    useEffect(() => {
        if (user) {
            setLoadingSteps({ profile: false, contacts: false, chats: false, groups: false });
            fetchProfile();
            fetchContacts();
            fetchAllChats();
            fetchUserGroups();
        }
    }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

    const dataReady = loadingSteps.profile && loadingSteps.contacts && loadingSteps.chats && loadingSteps.groups;

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

        // ── Group event handlers ───────────────────────────────────────────────────

        /** Incoming group message (from sender confirm or group broadcast). */
        const handleGroupChatMessage = (msg) => {
            if (!msg?.GroupID) return;
            setGroupMessages(prev => {
                const existing = prev[msg.GroupID] || [];
                if (existing.some(m => m.MessageID === msg.MessageID)) return prev;
                return { ...prev, [msg.GroupID]: [...existing, msg] };
            });
        };

        /** Someone in a group is typing. */
        const handleGroupTyping = (payload) => {
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
        const handleGroupEditMessage = (updatedMsg) => {
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
        const handleGroupDeleteMessage = (deletedMsg) => {
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
        const handleGroupAdded = (_payload) => {
            fetchUserGroups();
        };

        /** The group description was updated — update state and inject a system message. */
        const handleGroupDescriptionUpdate = (payload) => {
            if (!payload?.groupID) return;
            // 1. Update description in group state
            setGroups(prev => prev.map(g =>
                g.ID === payload.groupID ? { ...g, Description: payload.description } : g
            ));
            setSelectedGroup(prev =>
                prev?.ID === payload.groupID ? { ...prev, Description: payload.description } : prev
            );
            // 2. Inject system message visible to everyone
            const editor = payload.changedByUsername || payload.changedBy || 'Alguien';
            const text = payload.description
                ? `${editor} editó la descripción del grupo`
                : `${editor} eliminó la descripción del grupo`;
            const systemMsg = {
                MessageID: `system_desc_${Date.now()}_${Math.random()}`,
                GroupID: payload.groupID,
                IsSystem: true,
                Message: text,
                Time: new Date().toISOString(),
            };
            setGroupMessages(prev => {
                const msgs = prev[payload.groupID] || [];
                return { ...prev, [payload.groupID]: [...msgs, systemMsg] };
            });
        };

        /** A group avatar was updated — update it in the groups list and selectedGroup. */
        const handleGroupAvatarUpdate = (payload) => {
            if (!payload?.groupID || !payload?.avatarUrl) return;
            setGroups(prev => prev.map(g =>
                g.ID === payload.groupID ? { ...g, AvatarUrl: payload.avatarUrl } : g
            ));
            setSelectedGroup(prev =>
                prev?.ID === payload.groupID ? { ...prev, AvatarUrl: payload.avatarUrl } : prev
            );
        };

        /** Members were added to a group — inject system messages and update member list. */
        const handleGroupMemberAdded = (payload) => {
            if (!payload?.groupID || !payload?.addedMembers?.length) return;
            const adder = payload.addedByUsername || 'Alguien';
            const now = Date.now();
            const systemMsgs = payload.addedMembers.map((m, i) => ({
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
            setSelectedGroup(prev => {
                if (!prev || prev.ID !== payload.groupID) return prev;
                const newMembers = (payload.addedMembers || []).map(m => ({
                    Telephon: m.telephon,
                    Username: m.username,
                    Role: 'member',
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
        const handleGroupMemberLeft = (payload) => {
            if (!payload?.groupID) return;
            const displayName = payload.username || payload.telephon;
            const systemMsg = {
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
            setSelectedGroup(prev => {
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
        /** A member's role was changed by an admin — update local member list. */
        const handleGroupRoleChanged = (payload) => {
            if (!payload?.groupID || !payload?.targetTelephon) return;
            // 1. Inject system message (visible to everyone in the group)
            const changedBy = payload.changedByUsername || payload.changedBy;
            const target    = payload.targetUsername    || payload.targetTelephon;
            const text = payload.newRole === 'admin'
                ? `${changedBy} nombró administrador a ${target}`
                : `${changedBy} quitó el rol de administrador a ${target}`;
            const systemMsg = {
                MessageID: `system_role_${Date.now()}_${Math.random()}`,
                GroupID: payload.groupID,
                IsSystem: true,
                Message: text,
                Time: new Date().toISOString(),
            };
            setGroupMessages(prev => {
                const msgs = prev[payload.groupID] || [];
                return { ...prev, [payload.groupID]: [...msgs, systemMsg] };
            });
            // 2. Update the member's role in the members list
            setSelectedGroup(prev => {
                if (!prev || prev.ID !== payload.groupID) return prev;
                return {
                    ...prev,
                    Members: (prev.Members || []).map(m =>
                        m.Telephon === payload.targetTelephon ? { ...m, Role: payload.newRole } : m
                    ),
                };
            });
        };

        on('group_added', handleGroupAdded);
        on('group_description_update', handleGroupDescriptionUpdate);
        on('group_avatar_update', handleGroupAvatarUpdate);
        on('group_member_added', handleGroupMemberAdded);
        on('group_member_left', handleGroupMemberLeft);
        on('group_role_changed', handleGroupRoleChanged);

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
            off('group_description_update', handleGroupDescriptionUpdate);
            off('group_avatar_update', handleGroupAvatarUpdate);
            off('group_member_added', handleGroupMemberAdded);
            off('group_member_left', handleGroupMemberLeft);
            off('group_role_changed', handleGroupRoleChanged);
        };
    }, [isConnected, on, off, markAsRead, fetchUserGroups]);

    // Whenever the user opens a group (or reconnects while one is open), re-join the WS room.
    // This is the definitive fix for "admin sends a message and others don't see it in real time".
    useEffect(() => {
        if (!selectedGroup?.ID || !isConnected) return;
        sendGroupJoin(selectedGroup.ID);
    }, [selectedGroup?.ID, isConnected, sendGroupJoin]);

    // manejar clicks sobre notificaciones (fuerza apertura de chat)
    useEffect(() => {
        const handler = ({ telephon }) => {
            if (!telephon) return;
            // intentar seleccionar contacto o grupo existente
            const contact = contacts.find(c => c.Number === telephon);
            const group = allChatGroups[telephon];
            const sel = contact || group || { Number: telephon, Username: telephon, Status: 'unknown' };
            setSelectedContact(sel);
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
    }, [contacts, allChatGroups, setSidebarView, setSidebarOpen, setSelectedContact]);

    const value = {
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
        renameContact,
        fetchProfile,
        fetchAllChats,
        fetchChatMessages,
        markAsRead,
        // Groups
        groups, setGroups,
        groupMessages, setGroupMessages,
        selectedGroup, setSelectedGroup,
        fetchUserGroups,
        fetchGroupMessages,
        fetchGroupDetail,
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
        logout,
        // Loading state
        dataReady,
        loadingSteps,
    };

    return (
        <DashboardContext.Provider value={value}>
            {children}
        </DashboardContext.Provider>
    );
};
