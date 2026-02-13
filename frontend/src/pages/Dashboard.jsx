import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import api from '../api/axios';

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
    const [addMsg, setAddMsg] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [drafts, setDrafts] = useState({});
    const [messagesByChat, setMessagesByChat] = useState({});
    const [answering, setAnswering] = useState(false);
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    const [typingUsers, setTypingUsers] = useState(new Set()); // Usuarios que están escribiendo
    const messagesContainerRef = useRef(null);
    const typingTimeoutRef = useRef(null); // Para debounce del typing indicator

    const isContactOnline = (username) => onlineUsers.has(username);
    const isContactTyping = (username) => typingUsers.has(username);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const { data } = await api.get('/api/v1/user');
                setProfile(data);
            } catch {
                setError('No se pudo cargar el perfil');
            }
        };
        fetchProfile();
    }, []);

    // Escuchar mensajes del WebSocket
    useEffect(() => {
        const handleIncomingMessage = (messageData) => {
            console.log('Mensaje recibido por WebSocket:', messageData);
            
            // messageData es un schemas.Message del backend
            const { Username, Receptor, MessageID, Message, Status, Time } = messageData;
            
            // Determinar con quién es el chat
            let contactUsername;
            if (Username === user?.username) {
                // Mensaje enviado por mí
                contactUsername = Receptor;
            } else {
                // Mensaje recibido
                contactUsername = Username;
            }
            
            // Usar directamente el username como key (no necesitamos el objeto contact)
            const key = contactUsername;
            
            console.log('Guardando mensaje para contacto:', contactUsername, 'Key:', key);
            
            // Actualizar el estado de mensajes
            setMessagesByChat((prev) => {
                const existing = prev[key] || [];
                
                // Si es un mensaje enviado por mí, puede ser una confirmación de un mensaje temporal
                if (Username === user?.username) {
                    // Buscar si hay un mensaje temporal con el mismo contenido y receptor
                    // MessageID del servidor es número, el temporal es string que empieza con 'temp-'
                    const tempIndex = existing.findIndex(m => 
                        typeof m.MessageID === 'string' && m.MessageID.startsWith('temp-') && 
                        m.Message === Message && 
                        m.Receptor === Receptor
                    );
                    
                    if (tempIndex !== -1) {
                        // Reemplazar el mensaje temporal con el mensaje real del servidor
                        console.log('Reemplazando mensaje temporal con mensaje real:', MessageID);
                        const updated = [...existing];
                        updated[tempIndex] = messageData;
                        return {
                            ...prev,
                            [key]: updated
                        };
                    }
                } else {
                    // Es un mensaje recibido de otro usuario
                    // Si el chat está abierto, marcarlo como visto localmente
                    if (selected?.Username === contactUsername) {
                        // Buscar si hay un mensaje temporal para reemplazar (aunque poco probable para mensajes recibidos)
                        const tempIndex = existing.findIndex(m => 
                            typeof m.MessageID === 'string' && m.MessageID.startsWith('temp-') && 
                            m.Message === Message
                        );
                        
                        if (tempIndex !== -1) {
                            const updated = [...existing];
                            updated[tempIndex] = { ...messageData, Status: 'visto' };
                            return {
                                ...prev,
                                [key]: updated
                            };
                        }
                    }
                }
                
                // Verificar si el mensaje ya existe (por MessageID)
                const alreadyExists = existing.some(m => m.MessageID === MessageID);
                if (alreadyExists) {
                    // Actualizar el mensaje existente (por si cambió el estado)
                    console.log('Actualizando mensaje existente:', MessageID);
                    
                    // Si el mensaje es recibido Y el chat está abierto, marcarlo como visto localmente
                    const shouldMarkAsRead = (Username !== user?.username && selected?.Username === contactUsername);
                    
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
                    // Agregar nuevo mensaje
                    console.log('Agregando nuevo mensaje:', MessageID);
                    
                    // Si el mensaje es recibido Y el chat está abierto, marcarlo como visto localmente
                    const messageToAdd = (Username !== user?.username && selected?.Username === contactUsername)
                        ? { ...messageData, Status: 'visto' }
                        : messageData;
                    
                    return {
                        ...prev,
                        [key]: [...existing, messageToAdd]
                    };
                }
            });

            // Si el mensaje es recibido (no enviado por mí) Y el chat está abierto, marcar como visto en el servidor
            if (Username !== user?.username && selected?.Username === contactUsername && isConnected) {
                console.log('[AUTO-READ] Marcando como visto porque el chat está abierto:', contactUsername);
                sendReadConfirmation(contactUsername);
            }
        };

        const handleReadConfirmation = (readData) => {
            console.log('Confirmación de lectura recibida:', readData);
            
            if (!readData || !readData.from || !user?.username) {
                console.warn('Datos de confirmación inválidos:', readData);
                return;
            }
            
            // readData = { from: "usuario_que_leyó" }
            const { from } = readData;
            
            // Usar directamente el username como key
            const key = from;
            
            // Actualizar todos los mensajes enviados a ese contacto a "visto"
            setMessagesByChat((prev) => {
                const existing = prev[key] || [];
                return {
                    ...prev,
                    [key]: existing.map(m => {
                        if (!m) return m; // Skip null/undefined
                        return m.Username === user.username && m.Status !== 'visto'
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
    }, [on, off, user, selected, isConnected, sendReadConfirmation]);

    // Escuchar eventos de presencia (online/offline)
    useEffect(() => {
        const handleContactsOnline = (contacts) => {
            console.log('[DASHBOARD] Contactos online iniciales:', contacts);
            console.log('[DASHBOARD] Tipo de contacts:', typeof contacts, Array.isArray(contacts));
            setOnlineUsers(new Set(contacts));
        };

        const handleUserOnline = (username) => {
            console.log('[DASHBOARD] Usuario conectado:', username);
            setOnlineUsers(prev => {
                const newSet = new Set([...prev, username]);
                console.log('[DASHBOARD] Estado online actualizado:', Array.from(newSet));
                return newSet;
            });
        };

        const handleUserOffline = (username) => {
            console.log('[DASHBOARD] Usuario desconectado:', username);
            setOnlineUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(username);
                console.log('[DASHBOARD] Estado online actualizado:', Array.from(newSet));
                return newSet;
            });
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

    useEffect(() => {
        const fetchContacts = async () => {
            try {
                const { data } = await api.get('/api/v1/contact');
                setContacts(Array.isArray(data) ? data : []);
            } catch (e) {
                setAddMsg('No se pudo cargar contactos');
            }
        };
        // Cargar contactos solo una vez al montar
        fetchContacts();
        
        // Si necesitas refrescar contactos, el backend enviará notificaciones por WebSocket
    }, []);

    const toggleProfile = () => setShowProfile((v) => !v);
    const openEdit = () => {
        setNewUsername(user?.username || '');
        setShowEdit(true);
        setStatus('');
    };
    const getChatKey = (contact) => {
        if (!contact || !contact.Username) return '';
        // Simplificado: usar solo username como key única
        return contact.Username;
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

        // Enviar indicador de "escribiendo" solo si hay texto y WebSocket conectado
        if (value.trim() && isConnected && selected.Username) {
            // Limpiar timeout previo
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }

            // Enviar indicador de typing
            console.log('[TYPING] Enviando indicador a:', selected.Username);
            const sent = sendTypingIndicator(selected.Username);
            console.log('[TYPING] Indicador enviado:', sent);

            // Configurar timeout para dejar de enviar (debounce de 2 segundos)
            typingTimeoutRef.current = setTimeout(() => {
                typingTimeoutRef.current = null;
            }, 2000);
        }
    };
    const getUnreadCount = (contact) => {
        if (!contact || !contact.Username) return 0;
        // Si es el contacto actualmente seleccionado, no mostrar contador
        if (selected && selected.Username === contact.Username) return 0;
        
        const key = getChatKey(contact);
        const arr = messagesByChat[key] || [];
        return arr.filter((m) => m && m.Username === contact.Username && m.Status !== 'visto').length;
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
        if (!selected) return;
        const trimmed = currentDraft.trim();
        if (!trimmed) return;
        if (!user?.username) {
            console.error('Usuario no autenticado');
            return;
        }
        const key = getChatKey(selected);
        
        // Usar WebSocket siempre que esté disponible
        if (isConnected) {
            const sent = sendMessage(selected.Username, trimmed);
            if (sent) {
                // Crear mensaje temporal optimista (aparece inmediatamente en la UI)
                const tempMessage = {
                    MessageID: `temp-${Date.now()}`, // ID temporal
                    Username: user.username,
                    Receptor: selected.Username,
                    Message: trimmed,
                    Status: 'enviado',
                    Time: new Date().toISOString()
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
                
                // Limpiar el draft inmediatamente
                setDrafts((prev) => ({
                    ...prev,
                    [key]: '',
                }));
            } else {
                console.error('No se pudo enviar el mensaje por WebSocket');
            }
        } else {
            // Fallback a HTTP solo si WebSocket no está conectado
            console.warn('WebSocket desconectado, usando fallback HTTP');
            try {
                await api.post('/api/v1/chat', {
                    receptor: selected.Username,
                    message: trimmed,
                });
                const { data } = await api.get(`/api/v1/chat/${selected.Username}`);
                setMessagesByChat((prev) => ({
                    ...prev,
                    [key]: Array.isArray(data) ? data : [],
                }));
                setDrafts((prev) => ({
                    ...prev,
                    [key]: '',
                }));
            } catch (err) {
                console.error('Error enviando mensaje por HTTP:', err);
            }
        }
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
            await api.put('/api/v1/user', { username: nu });
            updateUsername(nu);
            const { data } = await api.get('/api/v1/user');
            setProfile(data);
            setShowEdit(false);
            setStatus('Nombre actualizado');
        } catch (err) {
            const d = err?.response?.data;
            const msg = typeof d === 'string' ? d : d?.message || d?.error || err?.message || 'Error al actualizar';
            setStatus(msg);
        }
    };
    const answerContact = async (ans) => {
        if (!selected) return;
        setAnswering(true);
        setStatus('');
        try {
            const { data: resp } = await api.put('/api/v1/contact', {
                username_add: selected.Username,
                answare: ans,
            });
            const ok = resp && (resp.message === 'status actualizado');
            if (!ok) {
                const msg = typeof resp === 'string' ? resp : (resp?.message || 'Error al actualizar contacto');
                setStatus(msg);
                return;
            }
            const { data } = await api.get('/api/v1/contact');
            const refreshed = Array.isArray(data) ? data : [];
            setContacts(refreshed);
            const still = refreshed.find(c => c.Username === selected.Username);
            if (!still) {
                setSelected(null);
                setStatus(ans === 'yes' ? 'Contacto aceptado' : 'Contacto rechazado');
                return;
            }
            setSelected(still);
            setStatus(ans === 'yes' ? 'Contacto aceptado' : 'Contacto rechazado');
        } catch (err) {
            const d = err?.response?.data;
            const msg = typeof d === 'string' ? d : d?.message || d?.error || 'Error al actualizar contacto';
            setStatus(msg);
        } finally {
            setAnswering(false);
        }
    };
    const submitAddContact = async (e) => {
        e.preventDefault();
        setAddMsg('');
        const n = numberInput.trim();
        if (n.length !== 8) {
            setAddMsg('El número debe tener 8 dígitos');
            return;
        }
        try {
            const { data } = await api.post('/api/v1/contact', JSON.stringify(n));
            const created = data?.['contacto creado'];
            if (created) {
                setContacts((prev) => [created, ...prev]);
                try {
                    const { data: refreshed } = await api.get('/api/v1/contact');
                    setContacts(Array.isArray(refreshed) ? refreshed : []);
                } catch {}
                setNumberInput('');
                setAddMsg('Contacto creado');
            } else {
                setAddMsg('Contacto creado');
            }
        } catch (err) {
            const d = err?.response?.data;
            const msg = typeof d === 'string' ? d : d?.message || d?.error || 'Error al agregar';
            if (typeof msg === 'string' && msg.toLowerCase().includes('contacto ya existente')) {
                try {
                    const { data: refreshed } = await api.get('/api/v1/contact');
                    setContacts(Array.isArray(refreshed) ? refreshed : []);
                } catch {}
                setAddMsg('Contacto creado');
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
                    const { data } = await api.get(`/api/v1/chat/${selected.Username}`);
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
                    return m.Username === selected.Username && m.Status !== 'visto'
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
                sendReadConfirmation(selected.Username);
            } else {
                // Fallback HTTP solo si WebSocket está desconectado
                api.put(`/api/v1/chat/${selected.Username}`).catch(() => {});
            }
        }, 300); // Pequeño delay para asegurar que los mensajes se cargaron
        
        // Los mensajes nuevos llegarán por WebSocket, no necesitamos polling
        
        return () => {
            active = false;
            clearTimeout(markTimer);
        };
    }, [selected, isConnected, sendReadConfirmation]);

    useEffect(() => {
        if (!contacts || contacts.length === 0) return;
        let active = true;
        
        // Cargar historial inicial de todos los chats solo una vez
        const fetchAllChats = async () => {
            try {
                const results = await Promise.all(
                    contacts.map((c) =>
                        api.get(`/api/v1/chat/${c.Username}`)
                            .then(({ data }) => ({ key: getChatKey(c), data }))
                            .catch(() => ({ key: getChatKey(c), data: null }))
                    )
                );
                if (!active) return;
                setMessagesByChat((prev) => {
                    const next = { ...prev };
                    results.forEach(({ key, data }) => {
                        if (Array.isArray(data)) {
                            next[key] = data;
                        }
                    });
                    return next;
                });
            } catch {}
        };
        
        fetchAllChats();
        // Los mensajes nuevos llegarán por WebSocket, no necesitamos polling
        
        return () => {
            active = false;
        };
    }, [contacts]);

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
        <div className="flex h-screen bg-gradient-to-br from-purple-950 via-indigo-950 to-gray-950 text-white overflow-hidden">
            {/* Sidebar */}
            <div className="w-72 bg-white/10 backdrop-blur-xl border-r border-white/10 flex flex-col">
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
                            onClick={() => { setShowAdd(true); setAddMsg(''); }}
                            className="flex-1 bg-white/10 hover:bg-white/20 text-indigo-200 py-2 rounded text-sm transition"
                        >
                            Añadir
                        </button>
                        <button
                            onClick={() => setShowSearch(true)}
                            className="flex-1 bg-white/10 hover:bg-white/20 text-indigo-200 py-2 rounded text-sm transition"
                        >
                            Buscar
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    <div className="text-indigo-200 text-sm mb-2 uppercase">Contactos</div>
                    <div>
                        {contacts.map((c, idx) => (
                            <button
                                key={idx}
                                onClick={() => setSelected(c)}
                                className={`relative w-full text-left p-3 bg-white/5 hover:bg-white/10 rounded mb-2 flex items-center gap-3 ${selected?.Username === c.Username ? 'ring-1 ring-indigo-400' : ''}`}
                            >
                                <div className="relative w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-sm">
                                    {c.Username?.charAt(0)?.toUpperCase()}
                                                                    {isContactOnline(c.Username) && (
                                                                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white/10"></div>
                                                                    )}
                                </div>
                                <div className="flex-1">
                                    <div className="font-medium">{c.Username}</div>
                                    <div className="text-xs text-indigo-200">
                                        {isContactOnline(c.Username) ? 'En línea' : c.Number}
                                    </div>
                                </div>
                                {c.Status === 'pending' && (
                                    <span className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-300">pendiente</span>
                                )}
                                {getUnreadCount(c) > 0 && (
                                    <span className="absolute top-2 right-2 bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                        {getUnreadCount(c)}
                                    </span>
                                )}
                            </button>
                        ))}
                        {contacts.length === 0 && (
                            <div className="text-sm text-indigo-300">Sin contactos</div>
                        )}
                    </div>
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
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {!selected ? (
                    <div className="flex flex-col h-full">
                        <div className="flex-1 flex flex-col items-center justify-center text-indigo-200 p-8 text-center overflow-y-auto">
                            <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center mb-6">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                            </div>
                            <h2 className="text-3xl font-bold mb-2">Bienvenido a todus</h2>
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
                    <div className="flex flex-col h-full min-h-0 relative">
                        {/* Header fijo */}
                        <div className="flex-shrink-0 p-4 border-b border-white/10 bg-white/5 flex items-center gap-3 z-10">
                            <div className="relative w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                                {selected.Username?.charAt(0)?.toUpperCase()}
                                                            {isContactOnline(selected.Username) && (
                                                                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white/5"></div>
                                                            )}
                            </div>
                            <div className="flex-1">
                                <div className="font-bold">{selected.Username}</div>
                                <div className="text-xs text-indigo-300">
                                    {isContactTyping(selected.Username) ? (
                                        <span className="text-blue-400 italic">escribiendo...</span>
                                    ) : isContactOnline(selected.Username) ? (
                                        <span className="text-green-400">● En línea</span>
                                    ) : (
                                        selected.Number
                                    )}
                                </div>
                            </div>
                            {selected.Status === 'pending' && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => answerContact('yes')}
                                        disabled={answering}
                                        className={`px-3 py-1 rounded ${answering ? 'opacity-50 cursor-not-allowed' : ''} bg-green-600/30 text-green-200`}
                                    >
                                        Yes
                                    </button>
                                    <button
                                        onClick={() => answerContact('no')}
                                        disabled={answering}
                                        className={`px-3 py-1 rounded ${answering ? 'opacity-50 cursor-not-allowed' : ''} bg-red-600/30 text-red-200`}
                                    >
                                        No
                                    </button>
                                </div>
                            )}
                        </div>
                        {/* Área de mensajes con scroll independiente */}
                        <div 
                            ref={messagesContainerRef}
                            className="flex-1 min-h-0 overflow-y-auto flex flex-col text-indigo-200 p-4 space-y-3 pb-32"
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
                                    
                                    const isMine = m.Username === user?.username;
                                    const text = m.Message || '';
                                    const statusMsg = isMine ? (m.Status || 'enviado') : '';
                                    const timeStr = m.Time ? new Date(m.Time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                                    
                                    return (
                                        <div
                                            key={m.MessageID || `msg-${idx}`}
                                            className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div
                                                className={`max-w-xs px-3 py-2 rounded-2xl text-sm ${
                                                    isMine
                                                        ? 'bg-indigo-600 text-white rounded-br-none'
                                                        : 'bg-white/10 text-indigo-100 rounded-bl-none'
                                                }`}
                                            >
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
                        {/* Input fijo en la parte inferior - estilo WhatsApp */}
                        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/10 border-t border-white/10 z-20">
                            <div className="flex gap-4">
                                <input 
                                    type="text" 
                                    value={currentDraft}
                                    onChange={handleInputChange}
                                    placeholder="Escribe un mensaje..."
                                    className="flex-1 p-3 rounded bg-white/5 border border-white/10 focus:outline-none text-white placeholder-indigo-300"
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter' && selected && currentDraft.trim()) {
                                            handleSend();
                                        }
                                    }}
                                />
                                <button
                                    className={`bg-gradient-to-r from-purple-600 to-indigo-600 px-6 rounded text-white font-medium transition ${selected && currentDraft.trim() ? 'hover:from-purple-500 hover:to-indigo-500' : 'opacity-50 cursor-not-allowed'}`}
                                    disabled={!selected || !currentDraft.trim()}
                                    onClick={handleSend}
                                >
                                    Enviar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {showAdd && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
                    <div className="w-full max-w-sm bg-white/10 border border-white/20 rounded-xl p-6">
                        <h3 className="text-lg font-bold mb-3">Añadir contacto por número</h3>
                        <form onSubmit={submitAddContact} className="space-y-4">
                            <input
                                type="text"
                                value={numberInput}
                                onChange={(e) => setNumberInput(e.target.value)}
                                className="w-full p-3 rounded bg-white/5 border border-white/10 focus:outline-none"
                                placeholder="Número (8 dígitos)"
                            />
                            {addMsg && <div className="text-xs text-indigo-200">{addMsg}</div>}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAdd(false)}
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
                    </div>
                </div>
            )}
            {showSearch && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
                    <div className="w-full max-w-sm bg-white/10 border border-white/20 rounded-xl p-6">
                        <h3 className="text-lg font-bold mb-3">Buscar contactos</h3>
                        <div className="text-sm text-indigo-200 mb-4">Próximamente...</div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setShowSearch(false)}
                                className="flex-1 bg-white/10 hover:bg-white/20 text-indigo-200 py-2 rounded"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
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
        </div>
    );
}
