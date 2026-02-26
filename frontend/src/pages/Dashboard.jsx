import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import api from '../api/axios';
import CallRoom from '../components/CallRoom';
import IncomingCall from '../components/IncomingCall';
import CallHistory from '../components/CallHistory';
import MediaUploadMenu from '../components/MediaUploadMenu';
import AudioPlayer from '../components/AudioPlayer';
import PermissionsDialog from '../components/PermissionsDialog';
import {
    requestNotificationPermission,
    showNativeNotification,
    getNotificationPermission,
    onNotificationClick,
    offNotificationClick
} from '../utils/notifications.js';
import { needsPermissionsPrompt } from '../utils/permissions.js';

export default function Dashboard() {
    const { user, logout, updateUsername } = useAuth();
    const { isConnected, sendMessage, sendReadConfirmation, sendTypingIndicator, sendEditMessage, sendDeleteMessage, sendCallOffer, sendCallAccept, sendCallReject, sendCallEnd, on, off } = useWebSocket();
        const [messageMenuOpen, setMessageMenuOpen] = useState(null); // MessageID del menú abierto

    // ========== Estado de llamadas ==========
    const [callState, setCallState] = useState(null);
    // callState shape: { roomID, remoteTelephon, remoteName, callType, role: 'caller'|'receiver', status: 'ringing'|'active' } | null
    const [incomingCall, setIncomingCall] = useState(null);
    // incomingCall shape: { from, username, roomID, callType } | null

        // Manejar borrado de mensaje propio
        const handleDeleteMessage = (message) => {
            if (!window.confirm('¿Seguro que quieres eliminar este mensaje para todos?')) return;
            if (isConnected && sendDeleteMessage) {
                sendDeleteMessage(message.MessageID, selected?.Number);
            } else {
                alert('No conectado. Intenta de nuevo.');
            }
            setMessageMenuOpen(null);
        };

        // Manejar borrado de mensaje solo para mí
        const handleDeleteMessageForMe = async (message) => {
            if (!window.confirm('¿Seguro que quieres eliminar este mensaje para ti?')) return;
            try {
                await api.delete(`/api/v1/message/${message.MessageID}/me`);
                // Actualizar estado local
                setMessagesByChat((prev) => {
                    const updated = { ...prev };
                    Object.keys(updated).forEach((key) => {
                        updated[key] = (updated[key] || []).filter(m => m.MessageID !== message.MessageID);
                    });
                    return updated;
                });
            } catch (err) {
                console.error('Error al eliminar mensaje para mí:', err);
                alert('Error al eliminar el mensaje');
            }
            setMessageMenuOpen(null);
        };
    const [profile, setProfile] = useState(null);
    const [error, setError] = useState('');
    const [showProfile, setShowProfile] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [viewImage, setViewImage] = useState(null);
    const [showContactDetails, setShowContactDetails] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newAvatarFile, setNewAvatarFile] = useState(null);
    const [newAvatarPreview, setNewAvatarPreview] = useState(null);
    const [removeAvatar, setRemoveAvatar] = useState(false);
    const [status, setStatus] = useState('');
    // Wallpaper global (perfil) y por chat (contacto)
    const [globalWallpaper, setGlobalWallpaper] = useState(''); // URL del fondo global del usuario
    const [chatWallpapers, setChatWallpapers] = useState({}); // { telephon: url }
    const [showWallpaperPicker, setShowWallpaperPicker] = useState(null); // null | 'global' | 'contact'
    const [uploadingWallpaper, setUploadingWallpaper] = useState(false);
    const [wallpaperChanged, setWallpaperChanged] = useState(false);
    const [contacts, setContacts] = useState([]);
    const [avatarMap, setAvatarMap] = useState({}); // {telephon: avatar_url}
    const [myAvatar, setMyAvatar] = useState(''); // avatar del propio usuario
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [selected, setSelected] = useState(null);
    const [numberInput, setNumberInput] = useState('');
    const [contactNameInput, setContactNameInput] = useState('');
    const [addMsg, setAddMsg] = useState('');
    const [sidebarView, setSidebarView] = useState('contacts'); // 'contacts', 'chats' o 'calls'
    const [showAddContactForm, setShowAddContactForm] = useState(false);
    const [drafts, setDrafts] = useState({});
    const [messagesByChat, setMessagesByChat] = useState({});
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    const [typingUsers, setTypingUsers] = useState(new Set()); // Usuarios que están escribiendo
    const [lastSeenMap, setLastSeenMap] = useState({}); // {telephon: dateString} última conexión
    const [sidebarOpen, setSidebarOpen] = useState(false); // Estado para sidebar en móvil
    const [replyingTo, setReplyingTo] = useState(null); // Mensaje al que se está respondiendo
    const [allChatGroups, setAllChatGroups] = useState({}); // metadata de todos los chats {telephon -> ChatGroup}
    const [toasts, setToasts] = useState([]); // notificaciones toast {id, senderName, message, telephon}
    const [notifPermission, setNotifPermission] = useState(getNotificationPermission());
    const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
    // Estado de edición de contacto
    const [editingContact, setEditingContact] = useState(null); // Number del contacto que se está editando
    const [editContactName, setEditContactName] = useState('');
    const [editContactError, setEditContactError] = useState('');
    const [editContactLoading, setEditContactLoading] = useState(false);
    // Estado de edición de mensaje
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [editingMessageText, setEditingMessageText] = useState('');
    // Estado de Media y Grabación
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recordingTimerRef = useRef(null);

        // Iniciar edición de mensaje
        const handleEditMessage = (message) => {
            setEditingMessageId(message.MessageID);
            setEditingMessageText(message.Message);
        };

        // Cancelar edición de mensaje
        const handleEditMessageCancel = () => {
            setEditingMessageId(null);
            setEditingMessageText('');
        };

        // Cambiar texto mientras se edita
        const handleEditMessageChange = (e) => {
            setEditingMessageText(e.target.value);
        };

        // Guardar mensaje editado
        const handleEditMessageSave = (message) => {
            const newText = editingMessageText.trim();
            if (!newText || newText === message.Message) {
                handleEditMessageCancel();
                return;
            }
            // Enviar edición por WebSocket
            if (isConnected && sendEditMessage) {
                sendEditMessage(message.MessageID, selected?.Number, newText);
            } else {
                alert('No conectado. Intenta de nuevo.');
            }
            // La actualización local se hará cuando llegue el evento edit_message por WebSocket
            handleEditMessageCancel();
        };
    // Estado de carga inicial (pantalla splash)
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [loadingContacts, setLoadingContacts] = useState(true);
    const [loadingChats, setLoadingChats] = useState(true);
    const isInitialLoading = loadingProfile || loadingContacts;
    const messagesContainerRef = useRef(null);
    const typingTimeoutRef = useRef(null); // Para debounce del typing indicator
    // Refs que siempre apuntan al valor actualizado (evitan closures stale en handlers WS)
    const contactsRef = useRef([]);
    const profileRef = useRef(null);
    const selectedRef = useRef(null);

    // Mostrar notificación (nativa del SO, toast in-app solo como fallback)
    const showToast = (telephon, senderName, message) => {
        // Obtener el avatar del contacto si existe
        const contactAvatar = avatarMap[telephon] || '/vite.svg';
        
        // Las notificaciones nativas (Service Worker/OS) requieren URLs absolutas
        const absoluteIcon = contactAvatar.startsWith('http') 
            ? contactAvatar 
            : `${window.location.origin}${contactAvatar.startsWith('/') ? '' : '/'}${contactAvatar}`;

        // 1. Intentar notificación nativa del sistema operativo
        const nativeShown = showNativeNotification({
            title: senderName,
            body: message.length > 100 ? message.substring(0, 100) + '...' : message,
            icon: absoluteIcon,
            tag: `chat-${telephon}`, // Agrupa por contacto
            data: { telephon }
        });

        // 2. Toast in-app SOLO si la notificación nativa no se pudo mostrar
        if (!nativeShown) {
            const id = Date.now();
            setToasts(prev => [...prev, { id, telephon, senderName, message, icon: contactAvatar }]);
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, 4000);
        }
    };
    const dismissToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

    // Verificar permisos al montar: mostrar diálogo si hay alguno sin decidir
    useEffect(() => {
        needsPermissionsPrompt().then(needed => {
            if (needed) setShowPermissionsDialog(true);
            // Si notificaciones ya está concedida, actualizar estado
            setNotifPermission(getNotificationPermission());
        });
    }, []);

    // Escuchar clicks en notificaciones nativas para abrir el chat correspondiente
    useEffect(() => {
        const handleNotifClick = ({ telephon }) => {
            const contact = contactsRef.current.find(c => c.Number === telephon);
            if (contact) {
                setSelected(contact);
                setSidebarOpen(false);
            }
        };

        onNotificationClick(handleNotifClick);

        // También escuchar el evento de fallback (Notification API directa)
        const handleWindowNotifClick = (e) => handleNotifClick(e.detail);
        window.addEventListener('notification-click', handleWindowNotifClick);

        return () => {
            offNotificationClick(handleNotifClick);
            window.removeEventListener('notification-click', handleWindowNotifClick);
        };
    }, []);

    // onlineUsers ahora contiene números de teléfono (telephon), no usernames
    const isContactOnline = (telephon) => onlineUsers.has(telephon);
    // typingUsers ahora contiene números de teléfono (telephon), no usernames
    const isContactTyping = (telephon) => typingUsers.has(telephon);

    // Formatear última vez visto
    const formatLastSeen = (dateStr) => {
        if (!dateStr) return null;
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return null;
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday = date.toDateString() === yesterday.toDateString();
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (isToday) return `últ. vez hoy a las ${timeStr}`;
        if (isYesterday) return `últ. vez ayer a las ${timeStr}`;
        const dateFormatted = date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
        return `últ. vez el ${dateFormatted} a las ${timeStr}`;
    };
    const getLastSeenText = (telephon) => formatLastSeen(lastSeenMap[telephon]);

    // Mantener refs siempre sincronizados con sus estados
    useEffect(() => {
        contactsRef.current = contacts;
    }, [contacts]);

    useEffect(() => {
        profileRef.current = profile;
    }, [profile]);

    useEffect(() => {
        selectedRef.current = selected;
    }, [selected]);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const { data } = await api.get('/api/v1/user');
                setProfile(data);
                if (data?.avatar_url) setMyAvatar(data.avatar_url);
                if (data?.wallpaper_url) setGlobalWallpaper(data.wallpaper_url);
            } catch {
                setError('No se pudo cargar el perfil');
            } finally {
                setLoadingProfile(false);
            }
        };
        fetchProfile();
    }, []);

    // Escuchar mensajes del WebSocket
    // IMPORTANTE: usar profileRef / selectedRef / contactsRef (no los estados directos)
    // para evitar stale closures — los refs siempre tienen el valor actual.
    useEffect(() => {

        // Handler para eliminar mensaje por WebSocket
        // Efecto de desvanecido al eliminar mensaje
        const handleDeleteMessageWs = (deletedMsg) => {
            const { MessageID } = deletedMsg;
            // 1. Marcar el mensaje como isDeleting
            setMessagesByChat((prev) => {
                const updated = { ...prev };
                Object.keys(updated).forEach((key) => {
                    updated[key] = (updated[key] || []).map(m =>
                        m.MessageID === MessageID ? { ...m, isDeleting: true } : m
                    );
                });
                return updated;
            });
            // 2. Quitar el mensaje tras el fade (400ms)
            setTimeout(() => {
                setMessagesByChat((prev) => {
                    const updated = { ...prev };
                    Object.keys(updated).forEach((key) => {
                        updated[key] = (updated[key] || []).filter(m => m.MessageID !== MessageID);
                    });
                    return updated;
                });
            }, 400);
        };

        // Handler para editar mensaje por WebSocket
        const handleEditMessageWs = (editedMsg) => {
            // Si el mensaje viene como {type, payload}, usar editedMsg.payload
            const msg = editedMsg.payload ? editedMsg.payload : editedMsg;
            const { MessageID } = msg;
            setMessagesByChat((prev) => {
                const updated = { ...prev };
                Object.keys(updated).forEach((key) => {
                    updated[key] = (updated[key] || []).map(m =>
                        m.MessageID === MessageID ? { ...m, ...msg } : m
                    );
                });
                return updated;
            });
        };

        const handleIncomingMessage = (messageData) => {
            console.log('Mensaje recibido por WebSocket:', messageData);
            
            // Leer siempre desde los refs (nunca stale)
            const myTelephon = profileRef.current?.Telephon;
            const currentSelected = selectedRef.current;

            const { SenderTelephon, Receptor, MessageID, Message } = messageData;
            
            // Determinar con quién es el chat
            let contactNumber;
            if (SenderTelephon === myTelephon) {
                contactNumber = Receptor;
            } else {
                contactNumber = SenderTelephon;
            }
            
            const key = contactNumber;
            console.log('Guardando mensaje para contacto:', contactNumber, 'Key:', key);
            
            // Actualizar el estado de mensajes
            setMessagesByChat((prev) => {
                const existing = prev[key] || [];
                
                if (SenderTelephon === myTelephon) {
                    // Confirmación de mensaje propio: reemplazar el optimista temporal
                    const tempIndex = existing.findIndex(m => 
                        typeof m.MessageID === 'string' && m.MessageID.startsWith('temp-') && 
                        m.Message === Message && 
                        m.Receptor === Receptor
                    );
                    if (tempIndex !== -1) {
                        console.log('Reemplazando mensaje temporal con mensaje real:', MessageID);
                        const updated = [...existing];
                        updated[tempIndex] = messageData;
                        return { ...prev, [key]: updated };
                    }
                } else {
                    // Mensaje recibido: si el chat está abierto, marcarlo visto localmente
                    if (currentSelected?.Number === contactNumber) {
                        const tempIndex = existing.findIndex(m => 
                            typeof m.MessageID === 'string' && m.MessageID.startsWith('temp-') && 
                            m.Message === Message
                        );
                        if (tempIndex !== -1) {
                            const updated = [...existing];
                            updated[tempIndex] = { ...messageData, Status: 'visto' };
                            return { ...prev, [key]: updated };
                        }
                    }
                }
                
                // Verificar si el mensaje ya existe
                const alreadyExists = existing.some(m => m.MessageID === MessageID);
                if (alreadyExists) {
                    console.log('Actualizando mensaje existente:', MessageID);
                    const shouldMarkAsRead = (SenderTelephon !== myTelephon && currentSelected?.Number === contactNumber);
                    return {
                        ...prev,
                        [key]: existing.map(m => {
                            if (m.MessageID === MessageID) {
                                return shouldMarkAsRead ? { ...messageData, Status: 'visto' } : messageData;
                            }
                            return m;
                        })
                    };
                } else {
                    console.log('Agregando nuevo mensaje:', MessageID);
                    const messageToAdd = (SenderTelephon !== myTelephon && currentSelected?.Number === contactNumber)
                        ? { ...messageData, Status: 'visto' }
                        : messageData;
                    return { ...prev, [key]: [...existing, messageToAdd] };
                }
            });

            // Auto-read si el chat está abierto
            if (SenderTelephon !== myTelephon && currentSelected?.Number === contactNumber && isConnected) {
                console.log('[AUTO-READ] Marcando como visto porque el chat está abierto:', contactNumber);
                sendReadConfirmation(contactNumber);
            }

            // Toast: solo si el mensaje es de otro y ese chat NO está abierto ahora mismo
            if (SenderTelephon !== myTelephon && currentSelected?.Number !== contactNumber) {
                const existingContact = contactsRef.current.find(c => c.Number === SenderTelephon);
                const senderName = existingContact?.ContactName || existingContact?.Username || SenderTelephon;
                showToast(SenderTelephon, senderName, messageData.Message);
            }

            // Actualizar allChatGroups para el remitente
            if (SenderTelephon !== myTelephon) {
                setAllChatGroups(prev => {
                    if (prev[SenderTelephon]) {
                        const isNowContact = contactsRef.current.some(
                            c => c.Number === SenderTelephon && c.Status === 'accepted'
                        );
                        if (prev[SenderTelephon].IsContact === isNowContact) return prev;
                        return { ...prev, [SenderTelephon]: { ...prev[SenderTelephon], IsContact: isNowContact } };
                    }
                    const existingContact = contactsRef.current.find(
                        c => c.Number === SenderTelephon && c.Status === 'accepted'
                    );
                    return {
                        ...prev,
                        [SenderTelephon]: {
                            ContactTelephon: SenderTelephon,
                            ContactUsername: existingContact?.Username || SenderTelephon,
                            ContactName: existingContact?.ContactName || '',
                            IsContact: !!existingContact,
                            Messages: []
                        }
                    };
                });
            }
        };

        const handleReadConfirmation = (readData) => {
            console.log('Confirmación de lectura recibida:', readData);
            
            const myTelephon = profileRef.current?.Telephon;
            if (!readData || !readData.from || !myTelephon) {
                console.warn('Datos de confirmación inválidos:', readData);
                return;
            }
            
            const { from } = readData;
            const key = from;
            
            setMessagesByChat((prev) => {
                const existing = prev[key] || [];
                return {
                    ...prev,
                    [key]: existing.map(m => {
                        if (!m) return m;
                        return m.SenderTelephon === myTelephon && m.Status !== 'visto'
                            ? { ...m, Status: 'visto' }
                            : m;
                    })
                };
            });
        };

        const handleDelivered = (data) => {
            const myTelephon = profileRef.current?.Telephon;
            if (!data?.receiver || !myTelephon) return;
            const key = data.receiver; // telephon del receptor que se conectó
            setMessagesByChat((prev) => {
                const existing = prev[key] || [];
                return {
                    ...prev,
                    [key]: existing.map(m => {
                        if (!m) return m;
                        return m.SenderTelephon === myTelephon && m.Status === 'enviado'
                            ? { ...m, Status: 'entregado' }
                            : m;
                    })
                };
            });
        };

        on('message', handleIncomingMessage);
        on('read', handleReadConfirmation);
        on('message_delivered', handleDelivered);
        on('delete_message', handleDeleteMessageWs);
        on('edit_message', handleEditMessageWs);

        return () => {
            off('message', handleIncomingMessage);
            off('read', handleReadConfirmation);
            off('message_delivered', handleDelivered);
            off('delete_message', handleDeleteMessageWs);
            off('edit_message', handleEditMessageWs);
        };
    }, [on, off, isConnected, sendReadConfirmation]); // profile/selected/contacts leídos desde refs → no en deps

    // Escuchar eventos de presencia (online/offline)
    useEffect(() => {
        const handleContactsOnline = (contacts) => {
            console.log('[DASHBOARD] Contactos online iniciales:', contacts);
            console.log('[DASHBOARD] Tipo de contacts:', typeof contacts, Array.isArray(contacts));
            console.log('[DASHBOARD] Valor de contacts:', JSON.stringify(contacts));
            if (Array.isArray(contacts)) {
                // contacts es un array de telephons
                setOnlineUsers(new Set(contacts));
            } else {
                console.error('[DASHBOARD] contacts no es un array:', contacts);
                setOnlineUsers(new Set());
            }
        };

        const handleUserOnline = (payload) => {
            console.log('[DASHBOARD] Usuario conectado:', payload);
            // payload.telephon contiene el número de teléfono del usuario que se conectó
            if (payload && payload.telephon) {
                setOnlineUsers(prev => {
                    const newSet = new Set([...prev, payload.telephon]);
                    console.log('[DASHBOARD] Estado online actualizado:', Array.from(newSet));
                    return newSet;
                });
            }
        };

        const handleUserOffline = (payload) => {
            console.log('[DASHBOARD] Usuario desconectado:', payload);
            // payload.telephon contiene el número de teléfono del usuario que se desconectó
            if (payload && payload.telephon) {
                setOnlineUsers(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(payload.telephon);
                    console.log('[DASHBOARD] Estado online actualizado:', Array.from(newSet));
                    return newSet;
                });
                // Guardar last_seen del payload
                if (payload.last_seen) {
                    setLastSeenMap(prev => ({ ...prev, [payload.telephon]: payload.last_seen }));
                }
            }
        };

        on('contacts_online', handleContactsOnline);
        on('online', handleUserOnline);
        on('offline', handleUserOffline);

        return () => {
            off('contacts_online', handleContactsOnline);
            off('online', handleUserOnline);
            off('offline', handleUserOffline);
        };
    }, [on, off]);

    // Escuchar eventos de typing
    useEffect(() => {
        const handleTyping = (typingData) => {
            if (!typingData || !typingData.from) return;
            
            const { from } = typingData;
            console.log('[DASHBOARD] Usuario escribiendo:', from);
            
            // Agregar al conjunto de usuarios escribiendo
            setTypingUsers(prev => new Set([...prev, from]));
            
            // Remover después de 3 segundos (timeout de inactividad)
            setTimeout(() => {
                setTypingUsers(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(from);
                    return newSet;
                });
            }, 3000);
        };

        on('typing', handleTyping);

        return () => {
            off('typing', handleTyping);
        };
    }, [on, off]);

    // ========== Listeners de llamadas ==========
    useEffect(() => {
        const handleIncomingCall = (payload) => {
            console.log('[CALL] Llamada entrante:', payload);
            // Si ya estamos en una llamada, rechazar automáticamente
            if (callState) {
                sendCallReject(payload.from, payload.roomID);
                return;
            }
            setIncomingCall(payload);
        };

        const handleCallAccepted = (payload) => {
            console.log('[CALL] Llamada aceptada:', payload);
            setCallState(prev => prev ? { ...prev, status: 'active' } : prev);
        };

        const handleCallRejected = (payload) => {
            console.log('[CALL] Llamada rechazada:', payload);
            setCallState(null);
            alert('La llamada fue rechazada');
        };

        const handleCallEnded = (payload) => {
            console.log('[CALL] Llamada finalizada:', payload);
            setCallState(null);
        };

        const handleCallUnavailable = (payload) => {
            console.log('[CALL] Usuario no disponible:', payload);
            setCallState(null);
            alert(payload?.reason || 'Usuario no disponible');
        };

        on('incoming_call', handleIncomingCall);
        on('call_accepted', handleCallAccepted);
        on('call_rejected', handleCallRejected);
        on('call_ended', handleCallEnded);
        on('call_unavailable', handleCallUnavailable);

        return () => {
            off('incoming_call', handleIncomingCall);
            off('call_accepted', handleCallAccepted);
            off('call_rejected', handleCallRejected);
            off('call_ended', handleCallEnded);
            off('call_unavailable', handleCallUnavailable);
        };
    }, [on, off, callState, sendCallReject]);

    // Funciones de llamada
    const handleStartCall = useCallback((callType = 'video') => {
        if (!selected || !isConnected) return;
        const roomID = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setCallState({
            roomID,
            remoteTelephon: selected.Number,
            remoteName: selected.ContactName || selected.Username,
            callType,
            role: 'caller',
            status: 'ringing'
        });
        sendCallOffer(selected.Number, roomID, callType);
    }, [selected, isConnected, sendCallOffer]);

    const handleAcceptIncomingCall = useCallback(() => {
        if (!incomingCall) return;
        sendCallAccept(incomingCall.from, incomingCall.roomID);
        setCallState({
            roomID: incomingCall.roomID,
            remoteTelephon: incomingCall.from,
            remoteName: incomingCall.username,
            callType: incomingCall.callType,
            role: 'receiver',
            status: 'active'
        });
        setIncomingCall(null);
    }, [incomingCall, sendCallAccept]);

    const handleRejectIncomingCall = useCallback(() => {
        if (!incomingCall) return;
        sendCallReject(incomingCall.from, incomingCall.roomID);
        setIncomingCall(null);
    }, [incomingCall, sendCallReject]);

    const handleEndCall = useCallback(() => {
        if (callState) {
            sendCallEnd(callState.remoteTelephon, callState.roomID);
        }
        setCallState(null);
    }, [callState, sendCallEnd]);

    // Escuchar cambios de username de contactos
    useEffect(() => {
        const handleUsernameChanged = (payload) => {
            console.log('[DASHBOARD] Evento username_changed recibido:', payload);
            
            const { old_username, new_username } = payload;
            
            // Validar que tenemos los datos necesarios
            if (!old_username || !new_username) {
                console.error('[DASHBOARD] Evento username_changed inválido:', payload);
                return;
            }
            
            // IMPORTANTE: Si el nuevo username es el mío, significa que YO cambié mi nombre
            // Este evento fue enviado a mis contactos, no debo procesarlo yo mismo
            if (user?.username === new_username) {
                console.log('[DASHBOARD] Ignorando evento: yo cambié mi propio nombre');
                return;
            }
            
            console.log(`[DASHBOARD] Procesando cambio de contacto: ${old_username} -> ${new_username}`);
            
            // Actualizar la lista de contactos
            setContacts(prev => prev.map(c => 
                c.Username === old_username 
                    ? { ...c, Username: new_username } 
                    : c
            ));
            
            // Si el contacto está seleccionado, actualizar también
            setSelected(prev => {
                if (prev && prev.Username === old_username) {
                    const updated = { ...prev, Username: new_username };
                    console.log(`[DASHBOARD] ✅ SELECTED actualizado: "${old_username}" -> "${new_username}"`, updated);
                    return updated;
                }
                console.log('[DASHBOARD] Selected no requiere actualización:', prev?.Username);
                return prev;
            });
            
            // Actualizar mensajes en cache (actualizar la key del chat)
            // No eliminamos la key antigua para evitar reordenamiento del objeto
            setMessagesByChat(prev => {
                const oldKey = old_username;
                const newKey = new_username;
                
                if (prev[oldKey]) {
                    // Copiar mensajes a la nueva key sin eliminar la antigua
                    // Esto mantiene el orden del objeto estable
                    return {
                        ...prev,
                        [newKey]: prev[oldKey]
                    };
                }
                return prev;
            });
            
            // Actualizar drafts
            setDrafts(prev => {
                const oldKey = old_username;
                const newKey = new_username;
                
                if (prev[oldKey]) {
                    // Copiar draft a la nueva key sin eliminar la antigua
                    return {
                        ...prev,
                        [newKey]: prev[oldKey]
                    };
                }
                return prev;
            });
            
            // onlineUsers contiene telephons (no cambian al cambiar username), no hay nada que actualizar
            
            // Actualizar usuarios escribiendo si aplica (typing también usa telephon)
            // El telephon no cambia al cambiar username, así que no hay nada que actualizar
            
            // Mostrar notificación
            console.log(`[DASHBOARD] ${old_username} cambió su nombre a ${new_username}`);
        };

        on('username_changed', handleUsernameChanged);

        return () => {
            off('username_changed', handleUsernameChanged);
        };
    }, [on, off]);

    // Escuchar cambios de avatar en tiempo real
    useEffect(() => {
        const handleAvatarChanged = (payload) => {
            if (!payload?.telephon || !payload?.avatar_url) return;
            const { telephon, avatar_url } = payload;
            setAvatarMap(prev => ({ ...prev, [telephon]: avatar_url }));
            // Si es el propio usuario actualizar myAvatar también
            if (profile && telephon === profile.Telephon) {
                setMyAvatar(avatar_url);
            }
        };
        on('avatar_changed', handleAvatarChanged);
        return () => off('avatar_changed', handleAvatarChanged);
    }, [on, off, profile]);

    // Escuchar solicitudes y respuestas de contacto en tiempo real
    useEffect(() => {
        const handleContactRequest = (payload) => {
            console.log('[DASHBOARD] Solicitud de contacto recibida:', payload);
            // Refrescar la lista de contactos para mostrar la solicitud pendiente
            api.get('/api/v1/contact').then(({ data }) => {
                const list = Array.isArray(data) ? data : [];
                setContacts(list);
                contactsRef.current = list;
            }).catch(() => {});
        };

        const handleContactResponse = (payload) => {
            console.log('[DASHBOARD] Respuesta de contacto recibida:', payload);
            // Refrescar la lista de contactos
            api.get('/api/v1/contact').then(({ data }) => {
                const list = Array.isArray(data) ? data : [];
                setContacts(list);
                contactsRef.current = list;
            }).catch(() => {});

            // Si fue aceptada, el contacto podría estar online ahora
            if (payload && payload.accepted && payload.number) {
                setOnlineUsers(prev => {
                    const newSet = new Set(prev);
                    // El backend envía una notificación online después de aceptar,
                    // pero añadimos el número directamente por si hay delay
                    newSet.add(payload.number);
                    return newSet;
                });
            }
        };

        on('contact_request', handleContactRequest);
        on('contact_response', handleContactResponse);

        return () => {
            off('contact_request', handleContactRequest);
            off('contact_response', handleContactResponse);
        };
    }, [on, off]);

    useEffect(() => {
        const fetchContacts = async () => {
            try {
                const { data } = await api.get('/api/v1/contact');
                const list = Array.isArray(data) ? data : [];
                setContacts(list);
                contactsRef.current = list; // mantener ref sincronizada
                // Extraer last_seen de cada contacto
                const seenMap = {};
                const avMap = {};
                const wpMap = {};
                list.forEach(c => {
                    if (c.last_seen) seenMap[c.Number] = c.last_seen;
                    if (c.avatar_url) avMap[c.Number] = c.avatar_url;
                    if (c.wallpaper_url) wpMap[c.Number] = c.wallpaper_url;
                });
                setLastSeenMap(prev => ({ ...prev, ...seenMap }));
                setAvatarMap(prev => ({ ...prev, ...avMap }));
                setChatWallpapers(prev => ({ ...prev, ...wpMap }));
            } catch (e) {
                setAddMsg('No se pudo cargar contactos');
            } finally {
                setLoadingContacts(false);
            }
        };
        fetchContacts();
    }, []);

    const toggleProfile = () => setShowProfile((v) => !v);

    const handleAvatarUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setNewAvatarFile(file);
        setNewAvatarPreview(URL.createObjectURL(file));
        setRemoveAvatar(false);
    };

    const handleRemoveAvatar = () => {
        setNewAvatarFile(null);
        setNewAvatarPreview(null);
        setRemoveAvatar(true);
    };

    const handleGlobalWallpaperUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingWallpaper(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const { data: uploadData } = await api.post('/api/v1/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const wallpaperUrl = uploadData.url;
            await api.put('/api/v1/profile/wallpaper', { wallpaper_url: wallpaperUrl });
            setGlobalWallpaper(wallpaperUrl);
            setWallpaperChanged(true);
        } catch (err) {
            console.error('Error subiendo fondo global:', err);
        } finally {
            setUploadingWallpaper(false);
            e.target.value = '';
        }
    };

    const handleRemoveGlobalWallpaper = async () => {
        try {
            await api.put('/api/v1/profile/wallpaper', { wallpaper_url: '' });
            setGlobalWallpaper('');
            setWallpaperChanged(true);
        } catch (err) {
            console.error('Error quitando fondo global:', err);
        }
    };

    const handleContactWallpaperUpload = async (e, contactNumber) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingWallpaper(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const { data: uploadData } = await api.post('/api/v1/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const wallpaperUrl = uploadData.url;
            await api.put('/api/v1/contact/wallpaper', { contact_telephon: contactNumber, wallpaper_url: wallpaperUrl });
            setChatWallpapers(prev => ({ ...prev, [contactNumber]: wallpaperUrl }));
        } catch (err) {
            console.error('Error subiendo fondo de chat:', err);
        } finally {
            setUploadingWallpaper(false);
            e.target.value = '';
        }
    };

    const handleRemoveContactWallpaper = async (contactNumber) => {
        try {
            await api.put('/api/v1/contact/wallpaper', { contact_telephon: contactNumber, wallpaper_url: '' });
            setChatWallpapers(prev => {
                const next = { ...prev };
                delete next[contactNumber];
                return next;
            });
        } catch (err) {
            console.error('Error quitando fondo de chat:', err);
        }
    };

    const openEdit = () => {
        setNewUsername(user?.username || '');
        setNewAvatarFile(null);
        setNewAvatarPreview(null);
        setRemoveAvatar(false);
        setWallpaperChanged(false);
        setShowEdit(true);
        setStatus('');
    };
    const getChatKey = (contact) => {
        if (!contact || !contact.Number) return '';
        // Usar número de teléfono como key única (telephon es el identificador inmutable)
        return contact.Number;
    };
    const currentDraft = selected ? drafts[getChatKey(selected)] || '' : '';
    const handleInputChange = (e) => {
        if (!selected) return;
        const key = getChatKey(selected);
        const value = e.target.value;
        setDrafts((prev) => ({
            ...prev,
            [key]: value,
        }));
        
        // Cerrar sidebar en móvil cuando se empieza a escribir
        if (sidebarOpen) {
            setSidebarOpen(false);
        }

        // Enviar indicador de "escribiendo" solo si hay texto y WebSocket conectado
        if (value.trim() && isConnected && selected.Number) {
            // Limpiar timeout previo
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }

            // Enviar indicador de typing
            console.log('[TYPING] Enviando indicador a:', selected.Number);
            const sent = sendTypingIndicator(selected.Number);
            console.log('[TYPING] Indicador enviado:', sent);

            // Configurar timeout para dejar de enviar (debounce de 2 segundos)
            typingTimeoutRef.current = setTimeout(() => {
                typingTimeoutRef.current = null;
            }, 2000);
        }
    };
    const getUnreadCount = (contact) => {
        if (!contact || !contact.Number) return 0;
        // Si es el contacto actualmente seleccionado, no mostrar contador
        if (selected && selected.Number === contact.Number) return 0;
        
        const key = getChatKey(contact);
        const arr = messagesByChat[key] || [];
        // Contar mensajes donde el remitente (m.SenderTelephon) es el contacto y no están vistos
        return arr.filter((m) => m && m.SenderTelephon === contact.Number && m.Status !== 'visto').length;
    };
    const getStatusIcon = (status) => {
        const base = "w-4 h-4";
        if (status === 'visto') {
            return (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={base}>
                    <path fill="#f59e0b" d="M3.5 12.5l4.5 4.5 6.5-6.5 1.5 1.5-8 8-6-6z"></path>
                    <path fill="#f59e0b" d="M10 13l4.5 4.5 6.5-6.5 1.5 1.5-8 8-6-6z" transform="translate(-4,-4)"></path>
                </svg>
            );
        }
        if (status === 'entregado') {
            return (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={base}>
                    <path fill="#fcd34d" d="M3.5 12.5l4.5 4.5 6.5-6.5 1.5 1.5-8 8-6-6z"></path>
                    <path fill="#fcd34d" d="M10 13l4.5 4.5 6.5-6.5 1.5 1.5-8 8-6-6z" transform="translate(-4,-4)"></path>
                </svg>
            );
        }
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={base}>
                <path fill="#e5e7eb" d="M4 12l4 4 10-10 2 2-12 12-6-6z"></path>
            </svg>
        );
    };
    const handleSend = async () => {
        if (!selected || !selected.Number) {
            console.error('No hay contacto seleccionado o falta el número');
            return;
        }
        const trimmed = currentDraft.trim();
        if (!trimmed) return;
        if (!profile?.Telephon) {
            console.error('Usuario no autenticado o perfil no cargado');
            return;
        }
        const key = getChatKey(selected);
        
        // Usar WebSocket siempre que esté disponible
        if (isConnected) {
            console.log(`[SEND] → Enviando mensaje a: "${selected.Number}" (selected completo:`, selected, ')');
            const sent = sendMessage(selected.Number, trimmed, replyingTo, null); // null para mediaType
            if (sent) {
                // Crear mensaje temporal optimista (aparece inmediatamente en la UI)
                const tempMessage = {
                    MessageID: `temp-${Date.now()}`, // ID temporal
                    SenderTelephon: profile.Telephon,
                    Receptor: selected.Number,
                    Message: trimmed,
                    Status: 'enviado',
                    Time: new Date().toISOString(),
                    // Incluir campos de reply si existe
                    ...(replyingTo && {
                        ReplyToMessageID: replyingTo.MessageID,
                        ReplyToTelephon: replyingTo.SenderTelephon,
                        ReplyToMessage: replyingTo.Message
                    })
                };
                
                console.log('[SEND] Agregando mensaje optimista:', tempMessage);
                
                // Agregar mensaje optimistamente al estado
                setMessagesByChat((prev) => {
                    const existing = prev[key] || [];
                    return {
                        ...prev,
                        [key]: [...existing, tempMessage]
                    };
                });
                
                // Limpiar el draft y la respuesta inmediatamente
                setDrafts((prev) => ({
                    ...prev,
                    [key]: '',
                }));
                setReplyingTo(null);
            } else {
                console.error('No se pudo enviar el mensaje por WebSocket');
            }
        } else {
            // Fallback a HTTP solo si WebSocket no está conectado
            console.warn('WebSocket desconectado, usando fallback HTTP');
            try {
                const payload = {
                    receptor: selected.Number,
                    message: trimmed,
                };
                
                // Agregar campos de reply si existe
                if (replyingTo) {
                    payload.replyToMessageID = replyingTo.MessageID;
                    payload.replyToTelephon = replyingTo.SenderTelephon;
                    payload.replyToMessage = replyingTo.Message;
                }
                
                await api.post('/api/v1/chat', payload);
                const { data } = await api.get(`/api/v1/chat/${selected.Number}`);
                setMessagesByChat((prev) => ({
                    ...prev,
                    [key]: Array.isArray(data) ? data : [],
                }));
                setDrafts((prev) => ({
                    ...prev,
                    [key]: '',
                }));
                setReplyingTo(null);
            } catch (err) {
                console.error('Error enviando mensaje por HTTP:', err);
            }
        }
    };
    
    // Funciones para manejar respuestas a mensajes
    const handleReplyToMessage = (message) => {
        setReplyingTo(message);
        // Enfocar el input después de seleccionar
        setTimeout(() => {
            const input = document.querySelector('input[placeholder="Mensaje..."]');
            if (input) input.focus();
        }, 100);
    };
    
    const cancelReply = () => {
        setReplyingTo(null);
    };

    // --- Funciones de Media y Grabación ---
    const handleMediaUploadSuccess = (url, mediaType) => {
        if (!selected || !selected.Number) return;
        
        // Enviar mensaje con la URL del medio
        if (isConnected) {
            const sent = sendMessage(selected.Number, url, replyingTo, mediaType);
            if (sent) {
                const key = getChatKey(selected);
                const tempMessage = {
                    MessageID: `temp-${Date.now()}`,
                    SenderTelephon: profile.Telephon,
                    Receptor: selected.Number,
                    Message: url,
                    Status: 'enviado',
                    Time: new Date().toISOString(),
                    MediaType: mediaType,
                    MediaUrl: url,
                    ...(replyingTo && {
                        ReplyToMessageID: replyingTo.MessageID,
                        ReplyToTelephon: replyingTo.SenderTelephon,
                        ReplyToMessage: replyingTo.Message
                    })
                };
                
                setMessagesByChat((prev) => ({
                    ...prev,
                    [key]: [...(prev[key] || []), tempMessage]
                }));
                setReplyingTo(null);
            }
        }
        setShowAttachMenu(false);
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const formData = new FormData();
                formData.append('file', audioBlob, 'voice_note.webm');

                try {
                    const response = await api.post('/api/v1/upload', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    if (response.data && response.data.url) {
                        handleMediaUploadSuccess(response.data.url, 'audio');
                    }
                } catch (error) {
                    console.error('Error uploading voice note:', error);
                    alert('Error al enviar nota de voz');
                }
                
                // Detener todas las pistas del stream
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            
            recordingTimerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('No se pudo acceder al micrófono. Verifica los permisos.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(recordingTimerRef.current);
        }
    };

    const cancelRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            // Detener sin procesar el onstop (o ignorar el resultado)
            mediaRecorderRef.current.onstop = () => {
                mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            };
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(recordingTimerRef.current);
            setRecordingTime(0);
        }
    };

    const formatRecordingTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    // --------------------------------------
    
    const submitEdit = async (e) => {
        e.preventDefault();
        const nu = newUsername.trim();
        const nameChanged = nu && nu !== user?.username;
        const photoChanged = !!newAvatarFile;
        const photoRemoved = removeAvatar && myAvatar;

        if (!nameChanged && !photoChanged && !photoRemoved) {
            if (wallpaperChanged) {
                setShowEdit(false);
                setWallpaperChanged(false);
                return;
            }
            setStatus('No ha hecho cambios');
            return;
        }

        if (nameChanged && nu.length < 5) {
            setStatus('El usuario tiene que tener mas de 5 caracteres');
            return;
        }

        try {
            setStatus('Guardando cambios...');
            setUploadingAvatar(true);

            // 1. Subir foto si cambió o eliminarla
            if (photoChanged) {
                const formData = new FormData();
                formData.append('file', newAvatarFile);
                const { data: uploadData } = await api.post('/api/v1/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                const avatarUrl = uploadData.url;
                await api.put('/api/v1/profile/avatar', { avatar_url: avatarUrl });
                setMyAvatar(avatarUrl);
                setProfile(prev => prev ? { ...prev, avatar_url: avatarUrl } : prev);
            } else if (photoRemoved) {
                await api.put('/api/v1/profile/avatar', { avatar_url: "" });
                setMyAvatar("");
                setProfile(prev => prev ? { ...prev, avatar_url: "" } : prev);
            }

            // 2. Actualizar nombre si cambió
            if (nameChanged) {
                const response = await api.put('/api/v1/user', { username: nu });
                
                if (response.data?.token) {
                    localStorage.setItem('token', response.data.token);
                    console.log('[AUTH] Nuevo token guardado después de cambiar username');
                }
                
                const oldUsername = user.username;
                updateUsername(nu);
                
                setMessagesByChat(prev => {
                    const updated = {};
                    for (const [key, messages] of Object.entries(prev)) {
                        updated[key] = messages.map(m => {
                            if (m.SenderTelephon === oldUsername) {
                                return { ...m, SenderTelephon: nu };
                            }
                            return m;
                        });
                    }
                    return updated;
                });
            }

            const { data } = await api.get('/api/v1/user');
            setProfile(data);
            if (data?.avatar_url) setMyAvatar(data.avatar_url);
            
            setShowEdit(false);
            setStatus('');
            setNewAvatarFile(null);
            setNewAvatarPreview(null);
        } catch (err) {
            const d = err?.response?.data;
            const msg = typeof d === 'string' ? d : d?.message || d?.error || err?.message || 'Error al actualizar';
            setStatus(msg);
        } finally {
            setUploadingAvatar(false);
        }
    };
    const submitEditContact = async (contactNumber) => {
        const newName = editContactName.trim();
        setEditContactError('');
        if (!newName) {
            setEditContactError('El nombre no puede estar vacío');
            return;
        }
        // Si el nombre es el mismo, no hacer nada
        const current = contacts.find(c => c.Number === contactNumber);
        if (current && (current.ContactName || '') === newName) {
            setEditingContact(null);
            setEditContactName('');
            setEditContactError('');
            return;
        }
        setEditContactLoading(true);
        try {
            await api.put('/api/v1/contact', { number: contactNumber, contact_name: newName });
            // Actualizar el contacto localmente
            setContacts((prev) => prev.map(c => 
                c.Number === contactNumber ? { ...c, ContactName: newName } : c
            ));
            contactsRef.current = contactsRef.current.map(c => 
                c.Number === contactNumber ? { ...c, ContactName: newName } : c
            );
            // Si el contacto seleccionado es el editado, actualizar también
            if (selected?.Number === contactNumber) {
                setSelected(prev => ({ ...prev, ContactName: newName }));
            }
            setEditingContact(null);
            setEditContactName('');
            setEditContactError('');
        } catch (err) {
            const d = err?.response?.data;
            const msg = typeof d === 'string' ? d : d?.error || 'Error al editar contacto';
            console.error('Error editando contacto:', msg);
            setEditContactError(msg);
        } finally {
            setEditContactLoading(false);
        }
    };

    const submitAddContact = async (e) => {
        e.preventDefault();
        setAddMsg('');
        const n = numberInput.trim();
        const cn = contactNameInput.trim();
        if (!n.match(/^\+[1-9]\d{6,14}$/)) {
            setAddMsg('El número debe estar en formato internacional (ej: +50212345678)');
            return;
        }
        if (!cn) {
            setAddMsg('Debes ingresar un nombre para el contacto');
            return;
        }
        try {
            const { data } = await api.post('/api/v1/contact', { number: n, contact_name: cn });
            const created = data?.contact || data?.['contacto creado'];
            if (created) {
                setContacts((prev) => [created, ...prev]);
                try {
                    const { data: refreshed } = await api.get('/api/v1/contact');
                    const list = Array.isArray(refreshed) ? refreshed : [];
                    setContacts(list);
                    contactsRef.current = list;
                } catch {}
                // Marcar el grupo como contacto agregado para que desaparezca el banner
                const addedNumber = n;
                setAllChatGroups(prev => {
                    if (!prev[addedNumber]) return prev;
                    return {
                        ...prev,
                        [addedNumber]: {
                            ...prev[addedNumber],
                            IsContact: true,
                            ContactName: cn
                        }
                    };
                });
                setNumberInput('');
                setContactNameInput('');
                setAddMsg('Contacto creado exitosamente');
                
                // Abrir chat automáticamente con el nuevo contacto
                setTimeout(() => {
                    setSelected(created);
                    setShowAddContactForm(false);
                    setSidebarView('contacts');
                    setSidebarOpen(false);
                }, 1000);
            } else {
                setAddMsg('Contacto creado');
                setTimeout(() => {
                    setShowAddContactForm(false);
                }, 1500);
            }
        } catch (err) {
            const d = err?.response?.data;
            const msg = typeof d === 'string' ? d : d?.message || d?.error || 'Error al agregar';
            if (typeof msg === 'string' && msg.toLowerCase().includes('contacto ya existente')) {
                try {
                    const { data: refreshed } = await api.get('/api/v1/contact');
                    setContacts(Array.isArray(refreshed) ? refreshed : []);
                } catch {}
                setAddMsg('Contacto ya existe');
            } else {
                setAddMsg(msg);
            }
        }
    };

    // Marcar mensajes como entregados una sola vez al inicio
    useEffect(() => {
        const putDelivered = async () => {
            try {
                await api.put('/api/v1/chat');
            } catch {}
        };
        putDelivered();
        // Ya no hacemos polling, WebSocket maneja las actualizaciones en tiempo real
    }, []);

    useEffect(() => {
        if (!selected) return;
        const key = getChatKey(selected);
        let active = true;
        
        // Cargar historial de mensajes solo una vez al seleccionar contacto
        const fetchMessages = async () => {
            try {
                // Solo cargar historial si no lo tenemos ya
                if (!messagesByChat[key] || messagesByChat[key].length === 0) {
                    const { data } = await api.get(`/api/v1/chat/${selected.Number}`);
                    if (!active) return;
                    setMessagesByChat((prev) => ({
                        ...prev,
                        [key]: Array.isArray(data) ? data : [],
                    }));
                }
            } catch {}
        };
        
        fetchMessages();
        
        // Marcar como visto SOLO cuando el usuario entra al chat
        // Usar setTimeout para dar tiempo a que se carguen los mensajes primero
        const markTimer = setTimeout(() => {
            if (!active) return;
            
            // Marcar todos los mensajes del contacto como vistos localmente (limpia el contador)
            setMessagesByChat((prev) => {
                const existing = prev[key] || [];
                const updated = existing.map(m => {
                    if (!m) return m; // Skip null/undefined messages
                    // m.SenderTelephon ahora es el número del remitente, comparar con selected.Number
                    return m.SenderTelephon === selected.Number && m.Status !== 'visto'
                        ? { ...m, Status: 'visto' }
                        : m;
                });
                return {
                    ...prev,
                    [key]: updated
                };
            });
            
            // Notificar al servidor por WebSocket o HTTP
            if (isConnected) {
                sendReadConfirmation(selected.Number);
            } else {
                // Fallback HTTP solo si WebSocket está desconectado
                api.put(`/api/v1/chat/${selected.Number}`).catch(() => {});
            }
        }, 300); // Pequeño delay para asegurar que los mensajes se cargaron
        
        // Los mensajes nuevos llegarán por WebSocket, no necesitamos polling
        
        return () => {
            active = false;
            clearTimeout(markTimer);
        };
    }, [selected, isConnected, sendReadConfirmation]);

    // Cargar TODOS los chats (incluye contactos no agregados) desde el nuevo endpoint.
    // Se dispara cuando llega el perfil (telephon listo) o cuando cambia la lista de contactos.
    useEffect(() => {
        if (!profile?.Telephon) return; // esperar a que el perfil esté cargado
        let active = true;
        const fetchAllChats = async () => {
            try {
                const { data } = await api.get('/api/v1/chats');
                if (!active || !Array.isArray(data)) return;
                setMessagesByChat((prev) => {
                    const next = { ...prev };
                    data.forEach((group) => {
                        const key = group.ContactTelephon;
                        // Solo rellenar si aún no tenemos mensajes de ese chat
                        if (!next[key] || next[key].length === 0) {
                            next[key] = Array.isArray(group.Messages) ? group.Messages : [];
                        }
                    });
                    return next;
                });
                // Guardar metadatos de todos los grupos; respetar IsContact calculado por el backend
                setAllChatGroups(prev => {
                    const next = { ...prev };
                    data.forEach((g) => {
                        // Si ya tenemos entrada local más reciente (ej. mensaje WS reciente), no pisar IsContact:true
                        const existing = next[g.ContactTelephon];
                        if (!existing || !existing.IsContact) {
                            next[g.ContactTelephon] = g;
                        }
                    });
                    return next;
                });
            } catch {}
        };
        fetchAllChats();
        return () => { active = false; };
    }, [profile?.Telephon, contacts.length]); // re-ejecutar cuando el perfil carga o cambian contacts

    // Scroll automático al final cuando cambian los mensajes
    useEffect(() => {
        if (messagesContainerRef.current && selected) {
            const container = messagesContainerRef.current;
            // Usar requestAnimationFrame para asegurar que el DOM se haya actualizado completamente
            requestAnimationFrame(() => {
                container.scrollTop = container.scrollHeight;
            });
        }
    }, [messagesByChat, selected]);

    return (
        <div className="flex h-screen bg-gradient-to-br from-purple-950 via-indigo-950 to-gray-950 text-white overflow-hidden relative" style={{height: '100dvh'}}>

            {/* Pantalla de carga estilo WhatsApp Web */}
            {isInitialLoading && (
                <div className="absolute inset-0 z-[99999] flex flex-col items-center justify-center bg-gradient-to-br from-purple-950 via-indigo-950 to-gray-950">
                    <div className="flex flex-col items-center gap-6 animate-fade-in">
                        {/* Logo / Icono */}
                        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-2xl shadow-purple-500/30">
                            <img src="/todos.svg" alt="todos" className="w-14 h-14" />
                        </div>

                        {/* Nombre app */}
                        <h1 className="text-3xl font-bold text-white tracking-wide">todos</h1>

                        {/* Barra de progreso animada */}
                        <div className="w-56 h-1 bg-white/10 rounded-full overflow-hidden mt-2">
                            <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 rounded-full animate-loading-bar"></div>
                        </div>

                        {/* Texto de estado */}
                        <p className="text-white/50 text-sm mt-1">
                            {loadingProfile ? 'Cargando perfil...' : loadingContacts ? 'Cargando contactos...' : 'Conectando...'}
                        </p>

                        {/* Encriptación */}
                        <div className="flex items-center gap-2 mt-4 text-white/30 text-xs">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <span>Tus mensajes están protegidos</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Overlay backdrop para móvil */}
            {sidebarOpen && (
                <div 
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                ></div>
            )}
            
            {/* Sidebar */}
            <div className={`
                w-72 bg-white/10 backdrop-blur-xl border-r border-white/10 flex flex-col
                fixed lg:static inset-y-0 left-0 z-50
                transform transition-transform duration-300 ease-in-out
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                <div className="p-5 border-b border-white/10 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <img src="/todos.svg" alt="todos" className="w-7 h-7" />
                        <h1 className="text-xl font-bold">todos</h1>
                    </div>
                    <div 
                        className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-500'}`}
                        title={isConnected ? "Conectado" : "Desconectado"}
                    ></div>
                </div>
                
                <div className="p-4 border-b border-white/10">
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                setSidebarView('chats');
                                setShowAddContactForm(false);
                            }}
                            className={`flex-1 py-2 rounded text-sm transition ${
                                sidebarView === 'chats' 
                                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white' 
                                    : 'bg-white/10 hover:bg-white/20 text-indigo-200'
                            }`}
                        >
                            Chats
                        </button>
                        <button
                            onClick={() => {
                                setSidebarView('calls');
                                setShowAddContactForm(false);
                            }}
                            className={`flex-1 py-2 rounded text-sm transition ${
                                sidebarView === 'calls' 
                                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white' 
                                    : 'bg-white/10 hover:bg-white/20 text-indigo-200'
                            }`}
                        >
                            Llamadas
                        </button>
                        <button
                            onClick={() => {
                                setSidebarView('contacts');
                                setShowAddContactForm(false);
                            }}
                            className={`flex-1 py-2 rounded text-sm transition ${
                                sidebarView === 'contacts' 
                                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white' 
                                    : 'bg-white/10 hover:bg-white/20 text-indigo-200'
                            }`}
                        >
                            Contactos
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {/* Vista de Chats Activos */}
                    {sidebarView === 'chats' && (
                        <>
                            <div className="text-indigo-200 text-sm mb-2 uppercase">Chats Activos</div>
                            <div className="space-y-2">
                                {Object.keys(messagesByChat).length > 0 ? (
                                    // Filtrar para mostrar solo un chat por contacto real o número único
                                    (() => {
                                        // Crear un Set para evitar duplicados
                                        const shownNumbers = new Set();
                                        // Priorizar contactos aceptados
                                        const acceptedContacts = contacts.filter(c => c.Status === 'accepted').map(c => c.Number);
                                        // Unir contactos aceptados y números de mensajes
                                        const allNumbers = Array.from(new Set([
                                            ...acceptedContacts,
                                            ...Object.keys(messagesByChat)
                                        ]));
                                        return allNumbers.map((contactNumber) => {
                                            if (shownNumbers.has(contactNumber)) return null;
                                            shownNumbers.add(contactNumber);
                                            const messages = messagesByChat[contactNumber] || [];
                                            if (messages.length === 0) return null;
                                            const lastMessage = messages[messages.length - 1];
                                            // contactNumber es el telephon, buscar contacto por Number
                                            const contact = contacts.find(c => c.Number === contactNumber);
                                            const group = allChatGroups[contactNumber];
                                            // Nombre a mostrar: nombre personalizado > username del grupo > número
                                            const displayName = contact?.ContactName || group?.ContactName || group?.ContactUsername || contactNumber;
                                            const isUnknown = group && !group.IsContact;
                                            return (
                                                <button
                                                    key={contactNumber}
                                                    onClick={() => {
                                                        const contactToSelect = contact || {
                                                            Number: contactNumber,
                                                            Username: group?.ContactUsername || contactNumber,
                                                            ContactName: group?.ContactName || null,
                                                            Status: 'unknown'
                                                        };
                                                        setSelected(contactToSelect);
                                                        setSidebarOpen(false);
                                                    }}
                                                    className={`relative w-full text-left p-3 bg-white/5 hover:bg-white/10 rounded mb-2 flex items-center gap-3 ${selected?.Number === contactNumber ? 'ring-1 ring-indigo-400' : ''}`}
                                                >
                                                    <div className="relative w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-sm overflow-hidden flex-shrink-0">
                                                        {avatarMap[contactNumber] ? (
                                                            <img src={avatarMap[contactNumber]} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            displayName?.charAt(0)?.toUpperCase()
                                                        )}
                                                        {isContactOnline(contactNumber) && (
                                                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white/10"></div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 overflow-hidden">
                                                        <div className="font-medium flex items-center gap-1">
                                                            {displayName}
                                                            {isUnknown && <span className="text-[9px] bg-yellow-500/20 text-yellow-300 px-1 rounded">?</span>}
                                                        </div>
                                                        <div className="text-xs text-indigo-200 truncate">
                                                            {lastMessage?.Message || 'Sin mensajes'}
                                                        </div>
                                                    </div>
                                                    {getUnreadCount(contact || {Number: contactNumber}) > 0 && (
                                                        <span className="absolute top-2 right-2 bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                                            {getUnreadCount(contact || {Number: contactNumber})}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        });
                                    })()
                                ) : (
                                    <div className="text-center text-indigo-200 py-8">
                                        No tienes conversaciones activas
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* Vista de Llamadas */}
                    {sidebarView === 'calls' && (
                        <CallHistory
                            contacts={contacts}
                            onSelectContact={(contact) => {
                                setSelected(contact);
                                setSidebarOpen(false);
                            }}
                            onStartCall={(telephon, name, callType) => {
                                // Seleccionar el contacto y lanzar llamada
                                const contact = contacts.find(c => c.Number === telephon);
                                const sel = contact || { Number: telephon, Username: name, ContactName: null, Status: 'unknown' };
                                setSelected(sel);
                                setSidebarOpen(false);
                                // Pequeño delay para que el state se actualice
                                setTimeout(() => handleStartCall(callType || 'video'), 100);
                            }}
                        />
                    )}

                    {/* Vista de Contactos */}
                    {sidebarView === 'contacts' && !showAddContactForm && (
                        <>
                            <div className="flex justify-between items-center mb-2">
                                <div className="text-indigo-200 text-sm uppercase">Mis Contactos</div>
                                <button
                                    onClick={() => {
                                        setShowAddContactForm(true);
                                        setAddMsg('');
                                        setNumberInput('');
                                        setContactNameInput('');
                                    }}
                                    className="text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-3 py-1 rounded"
                                >
                                    + Agregar
                                </button>
                            </div>
                            <div>
                        {contacts.filter(c => c.Status === 'accepted').length > 0 ? (
                            contacts.filter(c => c.Status === 'accepted').map((c, idx) => (
                                <div key={idx} className="mb-2">
                                    {editingContact === c.Number ? (
                                        /* Modo edición inline */
                                        <div className="p-3 bg-white/10 rounded space-y-2">
                                            <div className="text-xs text-indigo-200">Editar nombre de {c.Username} ({c.Number})</div>
                                            {editContactError && <div className="text-xs text-red-400">{editContactError}</div>}
                                            <input
                                                type="text"
                                                value={editContactName}
                                                onChange={(e) => { setEditContactName(e.target.value); setEditContactError(''); }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') { e.preventDefault(); submitEditContact(c.Number); }
                                                    if (e.key === 'Escape') { setEditingContact(null); setEditContactName(''); setEditContactError(''); }
                                                }}
                                                autoFocus
                                                disabled={editContactLoading}
                                                className="w-full p-2 rounded bg-white/5 border border-white/10 focus:outline-none focus:border-indigo-400 text-white placeholder-indigo-300 text-sm disabled:opacity-50"
                                                placeholder="Nuevo nombre"
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => { setEditingContact(null); setEditContactName(''); setEditContactError(''); }}
                                                    disabled={editContactLoading}
                                                    className="flex-1 bg-white/10 hover:bg-white/20 text-indigo-200 py-1.5 rounded text-xs disabled:opacity-50"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    onClick={() => submitEditContact(c.Number)}
                                                    disabled={editContactLoading}
                                                    className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white py-1.5 rounded text-xs disabled:opacity-50"
                                                >
                                                    {editContactLoading ? 'Guardando...' : 'Guardar'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Modo normal */
                                        <button
                                            onClick={() => {
                                                setSelected(c);
                                                setSidebarOpen(false);
                                            }}
                                            className={`relative w-full text-left p-3 bg-white/5 hover:bg-white/10 rounded flex items-center gap-3 ${selected?.Number === c.Number ? 'ring-1 ring-indigo-400' : ''}`}
                                        >
                                            <div className="relative w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-sm overflow-hidden flex-shrink-0">
                                                {avatarMap[c.Number] ? (
                                                    <img src={avatarMap[c.Number]} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    (c.ContactName || c.Username)?.charAt(0)?.toUpperCase()
                                                )}
                                                {isContactOnline(c.Number) && (
                                                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white/10"></div>
                                                )}
                                            </div>
                                            <div className="flex-1 overflow-hidden">
                                                <div className="font-medium truncate">{c.ContactName || c.Username}</div>
                                                <div className="text-xs text-indigo-200">
                                                    {isContactOnline(c.Number) ? 'En línea' : (getLastSeenText(c.Number) || c.Number)}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {getUnreadCount(c) > 0 && (
                                                    <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                                        {getUnreadCount(c)}
                                                    </span>
                                                )}
                                                <span
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingContact(c.Number);
                                                        setEditContactName(c.ContactName || '');
                                                        setEditContactError('');
                                                    }}
                                                    className="p-1 rounded hover:bg-white/20 text-indigo-300 hover:text-white transition"
                                                    title="Editar nombre"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                    </svg>
                                                </span>
                                            </div>
                                        </button>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="text-center text-indigo-200 py-8">
                                No tienes contactos aún
                            </div>
                        )}
                    </div>
                        </>
                    )}

                    {/* Formulario Agregar Contacto */}
                    {sidebarView === 'contacts' && showAddContactForm && (
                        <>
                            <div className="text-indigo-200 text-sm mb-3 uppercase">Añadir Contacto</div>
                            <form onSubmit={submitAddContact} className="space-y-3">
                                <input
                                    type="text"
                                    value={contactNameInput}
                                    onChange={(e) => setContactNameInput(e.target.value)}
                                    className="w-full p-3 rounded bg-white/5 border border-white/10 focus:outline-none text-white placeholder-indigo-300"
                                    placeholder="Nombre del contacto"
                                />
                                <input
                                    type="text"
                                    value={numberInput}
                                    onChange={(e) => setNumberInput(e.target.value)}
                                    className="w-full p-3 rounded bg-white/5 border border-white/10 focus:outline-none text-white placeholder-indigo-300"
                                    placeholder="Ej: +50212345678"
                                />
                                {addMsg && <div className="text-xs text-indigo-200">{addMsg}</div>}
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowAddContactForm(false)}
                                        className="flex-1 bg-white/10 hover:bg-white/20 text-indigo-200 py-2 rounded"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white py-2 rounded"
                                    >
                                        Añadir
                                    </button>
                                </div>
                            </form>
                        </>
                    )}
                </div>

                <div className="p-4 bg-white/10 border-t border-white/10">
                    <div className="flex items-center gap-3 mb-4">
                        <div 
                            className="relative w-10 h-10 rounded-full cursor-pointer group flex-shrink-0" 
                            title="Ver foto de perfil"
                            onClick={() => myAvatar && setViewImage(myAvatar)}
                        >
                            {myAvatar ? (
                                <img src={myAvatar} alt="avatar" className="w-10 h-10 rounded-full object-cover" />
                            ) : (
                                <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-full flex items-center justify-center font-bold">
                                    {user?.username?.charAt(0).toUpperCase()}
                                </div>
                            )}
                            {myAvatar && (
                                <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                    </svg>
                                </div>
                            )}
                        </div>
                        <div className="overflow-hidden">
                            <div className="font-bold truncate">{user?.username}</div>
                            <div className="text-xs flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></span>
                                <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
                                    {isConnected ? 'En línea' : 'Desconectado'}
                                </span>
                            </div>
                            {error && <div className="text-xs text-red-400">{error}</div>}
                            {showProfile && profile && (
                                <div className="mt-2 text-xs text-indigo-100">
                                    <div className="truncate">Email: {profile.Gmail}</div>
                                    <div className="truncate">Número: {profile.Telephon}</div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2 mb-3">
                        <button
                            onClick={toggleProfile}
                            className="flex-1 bg-white/10 hover:bg-white/20 text-indigo-200 py-2 rounded text-sm transition"
                        >
                            {showProfile ? 'Ocultar Perfil' : 'Ver Perfil'}
                        </button>
                        <button
                            onClick={openEdit}
                            className="flex-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-white py-2 rounded text-sm transition"
                        >
                            Editar Perfil
                        </button>
                    </div>
                    <button 
                        onClick={logout}
                        className="w-full bg-red-600/20 text-red-300 hover:bg-red-600/40 py-2 rounded text-sm transition"
                    >
                        Cerrar Sesión
                    </button>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col min-h-0">
                {!selected ? (
                    <div className="flex flex-col h-full relative">
                        {/* Botón hamburguesa para móvil - flotante cuando no hay chat seleccionado */}
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="lg:hidden absolute top-4 left-4 p-3 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg shadow-lg z-20 hover:shadow-xl transition-all"
                            aria-label="Toggle sidebar"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                        
                        <div className="flex-1 flex flex-col items-center justify-center text-indigo-200 p-8 text-center overflow-y-auto bg-[#0B0F19]"
                            style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%234f46e5' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
                            }}
                        >
                            <div className="w-32 h-32 bg-gradient-to-br from-indigo-500/20 to-purple-600/20 rounded-full flex items-center justify-center mb-8 shadow-lg shadow-indigo-500/10 border border-white/5 backdrop-blur-sm">
                                <img src="/todos.svg" alt="todos" className="w-20 h-20 opacity-80" />
                            </div>
                            <h2 className="text-4xl font-bold mb-3 text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-purple-300">Bienvenido a todos</h2>
                            <p className="max-w-md text-indigo-200/70 text-lg">
                                Selecciona un contacto para comenzar a chatear.
                            </p>
                            <div className="mt-6 flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/5 backdrop-blur-sm">
                                <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.6)]' : 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]'}`}></span>
                                <span className={`text-sm font-medium ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                                    {isConnected ? 'Conectado al servidor' : 'Desconectado'}
                                </span>
                            </div>
                        </div>
                        <div className="flex-shrink-0 p-4 bg-gray-900/80 border-t border-white/10 backdrop-blur-md">
                            <div className="flex gap-3">
                                <input 
                                    type="text" 
                                    value={currentDraft}
                                    onChange={handleInputChange}
                                    placeholder="Selecciona un contacto para escribir"
                                    className="flex-1 p-3.5 rounded-xl bg-white/5 border border-white/10 focus:outline-none text-white placeholder-indigo-300/50 cursor-not-allowed opacity-50"
                                    disabled={true}
                                />
                                <button
                                    className="bg-gradient-to-r from-purple-600 to-indigo-600 px-8 rounded-xl text-white font-medium opacity-50 cursor-not-allowed"
                                    disabled={true}
                                >
                                    Enviar
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                        {/* Header fijo */}
                        <div className="flex-shrink-0 p-3 border-b border-white/10 bg-gray-900/80 backdrop-blur-md flex flex-col gap-2 z-10 shadow-sm">
                            <div className="flex items-center gap-3">
                            {/* Botón hamburguesa para móvil */}
                            <button
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                                className="lg:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
                                aria-label="Toggle sidebar"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                            <div 
                                className="flex items-center gap-3 cursor-pointer hover:bg-white/5 p-2 rounded-xl transition-colors flex-1 min-w-0"
                                onClick={() => setShowContactDetails(true)}
                            >
                                <div className="relative w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center shadow-md overflow-hidden flex-shrink-0">
                                    {avatarMap[selected.Number] ? (
                                        <img src={avatarMap[selected.Number]} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-lg font-bold text-white">
                                            {(selected.ContactName || selected.Username)?.charAt(0)?.toUpperCase()}
                                        </span>
                                    )}
                                    {isContactOnline(selected.Number) && (
                                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-gray-900 shadow-sm"></div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-[16px] truncate text-white">{selected.ContactName || selected.Username}</div>
                                    <div className="text-[13px] text-indigo-200/80 truncate">
                                        {isContactTyping(selected.Number) ? (
                                            <span className="text-indigo-400 italic font-medium animate-pulse">escribiendo...</span>
                                        ) : isContactOnline(selected.Number) ? (
                                            <span className="text-green-400 font-medium">en línea</span>
                                        ) : (
                                            <span className="text-indigo-300/60">{getLastSeenText(selected.Number) || selected.Number}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {/* Botones de llamada */}
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => handleStartCall('audio')}
                                    className="p-2.5 hover:bg-white/10 rounded-full transition-all text-indigo-300 hover:text-indigo-100 hover:scale-105 active:scale-95"
                                    title="Llamada de voz"
                                    disabled={!isConnected}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => handleStartCall('video')}
                                    className="p-2.5 hover:bg-white/10 rounded-full transition-all text-indigo-300 hover:text-indigo-100 hover:scale-105 active:scale-95"
                                    title="Videollamada"
                                    disabled={!isConnected}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </button>
                                <div className="w-px h-6 bg-white/10 mx-1"></div>
                                <button
                                    onClick={async () => {
                                    if (!window.confirm(`¿Seguro que quieres vaciar el chat con ${selected.ContactName || selected.Username}?`)) return;
                                    try {
                                        await api.delete(`/api/v1/chat/${selected.Number}`);
                                        setMessagesByChat(prev => ({
                                            ...prev,
                                            [getChatKey(selected)]: []
                                        }));
                                    } catch (err) {
                                        console.error('Error al vaciar chat:', err);
                                        alert('Error al vaciar el chat');
                                    }
                                }}
                                className="p-2.5 hover:bg-red-500/20 rounded-full transition-all text-red-400 hover:text-red-300 hover:scale-105 active:scale-95"
                                title="Vaciar Chat"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                            </div>
                            </div>
                            {/* Banner de contacto no agregado */}
                            {(() => {
                                const group = allChatGroups[selected.Number];
                                const isUnknown = group && !group.IsContact;
                                if (!isUnknown) return null;
                                return (
                                    <div className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 text-xs">
                                        <span className="text-yellow-200">⚠️ Este número no está en tus contactos</span>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    setNumberInput(selected.Number);
                                                    setSidebarView('contacts');
                                                    setShowAddContactForm(true);
                                                    setSidebarOpen(true);
                                                }}
                                                className="px-2 py-1 bg-green-600/40 hover:bg-green-600/60 text-green-200 rounded"
                                            >
                                                + Agregar
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (!window.confirm(`¿Bloquear a ${selected.Number}?`)) return;
                                                    // TODO: llamar endpoint de bloqueo cuando exista
                                                    alert('Funcionalidad de bloqueo próximamente');
                                                }}
                                                className="px-2 py-1 bg-red-600/40 hover:bg-red-600/60 text-red-200 rounded"
                                            >
                                                Bloquear
                                            </button>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                        {/* Área de mensajes - altura flexible */}
                        {(() => {
                            const chatWp = selected ? chatWallpapers[selected.Number] : null;
                            const activeWp = chatWp || globalWallpaper;
                            return (
                        <div 
                            ref={messagesContainerRef}
                            className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col text-indigo-200 p-4 space-y-3 relative bg-[#0B0F19]"
                            style={activeWp ? {
                                backgroundImage: `url("${activeWp}")`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                            } : {
                                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%234f46e5' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
                            }}
                        >
                            {(messagesByChat[getChatKey(selected)] || []).length === 0 ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <div className="text-center">
                                        <div className="text-sm">Sin mensajes</div>
                                    </div>
                                </div>
                            ) : (
                                (messagesByChat[getChatKey(selected)] || []).map((m, idx, arr) => {
                                    // Validar que el mensaje tenga los campos requeridos
                                    if (!m || !m.Message) {
                                        console.warn('Mensaje inválido detectado:', m);
                                        return null;
                                    }

                                    // Separador de fecha tipo WhatsApp
                                    let dateSeparator = null;
                                    if (m.Time) {
                                        const msgDate = new Date(m.Time);
                                        const prevMsg = idx > 0 ? arr[idx - 1] : null;
                                        const prevDate = prevMsg?.Time ? new Date(prevMsg.Time) : null;
                                        const showSeparator = !prevDate || msgDate.toDateString() !== prevDate.toDateString();
                                        if (showSeparator) {
                                            const now = new Date();
                                            const yesterday = new Date(now);
                                            yesterday.setDate(yesterday.getDate() - 1);
                                            let label;
                                            if (msgDate.toDateString() === now.toDateString()) {
                                                label = 'Hoy';
                                            } else if (msgDate.toDateString() === yesterday.toDateString()) {
                                                label = 'Ayer';
                                            } else {
                                                label = msgDate.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
                                            }
                                            dateSeparator = (
                                                <div className="flex items-center justify-center my-2">
                                                    <span className="bg-white/10 text-indigo-300 text-[11px] px-3 py-1 rounded-full">
                                                        {label}
                                                    </span>
                                                </div>
                                            );
                                        }
                                    }

                                    // m.SenderTelephon ahora contiene el número de teléfono del remitente
                                    const isMine = m.SenderTelephon === profile?.Telephon;
                                    const text = m.Message || '';
                                    const statusMsg = isMine ? (m.Status || 'enviado') : '';
                                    const timeStr = m.Time ? new Date(m.Time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                                    const hasReply = m.ReplyToMessageID && m.ReplyToMessage;

                                    const isEditing = editingMessageId === m.MessageID;
                                    const isMenuOpen = messageMenuOpen === m.MessageID;

                                    // Renderizador de Media
                                    const renderMedia = () => {
                                        // Si no hay MediaType pero el mensaje es una URL de MinIO, intentar inferirlo
                                        let mediaType = m.MediaType;
                                        let mediaUrl = m.MediaUrl;

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
                                                    <div className="mb-2 rounded-lg overflow-hidden max-w-sm">
                                                        <img src={mediaUrl} alt="Imagen adjunta" className="w-full h-auto object-cover max-h-64 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(mediaUrl, '_blank')} />
                                                    </div>
                                                );
                                            case 'video':
                                                return (
                                                    <div className="mb-2 rounded-lg overflow-hidden max-w-sm">
                                                        <video src={mediaUrl} controls className="w-full max-h-64 bg-black/20" />
                                                    </div>
                                                );
                                            case 'audio':
                                                return (
                                                    <div className="mb-1">
                                                        <AudioPlayer src={mediaUrl} isMine={isMine} />
                                                    </div>
                                                );
                                            case 'document':
                                                return (
                                                    <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="mb-2 flex items-center gap-3 p-3 bg-black/20 hover:bg-black/30 rounded-lg transition-colors">
                                                        <div className="w-10 h-10 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center flex-shrink-0">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                            </svg>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-medium text-white truncate">Documento adjunto</div>
                                                            <div className="text-xs text-indigo-200/70">Haz clic para abrir</div>
                                                        </div>
                                                    </a>
                                                );
                                            default:
                                                return null;
                                        }
                                    };

                                    return (
                                        <React.Fragment key={m.MessageID || `msg-${idx}`}>
                                            {dateSeparator}
                                            <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${isMenuOpen ? 'z-50 relative' : ''}`}>
                                                <div
                                                    className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-[15px] shadow-sm transition-all hover:shadow-md relative group ${
                                                        isMine
                                                            ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-br-sm shadow-indigo-900/40'
                                                            : (chatWallpapers[selected?.Number] || globalWallpaper)
                                                                ? 'bg-gray-900/80 backdrop-blur-sm border border-white/10 text-white rounded-bl-sm shadow-black/30'
                                                                : 'bg-white/10 backdrop-blur-md border border-white/5 text-indigo-50 rounded-bl-sm'
                                                    } ${m.isDeleting ? 'opacity-0 duration-400' : 'opacity-100'} animate-fade`}
                                                    style={{ transition: 'all 0.3s ease' }}
                                                >
                                                    {/* Mostrar cita si es una respuesta */}
                                                    {hasReply && (
                                                        <div className={`mb-2 pl-3 py-1 border-l-4 ${isMine ? 'border-white/40 bg-white/10' : (chatWallpapers[selected?.Number] || globalWallpaper) ? 'border-indigo-400 bg-indigo-950/60' : 'border-indigo-400 bg-indigo-900/20'} rounded-r-md text-xs opacity-90 italic cursor-pointer hover:opacity-100 transition-opacity`}>
                                                            <div className="font-bold text-[11px] mb-0.5">{m.ReplyToUsername}</div>
                                                            <div className="truncate">{m.ReplyToMessage}</div>
                                                        </div>
                                                    )}
                                                    {renderMedia()}
                                                    {isEditing ? (
                                                        <div className="flex flex-col gap-1">
                                                            <input
                                                                className="w-full p-1 rounded bg-white/20 text-black text-xs"
                                                                value={editingMessageText}
                                                                onChange={handleEditMessageChange}
                                                                autoFocus
                                                                maxLength={500}
                                                            />
                                                            <div className="flex gap-2 mt-1 justify-end">
                                                                <button
                                                                    className="px-2 py-0.5 bg-green-600/80 hover:bg-green-700 text-white rounded text-xs"
                                                                    onClick={() => handleEditMessageSave(m)}
                                                                >Guardar</button>
                                                                <button
                                                                    className="px-2 py-0.5 bg-gray-500/80 hover:bg-gray-700 text-white rounded text-xs"
                                                                    onClick={handleEditMessageCancel}
                                                                >Cancelar</button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {text && text !== m.MediaUrl && !text.includes('/media/') && <div onClick={() => handleReplyToMessage(m)} title="Doble click para responder" onDoubleClick={() => handleReplyToMessage(m)} className="cursor-text leading-relaxed break-words">{text}</div>}
                                                            <div className="text-[10px] opacity-70 mt-1.5 flex items-center justify-end gap-1.5 font-medium">
                                                                {m.Edited && (
                                                                    <span className="italic opacity-60 mr-1">editado</span>
                                                                )}
                                                                <span>{timeStr}</span>
                                                                {isMine && <span className="ml-0.5">{getStatusIcon(statusMsg)}</span>}
                                                            </div>
                                                            {/* Menú de opciones del mensaje */}
                                                            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                                <button
                                                                    className="text-xs text-white/80 hover:text-white bg-black/20 hover:bg-black/40 backdrop-blur-sm w-6 h-6 flex items-center justify-center rounded-full transition-all"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setMessageMenuOpen(messageMenuOpen === m.MessageID ? null : m.MessageID);
                                                                    }}
                                                                    title="Opciones"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                                                    </svg>
                                                                </button>
                                                                {isMenuOpen && (
                                                                    <div className={`absolute ${isMine ? 'right-0' : 'left-0'} mt-1 w-40 bg-gray-900/95 backdrop-blur-xl text-white rounded-xl shadow-2xl z-[9999] text-sm border border-white/10 overflow-hidden transform origin-top-right transition-all`}>
                                                                        {isMine && (
                                                                            <>
                                                                                <button
                                                                                    className="w-full text-left px-4 py-2.5 hover:bg-white/10 transition-colors flex items-center gap-2"
                                                                                    onClick={(e) => { e.stopPropagation(); handleEditMessage(m); setMessageMenuOpen(null); }}
                                                                                >
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                                                    Editar
                                                                                </button>
                                                                                <button
                                                                                    className="w-full text-left px-4 py-2.5 hover:bg-red-500/20 text-red-400 transition-colors flex items-center gap-2"
                                                                                    onClick={(e) => { e.stopPropagation(); handleDeleteMessage(m); setMessageMenuOpen(null); }}
                                                                                >
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                                                    Eliminar para todos
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                        <button
                                                                            className="w-full text-left px-4 py-2.5 hover:bg-red-500/20 text-red-400 transition-colors flex items-center gap-2"
                                                                            onClick={(e) => { e.stopPropagation(); handleDeleteMessageForMe(m); setMessageMenuOpen(null); }}
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                                            Eliminar para mí
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </div>
                            );
                        })()}
                        {/* Input fijo - siempre visible */}
                        <div className="flex-shrink-0 bg-white/10 border-t border-white/10">
                            {/* Barra de "Respondiendo a..." */}
                            {replyingTo && (
                                <div className="px-3 py-2 bg-white/5 border-b border-white/10 flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-semibold text-indigo-300">
                                            Respondiendo a mensaje
                                        </div>
                                        <div className="text-xs text-indigo-200 truncate opacity-70">
                                            {replyingTo.Message}
                                        </div>
                                    </div>
                                    <button
                                        onClick={cancelReply}
                                        className="p-1 hover:bg-white/10 rounded transition-colors"
                                        aria-label="Cancelar respuesta"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                            )}
                            
                            {/* Área del input */}
                            <div className="p-3 sm:p-4 flex gap-3 items-end bg-gray-900/50 backdrop-blur-md relative">
                                {/* Botón de adjuntar */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowAttachMenu(!showAttachMenu)}
                                        className="h-[44px] w-[44px] flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all"
                                        title="Adjuntar"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 transform -rotate-45">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                                        </svg>
                                    </button>
                                    {showAttachMenu && (
                                        <MediaUploadMenu 
                                            onUploadSuccess={handleMediaUploadSuccess}
                                            onUploadError={(err) => {
                                                alert(err);
                                                setShowAttachMenu(false);
                                            }}
                                            onClose={() => setShowAttachMenu(false)}
                                        />
                                    )}
                                </div>

                                <div className="flex-1 relative">
                                    {isRecording ? (
                                        <div className="w-full h-[44px] flex items-center justify-between px-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400">
                                            <div className="flex items-center gap-3">
                                                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
                                                <span className="font-mono text-sm">{formatRecordingTime(recordingTime)}</span>
                                            </div>
                                            <button 
                                                onClick={cancelRecording}
                                                className="text-red-400 hover:text-red-300 text-sm font-medium"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    ) : (
                                        <textarea 
                                            value={currentDraft}
                                            onChange={handleInputChange}
                                            placeholder="Escribe un mensaje..."
                                            className="w-full p-3 pr-10 rounded-2xl bg-white/5 border border-white/10 focus:outline-none focus:border-indigo-500/50 focus:bg-white/10 text-white placeholder-indigo-300/50 text-[15px] resize-none min-h-[44px] max-h-[120px] transition-all"
                                            rows={1}
                                            onInput={(e) => {
                                                e.target.style.height = 'auto';
                                                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                                            }}
                                            onFocus={() => {
                                                // Scroll automático cuando aparece el teclado móvil
                                                setTimeout(() => {
                                                    if (messagesContainerRef.current) {
                                                        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
                                                    }
                                                }, 300);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    if (selected && currentDraft.trim()) {
                                                        handleSend();
                                                        e.target.style.height = 'auto';
                                                    }
                                                }
                                            }}
                                        />
                                    )}
                                </div>
                                
                                {currentDraft.trim() ? (
                                    <button
                                        className={`h-[44px] w-[44px] flex items-center justify-center rounded-full text-white transition-all transform ${
                                            selected && profile?.Telephon 
                                                ? 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/25 active:scale-95' 
                                                : 'bg-white/5 text-white/30 cursor-not-allowed'
                                        }`}
                                        disabled={!selected || !profile?.Telephon}
                                        onClick={() => {
                                            handleSend();
                                            const textarea = document.querySelector('textarea');
                                            if (textarea) textarea.style.height = 'auto';
                                        }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-1">
                                            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                                        </svg>
                                    </button>
                                ) : (
                                    <button
                                        className={`h-[44px] w-[44px] flex items-center justify-center rounded-full text-white transition-all transform ${
                                            isRecording 
                                                ? 'bg-red-500 hover:bg-red-600 hover:scale-105 active:scale-95' 
                                                : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:scale-105 hover:shadow-lg hover:shadow-green-500/25 active:scale-95'
                                        }`}
                                        onClick={isRecording ? stopRecording : startRecording}
                                        title={isRecording ? "Detener y enviar" : "Grabar nota de voz"}
                                    >
                                        {isRecording ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                                <path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" />
                                            </svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                                <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                                                <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
                                            </svg>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Contact Details Panel */}
            {showContactDetails && selected && (
                <div className="fixed inset-0 lg:static lg:w-80 bg-gray-900/95 lg:border-l border-white/10 flex flex-col h-full z-50 lg:z-40 shadow-2xl transition-all duration-300">
                    <div className="p-4 border-b border-white/10 flex items-center gap-3 bg-white/5">
                        <button 
                            onClick={() => setShowContactDetails(false)}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                        </button>
                        <h3 className="font-bold text-lg">Info. del contacto</h3>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
                        <div 
                            className="relative w-32 h-32 rounded-full mb-4 cursor-pointer group shadow-xl border-4 border-gray-800"
                            onClick={() => avatarMap[selected.Number] && setViewImage(avatarMap[selected.Number])}
                            title={avatarMap[selected.Number] ? "Ver foto" : ""}
                        >
                            {avatarMap[selected.Number] ? (
                                <img src={avatarMap[selected.Number]} alt="" className="w-full h-full object-cover rounded-full" />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-4xl font-bold text-white">
                                    {(selected.ContactName || selected.Username)?.charAt(0)?.toUpperCase()}
                                </div>
                            )}
                            {avatarMap[selected.Number] && (
                                <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                    </svg>
                                </div>
                            )}
                            {isContactOnline(selected.Number) && (
                                <div className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 rounded-full border-4 border-gray-900"></div>
                            )}
                        </div>
                        
                        <h2 className="text-2xl font-bold text-white mb-1 text-center">
                            {selected.ContactName || selected.Username}
                        </h2>
                        <p className="text-indigo-300 mb-6 text-center">
                            {selected.Number}
                        </p>

                        <div className="w-full space-y-4">
                            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                <div className="text-xs text-indigo-300/70 mb-1 uppercase tracking-wider font-semibold">Estado</div>
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${isContactOnline(selected.Number) ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                                    <span className="text-white font-medium">
                                        {isContactOnline(selected.Number) ? 'En línea' : (getLastSeenText(selected.Number) || 'Desconectado')}
                                    </span>
                                </div>
                            </div>
                            
                            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                <div className="text-xs text-indigo-300/70 mb-1 uppercase tracking-wider font-semibold">Acciones</div>
                                <div className="flex gap-2 mt-3">
                                    <button 
                                        onClick={() => handleStartCall('audio')}
                                        disabled={!isConnected}
                                        className="flex-1 flex flex-col items-center justify-center gap-2 p-3 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 hover:text-indigo-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                        </svg>
                                        <span className="text-xs font-medium">Llamar</span>
                                    </button>
                                    <button 
                                        onClick={() => handleStartCall('video')}
                                        disabled={!isConnected}
                                        className="flex-1 flex flex-col items-center justify-center gap-2 p-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 hover:text-purple-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        <span className="text-xs font-medium">Video</span>
                                    </button>
                                </div>
                            </div>

                            {/* Fondo de este chat */}
                            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                <div className="text-xs text-indigo-300/70 mb-3 uppercase tracking-wider font-semibold">Fondo de este chat</div>
                                {chatWallpapers[selected.Number] ? (
                                    <div className="relative rounded-xl overflow-hidden h-28 mb-2">
                                        <img
                                            src={chatWallpapers[selected.Number].startsWith('/') ? window.location.origin + chatWallpapers[selected.Number] : chatWallpapers[selected.Number]}
                                            alt="Fondo del chat"
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2 gap-2">
                                            <label className="cursor-pointer flex items-center gap-1 text-xs text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm px-2 py-1 rounded-lg transition-colors">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                {uploadingWallpaper ? 'Subiendo...' : 'Cambiar'}
                                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleContactWallpaperUpload(e, selected.Number)} disabled={uploadingWallpaper} />
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveContactWallpaper(selected.Number)}
                                                className="flex items-center gap-1 text-xs text-red-300 bg-red-500/20 hover:bg-red-500/30 backdrop-blur-sm px-2 py-1 rounded-lg transition-colors"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                                Quitar
                                            </button>
                                        </div>
                                        {uploadingWallpaper && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <label className={`flex flex-col items-center justify-center h-20 rounded-xl border-2 border-dashed border-white/20 hover:border-indigo-400/60 bg-white/5 hover:bg-white/10 transition-all cursor-pointer gap-2 ${uploadingWallpaper ? 'opacity-50 pointer-events-none' : ''}`}>
                                        {uploadingWallpaper ? (
                                            <svg className="animate-spin h-5 w-5 text-indigo-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                            </svg>
                                        ) : (
                                            <>
                                                <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                <span className="text-xs text-indigo-300">Poner fondo a este chat</span>
                                            </>
                                        )}
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleContactWallpaperUpload(e, selected.Number)} disabled={uploadingWallpaper} />
                                    </label>
                                )}
                                {!chatWallpapers[selected.Number] && globalWallpaper && (
                                    <p className="text-xs text-indigo-300/50 mt-2 text-center">Usando fondo global</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showEdit && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-50">
                    <div className="w-full max-w-md bg-gray-900 border border-white/20 rounded-2xl p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-white">Editar Perfil</h3>
                            <button onClick={() => setShowEdit(false)} className="text-gray-400 hover:text-white transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        <div className="flex flex-col items-center mb-6">
                            <label className="relative w-24 h-24 rounded-full cursor-pointer group mb-2 shadow-lg" title="Cambiar foto de perfil">
                                {newAvatarPreview || (myAvatar && !removeAvatar) ? (
                                    <img src={newAvatarPreview || myAvatar} alt="avatar" className="w-24 h-24 rounded-full object-cover border-2 border-indigo-500/50" />
                                ) : (
                                    <div className="w-24 h-24 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-full flex items-center justify-center font-bold text-3xl border-2 border-indigo-500/50">
                                        {user?.username?.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity">
                                    {uploadingAvatar ? (
                                        <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                                        </svg>
                                    ) : (
                                        <>
                                            <svg className="w-6 h-6 text-white mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            <span className="text-[10px] text-white font-medium">Cambiar</span>
                                        </>
                                    )}
                                </div>
                                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                            </label>
                            <div className="flex items-center gap-3 mt-1">
                                <p className="text-xs text-indigo-300/70">Haz clic para actualizar tu foto</p>
                                {(myAvatar || newAvatarPreview) && !removeAvatar && (
                                    <button 
                                        type="button"
                                        onClick={handleRemoveAvatar}
                                        className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 bg-red-500/10 px-2 py-1 rounded-md"
                                    >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Quitar
                                    </button>
                                )}
                            </div>
                        </div>

                        <form onSubmit={submitEdit} className="space-y-5">
                            {status && (
                                <div className={`p-3 rounded-lg text-sm ${status.includes('Error') ? 'bg-red-500/20 text-red-200 border border-red-500/30' : 'bg-green-500/20 text-green-200 border border-green-500/30'}`}>
                                    {status}
                                </div>
                            )}

                            {/* Fondo de pantalla global */}
                            <div>
                                <label className="block text-sm font-medium text-indigo-200 mb-2">
                                    Fondo de pantalla (todos los chats)
                                </label>
                                {globalWallpaper ? (
                                    <div className="relative rounded-xl overflow-hidden mb-2 h-28 bg-white/5 border border-white/10">
                                        <img
                                            src={globalWallpaper.startsWith('/') ? window.location.origin + globalWallpaper : globalWallpaper}
                                            alt="Fondo actual"
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2 gap-2">
                                            <label className="cursor-pointer flex items-center gap-1 text-xs text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm px-2 py-1 rounded-lg transition-colors">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                Cambiar
                                                <input type="file" accept="image/*" className="hidden" onChange={handleGlobalWallpaperUpload} disabled={uploadingWallpaper} />
                                            </label>
                                            <button
                                                type="button"
                                                onClick={handleRemoveGlobalWallpaper}
                                                className="flex items-center gap-1 text-xs text-red-300 bg-red-500/20 hover:bg-red-500/30 backdrop-blur-sm px-2 py-1 rounded-lg transition-colors"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                                Quitar
                                            </button>
                                        </div>
                                        {uploadingWallpaper && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <label className={`flex flex-col items-center justify-center h-24 rounded-xl border-2 border-dashed border-white/20 hover:border-indigo-400/60 bg-white/5 hover:bg-white/10 transition-all cursor-pointer gap-2 ${uploadingWallpaper ? 'opacity-50 pointer-events-none' : ''}`}>
                                        {uploadingWallpaper ? (
                                            <svg className="animate-spin h-6 w-6 text-indigo-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                            </svg>
                                        ) : (
                                            <>
                                                <svg className="w-7 h-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                <span className="text-xs text-indigo-300">Seleccionar imagen de fondo</span>
                                            </>
                                        )}
                                        <input type="file" accept="image/*" className="hidden" onChange={handleGlobalWallpaperUpload} disabled={uploadingWallpaper} />
                                    </label>
                                )}
                                <p className="text-xs text-indigo-300/60 mt-1">Se aplica a todos los chats que no tengan fondo propio</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-indigo-200 mb-1.5">Nombre de usuario</label>
                                <input
                                    type="text"
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                    className="w-full p-3.5 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none text-white transition-all"
                                    placeholder="Tu nombre visible"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowEdit(false)}
                                    className="flex-1 bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-medium transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white py-3 rounded-xl font-medium shadow-lg shadow-indigo-500/25 transition-all"
                                >
                                    Guardar Cambios
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal para ver imagen en grande */}
            {viewImage && (
                <div 
                    className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[100] p-4 cursor-zoom-out"
                    onClick={() => setViewImage(null)}
                >
                    <div className="relative max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center">
                        <button 
                            className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/50 hover:bg-black/80 rounded-full p-2 transition-all"
                            onClick={(e) => {
                                e.stopPropagation();
                                setViewImage(null);
                            }}
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                        <img 
                            src={viewImage} 
                            alt="Vista ampliada" 
                            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}

            {/* Banner para activar notificaciones nativas */}
            {notifPermission === 'default' && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-indigo-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm">
                    <span className="text-xl">🔔</span>
                    <div className="flex-1 text-sm">
                        <div className="font-semibold">Activa las notificaciones</div>
                        <div className="text-indigo-200 text-xs mt-0.5">Recibe mensajes aunque no estés en la app</div>
                    </div>
                    <button
                        onClick={async () => {
                            const perm = await requestNotificationPermission();
                            setNotifPermission(perm);
                        }}
                        className="bg-white text-indigo-700 font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition flex-shrink-0"
                    >
                        Activar
                    </button>
                    <button
                        onClick={() => setNotifPermission('dismissed')}
                        className="text-white/50 hover:text-white text-lg leading-none"
                    >
                        ×
                    </button>
                </div>
            )}

            {/* Notificaciones Toast */}
            <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className="pointer-events-auto flex items-center gap-3 bg-gray-900/95 border border-white/10 backdrop-blur-xl text-white px-4 py-3 rounded-2xl shadow-2xl w-80 cursor-pointer hover:bg-gray-800/95 transition-colors"
                        style={{ animation: 'slideIn 0.25s ease-out' }}
                        onClick={() => {
                            const contact = contacts.find(c => c.Number === toast.telephon) || { Number: toast.telephon, ContactName: toast.senderName };
                            setSelected(contact);
                            dismissToast(toast.id);
                        }}
                    >
                        <div className="w-12 h-12 flex-shrink-0 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-bold text-lg overflow-hidden shadow-inner">
                            {toast.icon && toast.icon !== '/vite.svg' ? (
                                <img src={toast.icon} alt="" className="w-full h-full object-cover" />
                            ) : (
                                toast.senderName?.charAt(0)?.toUpperCase()
                            )}
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <div className="font-semibold text-sm truncate text-white">{toast.senderName}</div>
                            <div className="text-xs text-gray-300 truncate mt-0.5">{toast.message}</div>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                dismissToast(toast.id);
                            }}
                            className="text-white/40 hover:text-white/80 text-xl leading-none flex-shrink-0 p-1"
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>

            {/* ========== Diálogo de Permisos ========== */}
            {showPermissionsDialog && (
                <PermissionsDialog onDone={() => {
                    setShowPermissionsDialog(false);
                    setNotifPermission(getNotificationPermission());
                }} />
            )}

            {/* ========== UI de Llamadas ========== */}
            {/* Llamada entrante */}
            {incomingCall && (
                <IncomingCall
                    callerName={incomingCall.username}
                    callerNumber={incomingCall.from}
                    callType={incomingCall.callType}
                    onAccept={handleAcceptIncomingCall}
                    onReject={handleRejectIncomingCall}
                />
            )}

            {/* Sala de llamada activa */}
            {callState && callState.status === 'active' && (
                <CallRoom
                    roomID={callState.roomID}
                    userID={profile?.Telephon || user?.username}
                    userName={user?.username}
                    callType={callState.callType}
                    onCallEnd={handleEndCall}
                />
            )}

            {/* Llamada saliente esperando respuesta */}
            {callState && callState.status === 'ringing' && callState.role === 'caller' && (
                <div className="fixed inset-0 z-[9998] bg-black/80 backdrop-blur-md flex items-center justify-center">
                    <div className="bg-gradient-to-b from-gray-900 to-gray-800 rounded-[2rem] p-10 w-80 text-center shadow-2xl border border-white/10 relative overflow-hidden">
                        {/* Efecto de ondas de fondo */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                            <div className="w-40 h-40 border border-indigo-500 rounded-full animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                            <div className="absolute w-56 h-56 border border-purple-500 rounded-full animate-[ping_2.5s_cubic-bezier(0,0,0.2,1)_infinite_0.5s]"></div>
                        </div>
                        
                        <div className="relative mx-auto w-28 h-28 mb-8 z-10">
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full animate-pulse opacity-50 blur-md"></div>
                            <div className="relative w-28 h-28 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-4xl font-bold shadow-xl border-4 border-gray-800">
                                {callState.remoteName?.charAt(0)?.toUpperCase()}
                            </div>
                        </div>
                        <h3 className="text-white text-2xl font-bold mb-2 z-10 relative">{callState.remoteName}</h3>
                        <p className="text-indigo-300 text-base mb-10 z-10 relative flex items-center justify-center gap-2">
                            {callState.callType === 'video' ? (
                                <><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 animate-pulse" viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" /></svg> Videollamando...</>
                            ) : (
                                <><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 animate-pulse" viewBox="0 0 20 20" fill="currentColor"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" /></svg> Llamando...</>
                            )}
                        </p>
                        <button
                            onClick={handleEndCall}
                            className="w-16 h-16 mx-auto bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 shadow-[0_0_20px_rgba(239,68,68,0.4)] z-10 relative"
                            title="Cancelar llamada"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
