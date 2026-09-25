import api from './axios';
import { WS_URL } from '../config';

const debug = import.meta.env.DEV ? (...args) => console.log(...args) : () => {};

// WebSocket Manager para el chat
class WebSocketManager {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = Infinity; // Siempre reconectar en móvil
        this.reconnectDelay = 1500;
        this.isIntentionallyClosed = true; // Iniciar como cerrado intencionalmente para evitar autoconexión al cargar
        this.messageHandlers = new Map();
        this.connectionStateHandlers = [];
        this.heartbeatInterval = null;
        this.lastContactsOnline = null;
        this.reconnectTimer = null;
        this.connecting = false;
        this.setupBrowserEventListeners();
    }

    setupBrowserEventListeners() {
        // Cerrar conexión cuando se cierra el navegador o tab
        const closeConnection = () => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.isIntentionallyClosed = true;
                this.ws.close(1000, 'Cliente cerrando navegador');
            }
        };
        
        window.addEventListener('beforeunload', closeConnection);
        window.addEventListener('unload', closeConnection);
        window.addEventListener('pagehide', closeConnection);

        // Manejar cuando el tab se oculta/muestra (crítico en móvil)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // Tab visible - resetear contador y reconectar si se desconectó
                if (!this.isIntentionallyClosed) {
                    this.reconnectAttempts = 0; // Resetear para que vuelva a intentar
                    if (!this.isConnected()) {
                        debug('Tab visible - reconectando WebSocket');
                        this.connect();
                    }
                }
            }
        });

        // Detectar cuando el navegador pierde/recupera conexión
        window.addEventListener('online', () => {
            debug('Conexión a internet recuperada');
            if (!this.isConnected() && !this.isIntentionallyClosed) {
                this.connect();
            }
        });

    }

    // Abre la conexión. Primero pide un ticket de un solo uso a la API: la
    // petición pasa por axios, que renueva la sesión si el access token expiró
    // (antes el handshake fallaba con 401 y se reintentaba indefinidamente), y
    // el ticket permite conectar aunque el backend esté en otro dominio.
    async connect() {
        // Marcar la intención de estar conectados antes de cualquier early-return:
        // si ya hay una petición de ticket en curso (p. ej. montar → desmontar →
        // montar en StrictMode), esa petición continuará y abrirá la conexión.
        this.isIntentionallyClosed = false;
        if (this.connecting) return;
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }
        if (this.ws) {
            try { this.ws.close(); } catch { /* ignorar */ }
            this.ws = null;
        }
        this.clearReconnectTimer();
        this.connecting = true;

        let ticket;
        try {
            const { data } = await api.get('/api/v1/ws-ticket');
            ticket = data.ticket;
        } catch (error) {
            this.connecting = false;
            if (error.response?.status === 401) {
                // Sesión caducada definitivamente: no reintentar
                this.isIntentionallyClosed = true;
                this.notifyConnectionState('unauthorized');
                return;
            }
            this.handleReconnect();
            return;
        }
        this.connecting = false;
        if (this.isIntentionallyClosed) return; // se desconectó mientras esperábamos

        try {
            this.ws = new WebSocket(`${WS_URL}?ticket=${encodeURIComponent(ticket)}`);
            this.setupEventHandlers();
        } catch (error) {
            console.error('Error creando WebSocket:', error);
            this.handleReconnect();
        }
    }

    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    setupEventHandlers() {
        this.ws.onopen = () => {
            debug('WebSocket conectado');
            this.reconnectAttempts = 0;
            this.notifyConnectionState('connected');
            this.startHeartbeat();
        };

        this.ws.onclose = (event) => {
            debug('WebSocket desconectado:', event.code, event.reason);
            this.stopHeartbeat();
            this.lastContactsOnline = null; // Limpiar estado al desconectar
            this.notifyConnectionState('disconnected');
            
            if (!this.isIntentionallyClosed) {
                this.handleReconnect();
            }
        };

        this.ws.onerror = (error) => {
            console.error('Error en WebSocket:', error);
            this.notifyConnectionState('error');
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                console.error('Error parseando mensaje:', error);
            }
        };
    }

    handleMessage(data) {
        const { type, payload } = data;
        debug('[WS] Mensaje recibido:', { type, payload });

        // Casos especiales que necesitan transformación antes de notificar
        if (type === 'pong') {
            debug('Pong recibido del servidor');
            return;
        }

        if (type === 'error') {
            console.error('Error del servidor:', data.error);
            this.notifyHandlers('error', data);
            return;
        }

        if (type === 'contacts_online') {
            this.lastContactsOnline = payload.contacts || [];
            this.notifyHandlers('contacts_online', this.lastContactsOnline);
            return;
        }

        // Mantener actualizado el caché de contactos online para late-listeners
        if (type === 'online' && this.lastContactsOnline !== null) {
            if (payload.telephon && !this.lastContactsOnline.includes(payload.telephon)) {
                this.lastContactsOnline.push(payload.telephon);
            }
        }
        if (type === 'offline' && this.lastContactsOnline !== null) {
            if (payload.telephon) {
                this.lastContactsOnline = this.lastContactsOnline.filter(t => t !== payload.telephon);
            }
        }

        // Ruteo genérico: el type del mensaje se mapea directo al event handler
        // Esto cubre: chat, edit_message, delete_message, read, message_delivered,
        // typing, online, offline, contact_request, contact_response,
        // username_changed, incoming_call, call_accepted, call_rejected,
        // call_ended, call_unavailable, y cualquier tipo futuro
        if (type === 'chat') {
            this.notifyHandlers('message', payload);
        } else {
            this.notifyHandlers(type, payload);
        }
    }

    notifyHandlers(event, data) {
        const handlers = this.messageHandlers.get(event) || [];
        handlers.forEach(handler => handler(data));
    }

    notifyConnectionState(state) {
        this.connectionStateHandlers.forEach(handler => handler(state));
    }

    handleReconnect() {
        if (this.isIntentionallyClosed || this.reconnectTimer) return;
        this.reconnectAttempts++;
        // Backoff suave: 1.5s, 2.2s, 3.4s... hasta 20s máximo
        const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 20000);
        debug(`[WS] Reintentando conexión (intento ${this.reconnectAttempts}) en ${delay / 1000}s`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    on(event, handler) {
        if (!this.messageHandlers.has(event)) {
            this.messageHandlers.set(event, []);
        }
        this.messageHandlers.get(event).push(handler);
        
        // Si alguien se registra para 'contacts_online' y ya tenemos datos, enviárselos inmediatamente
        if (event === 'contacts_online' && this.lastContactsOnline !== null) {
            debug('[WS] Enviando contactos online guardados a listener tardío:', this.lastContactsOnline);
            // Usar setTimeout para evitar ejecución síncrona durante el registro
            setTimeout(() => handler(this.lastContactsOnline), 0);
        }
    }

    off(event, handler) {
        const handlers = this.messageHandlers.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    // Registra un listener para cambios de estado de conexión
    onConnectionState(handler) {
        this.connectionStateHandlers.push(handler);
        // Devolver función para desuscribirse
        return () => {
            const index = this.connectionStateHandlers.indexOf(handler);
            if (index > -1) {
                this.connectionStateHandlers.splice(index, 1);
            }
        };
    }

    sendMessage(to, message, replyTo = null, mediaType = null) {
        const payload = { receptor: to, message };
        if (replyTo) {
            payload.replyToMessageID = replyTo.MessageID;
            payload.replyToTelephon = replyTo.SenderTelephon;
            payload.replyToMessage = replyTo.Message;
        }
        if (mediaType) {
            payload.mediaType = mediaType;
            payload.mediaUrl = message; // El mensaje es la URL
        }
        return this._send('chat', payload);
    }

    sendReadConfirmation(from) {
        return this._send('read', { from });
    }

    sendTypingIndicator(to) {
        return this._send('typing', { to });
    }

    sendEditMessage(messageID, receptor, newContent) {
        return this._send('edit_message', { messageID, receptor, message: newContent });
    }

    sendDeleteMessage(messageID, receptor) {
        return this._send('delete_message', { messageID, receptor });
    }

    // --- Call signaling methods ---
    sendCallOffer(to, roomID, callType = 'video') {
        return this._send('call_offer', { to, roomID, callType });
    }

    sendCallAccept(to, roomID) {
        return this._send('call_accept', { to, roomID });
    }

    sendCallReject(to, roomID) {
        return this._send('call_reject', { to, roomID });
    }

    sendCallEnd(to, roomID) {
        return this._send('call_end', { to, roomID });
    }

    // --- Group chat methods ---

    /**
     * Send a message to a group room.
     * @param {number} groupID
     * @param {string} message  - text content (or media URL if mediaType is set)
     * @param {object|null} replyTo - message being replied to
     * @param {string|null} mediaType - 'image'|'video'|'audio'|'document'|null
     */
    sendGroupMessage(groupID, message, replyTo = null, mediaType = null) {
        const payload = { groupID, message };
        if (replyTo) {
            payload.replyToMessageID = replyTo.MessageID;
            payload.replyToTelephon = replyTo.SenderTelephon;
            payload.replyToMessage  = replyTo.Message;
        }
        if (mediaType) {
            payload.mediaType = mediaType;
            payload.mediaUrl  = message; // message field holds the URL
        }
        return this._send('group_chat', payload);
    }

    /** Notify group members that the current user is typing. */
    sendGroupTyping(groupID) {
        return this._send('group_typing', { groupID });
    }

    /** Edit a message inside a group. */
    sendGroupEditMessage(groupID, messageID, newContent) {
        return this._send('group_edit_message', { groupID, messageID, message: newContent });
    }

    /** Delete a message inside a group for everyone. */
    sendGroupDeleteMessage(groupID, messageID) {
        return this._send('group_delete_message', { groupID, messageID });
    }

    /** Join a group's WS room — called every time the user opens a group chat. */
    sendGroupJoin(groupID) {
        return this._send('group_join', { groupID });
    }

    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    // Helper genérico para enviar mensajes al WebSocket
    _send(type, payload) {
        if (!this.isConnected()) {
            debug('[WS] No conectado, mensaje no enviado:', type);
            return false;
        }
        this.ws.send(JSON.stringify({ type, payload }));
        return true;
    }

    disconnect() {
        this.isIntentionallyClosed = true; // Evitar reconexión automática
        this.clearReconnectTimer();
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close(1000, 'Cliente desconectado intencionalmente');
            this.ws = null;
        }
    }

    // Heartbeat adicional desde el cliente para detectar conexiones muertas
    startHeartbeat() {
        this.stopHeartbeat(); // Limpiar cualquier heartbeat previo
        
        // Enviar ping cada 30 segundos (menos que el pongWait del servidor de 60s)
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected()) {
                try {
                    // Enviar mensaje de heartbeat
                    this.ws.send(JSON.stringify({ type: 'ping' }));
                } catch (error) {
                    console.error('Error enviando heartbeat:', error);
                    // Si falla, probablemente la conexión está muerta
                    this.ws.close();
                }
            }
        }, 30000); // 30 segundos
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
}

// Exportar instancia única (singleton)
const wsManager = new WebSocketManager();
export default wsManager;
