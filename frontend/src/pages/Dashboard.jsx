import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import api from '../api/axios';
import {
    requestNotificationPermission,
    showNativeNotification,
    getNotificationPermission,
    onNotificationClick,
    offNotificationClick
} from '../utils/notifications.js';

export default function Dashboard() {
    const { user, logout, updateUsername } = useAuth();
    const { isConnected, sendMessage, sendReadConfirmation, sendTypingIndicator, on, off } = useWebSocket();
    const [profile, setProfile] = useState(null);
    const [error, setError] = useState('');
    const [showProfile, setShowProfile] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [status, setStatus] = useState('');
    const [contacts, setContacts] = useState([]);
    const [selected, setSelected] = useState(null);
    const [numberInput, setNumberInput] = useState('');
    const [contactNameInput, setContactNameInput] = useState('');
    const [addMsg, setAddMsg] = useState('');
    const [sidebarView, setSidebarView] = useState('contacts'); // 'contacts' o 'chats'
    const [showAddContactForm, setShowAddContactForm] = useState(false);
    const [drafts, setDrafts] = useState({});
    const [messagesByChat, setMessagesByChat] = useState({});
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    const [typingUsers, setTypingUsers] = useState(new Set()); // Usuarios que están escribiendo
    const [sidebarOpen, setSidebarOpen] = useState(false); // Estado para sidebar en móvil
    const [replyingTo, setReplyingTo] = useState(null); // Mensaje al que se está respondiendo
    const [allChatGroups, setAllChatGroups] = useState({}); // metadata de todos los chats {telephon -> ChatGroup}
    const [toasts, setToasts] = useState([]); // notificaciones toast {id, senderName, message, telephon}
    const [notifPermission, setNotifPermission] = useState(getNotificationPermission());
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
        // 1. Intentar notificación nativa del sistema operativo
        const nativeShown = showNativeNotification({
            title: senderName,
            body: message.length > 100 ? message.substring(0, 100) + '...' : message,
            tag: `chat-${telephon}`, // Agrupa por contacto
            data: { telephon }
        });

        // 2. Toast in-app SOLO si la notificación nativa no se pudo mostrar
        if (!nativeShown) {
            const id = Date.now();
            setToasts(prev => [...prev, { id, telephon, senderName, message }]);
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, 4000);
        }
    };
    const dismissToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

    // Solicitar permiso de notificaciones al montar
    useEffect(() => {
        // Solicitar automáticamente si aún no se ha decidido
        if (getNotificationPermission() === 'default') {
            requestNotificationPermission().then(perm => setNotifPermission(perm));
        }
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

        on('message', handleIncomingMessage);
        on('read', handleReadConfirmation);

        return () => {
            off('message', handleIncomingMessage);
            off('read', handleReadConfirmation);
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

    useEffect(() => {
        const fetchContacts = async () => {
            try {
                const { data } = await api.get('/api/v1/contact');
                const list = Array.isArray(data) ? data : [];
                setContacts(list);
                contactsRef.current = list; // mantener ref sincronizada
            } catch (e) {
                setAddMsg('No se pudo cargar contactos');
            } finally {
                setLoadingContacts(false);
            }
        };
        fetchContacts();
    }, []);

    const toggleProfile = () => setShowProfile((v) => !v);
    const openEdit = () => {
        setNewUsername(user?.username || '');
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
            const sent = sendMessage(selected.Number, trimmed, replyingTo);
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
    
    const submitEdit = async (e) => {
        e.preventDefault();
        const nu = newUsername.trim();
        if (!nu || nu.length < 5) {
            setStatus('El usuario tiene que tener mas de 5 caracteres');
            return;
        }
        if (user?.username && nu === user.username) {
            setStatus('Proporciono el mismo usuario');
            return;
        }
        try {
            const response = await api.put('/api/v1/user', { username: nu });
            
            // Guardar el nuevo token si viene en la respuesta
            if (response.data?.token) {
                localStorage.setItem('token', response.data.token);
                console.log('[AUTH] Nuevo token guardado después de cambiar username');
            }
            
            const oldUsername = user.username;
            
            updateUsername(nu);
            
            // IMPORTANTE: Actualizar el username en TODOS mis mensajes enviados
            // para que sigan apareciendo como "míos" después del cambio
            setMessagesByChat(prev => {
                const updated = {};
                for (const [key, messages] of Object.entries(prev)) {
                    updated[key] = messages.map(m => {
                        // Si el mensaje fue enviado por mí (con mi telephon antiguo)
                        // actualizarlo al nuevo telephon
                        if (m.SenderTelephon === oldUsername) {
                            return { ...m, SenderTelephon: nu };
                        }
                        return m;
                    });
                }
                return updated;
            });
            
            const { data } = await api.get('/api/v1/user');
            setProfile(data);
            setShowEdit(false);
            setStatus('Nombre actualizado');
            
            // No es necesario reconectar WebSocket, el Hub ya actualizó el username del cliente
            console.log('[AUTH] Username actualizado, WebSocket mantiene conexión');
        } catch (err) {
            const d = err?.response?.data;
            const msg = typeof d === 'string' ? d : d?.message || d?.error || err?.message || 'Error al actualizar';
            setStatus(msg);
        }
    };
    const submitAddContact = async (e) => {
        e.preventDefault();
        setAddMsg('');
        const n = numberInput.trim();
        const cn = contactNameInput.trim();
        if (n.length !== 8) {
            setAddMsg('El número debe tener 8 dígitos');
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
                            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
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
                    <h1 className="text-xl font-bold">todos</h1>
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
                                    Object.keys(messagesByChat).map((contactNumber) => {
                                        const messages = messagesByChat[contactNumber] || [];
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
                                                <div className="relative w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-sm">
                                                    {displayName?.charAt(0)?.toUpperCase()}
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
                                    })
                                ) : (
                                    <div className="text-center text-indigo-200 py-8">
                                        No tienes conversaciones activas
                                    </div>
                                )}
                            </div>
                        </>
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
                                <button
                                    key={idx}
                                    onClick={() => {
                                        setSelected(c);
                                        setSidebarOpen(false);
                                    }}
                                    className={`relative w-full text-left p-3 bg-white/5 hover:bg-white/10 rounded mb-2 flex items-center gap-3 ${selected?.Number === c.Number ? 'ring-1 ring-indigo-400' : ''}`}
                                >
                                    <div className="relative w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-sm">
                                        {(c.ContactName || c.Username)?.charAt(0)?.toUpperCase()}
                                        {isContactOnline(c.Number) && (
                                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white/10"></div>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-medium">{c.ContactName || c.Username}</div>
                                        <div className="text-xs text-indigo-200">
                                            {isContactOnline(c.Number) ? 'En línea' : c.Number}
                                        </div>
                                    </div>
                                    {getUnreadCount(c) > 0 && (
                                        <span className="absolute top-2 right-2 bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                            {getUnreadCount(c)}
                                        </span>
                                    )}
                                </button>
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
                                    placeholder="Número (8 dígitos)"
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
                        <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-full flex items-center justify-center font-bold">
                            {user?.username?.charAt(0).toUpperCase()}
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
                        
                        <div className="flex-1 flex flex-col items-center justify-center text-indigo-200 p-8 text-center overflow-y-auto">
                            <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center mb-6">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                            </div>
                            <h2 className="text-3xl font-bold mb-2">Bienvenido a todos</h2>
                            <p className="max-w-md text-indigo-300">
                                Selecciona un contacto para comenzar a chatear.
                            </p>
                            <div className="mt-4 flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></span>
                                <span className="text-sm text-indigo-300">
                                    {isConnected ? 'WebSocket conectado' : 'WebSocket desconectado'}
                                </span>
                            </div>
                        </div>
                        <div className="flex-shrink-0 p-4 bg-white/10 border-t border-white/10">
                            <div className="flex gap-4">
                                <input 
                                    type="text" 
                                    value={currentDraft}
                                    onChange={handleInputChange}
                                    placeholder="Selecciona un contacto para escribir"
                                    className="flex-1 p-3 rounded bg-white/5 border border-white/10 focus:outline-none text-white placeholder-indigo-300 cursor-not-allowed opacity-50"
                                    disabled={true}
                                />
                                <button
                                    className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 rounded text-white font-medium opacity-50 cursor-not-allowed"
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
                        <div className="flex-shrink-0 p-3 border-b border-white/10 bg-white/5 flex flex-col gap-2">
                            <div className="flex items-center gap-2">
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
                            <div className="relative w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                                {(selected.ContactName || selected.Username)?.charAt(0)?.toUpperCase()}
                                                            {isContactOnline(selected.Number) && (
                                                                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white/5"></div>
                                                            )}
                            </div>
                            <div className="flex-1">
                                <div className="font-bold">{selected.ContactName || selected.Username}</div>
                                <div className="text-xs text-indigo-300">
                                    {isContactTyping(selected.Number) ? (
                                        <span className="text-blue-400 italic">escribiendo...</span>
                                    ) : isContactOnline(selected.Number) ? (
                                        <span className="text-green-400">● En línea</span>
                                    ) : (
                                        selected.Number
                                    )}
                                </div>
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
                        <div 
                            ref={messagesContainerRef}
                            className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col text-indigo-200 p-3 space-y-2"
                        >
                            {(messagesByChat[getChatKey(selected)] || []).length === 0 ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <div className="text-center">
                                        <div className="text-sm">Sin mensajes</div>
                                    </div>
                                </div>
                            ) : (
                                (messagesByChat[getChatKey(selected)] || []).map((m, idx) => {
                                    // Validar que el mensaje tenga los campos requeridos
                                    if (!m || !m.Message) {
                                        console.warn('Mensaje inválido detectado:', m);
                                        return null;
                                    }
                                    
                                    // m.SenderTelephon ahora contiene el número de teléfono del remitente
                                    const isMine = m.SenderTelephon === profile?.Telephon;
                                    const text = m.Message || '';
                                    const statusMsg = isMine ? (m.Status || 'enviado') : '';
                                    const timeStr = m.Time ? new Date(m.Time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                                    const hasReply = m.ReplyToMessageID && m.ReplyToMessage;
                                    
                                    return (
                                        <div
                                            key={m.MessageID || `msg-${idx}`}
                                            className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div
                                                className={`max-w-xs px-3 py-2 rounded-2xl text-sm cursor-pointer transition-opacity hover:opacity-90 ${
                                                    isMine
                                                        ? 'bg-indigo-600 text-white rounded-br-none'
                                                        : 'bg-white/10 text-indigo-100 rounded-bl-none'
                                                }`}
                                                onClick={() => handleReplyToMessage(m)}
                                                title="Click para responder"
                                            >
                                                {/* Mostrar cita si es una respuesta */}
                                                {hasReply && (
                                                    <div className={`mb-2 pl-2 border-l-2 ${isMine ? 'border-white/40' : 'border-indigo-400'} text-xs opacity-70 italic`}>
                                                        <div className="font-semibold">{m.ReplyToUsername}</div>
                                                        <div className="truncate">{m.ReplyToMessage}</div>
                                                    </div>
                                                )}
                                                <div>{text}</div>
                                                <div className="text-[10px] opacity-80 mt-1 flex items-center gap-1 justify-end">
                                                    <span>{timeStr}</span>
                                                    {isMine && <span>{getStatusIcon(statusMsg)}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
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
                            <div className="p-2 sm:p-3 flex gap-2 items-center">
                                <input 
                                    type="text" 
                                    value={currentDraft}
                                    onChange={handleInputChange}
                                    placeholder="Mensaje..."
                                    className="flex-1 p-2 rounded bg-white/5 border border-white/10 focus:outline-none text-white placeholder-indigo-300 text-sm"
                                    onFocus={() => {
                                        // Scroll automático cuando aparece el teclado móvil
                                        setTimeout(() => {
                                            if (messagesContainerRef.current) {
                                                messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
                                            }
                                        }, 300);
                                    }}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter' && selected && currentDraft.trim()) {
                                            handleSend();
                                        }
                                    }}
                                />
                                <button
                                    className={`bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 rounded text-white font-medium text-sm ${
                                        selected && currentDraft.trim() && profile?.Telephon 
                                            ? 'hover:from-purple-500 hover:to-indigo-500' 
                                            : 'opacity-50 cursor-not-allowed'
                                    }`}
                                    disabled={!selected || !currentDraft.trim() || !profile?.Telephon}
                                    onClick={handleSend}
                                >
                                    ➤
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {showEdit && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
                    <div className="w-full max-w-sm bg-white/10 border border-white/20 rounded-xl p-6">
                        <h3 className="text-lg font-bold mb-3">Editar nombre de perfil</h3>
                        <form onSubmit={submitEdit} className="space-y-4">
                                    {status && <div className="text-xs text-indigo-200">{status}</div>}
                            <input
                                type="text"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                className="w-full p-3 rounded bg-white/5 border border-white/10 focus:outline-none"
                                placeholder="Nuevo nombre"
                            />
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowEdit(false)}
                                    className="flex-1 bg-white/10 hover:bg-white/20 text-indigo-200 py-2 rounded"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white py-2 rounded"
                                >
                                    Guardar
                                </button>
                            </div>
                        </form>
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
                        className="pointer-events-auto flex items-start gap-3 bg-gray-900/95 border border-white/10 backdrop-blur-xl text-white px-4 py-3 rounded-xl shadow-2xl w-72 animate-slide-in"
                        style={{ animation: 'slideIn 0.25s ease-out' }}
                    >
                        <div className="w-9 h-9 flex-shrink-0 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-bold text-sm">
                            {toast.senderName?.charAt(0)?.toUpperCase()}
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <div className="font-semibold text-sm truncate">{toast.senderName}</div>
                            <div className="text-xs text-indigo-200 truncate mt-0.5">{toast.message}</div>
                        </div>
                        <button
                            onClick={() => dismissToast(toast.id)}
                            className="text-white/40 hover:text-white/80 text-lg leading-none flex-shrink-0 mt-0.5"
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
