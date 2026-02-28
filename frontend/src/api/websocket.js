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
            if (document.hidden) {
                console.log('Tab oculto - WebSocket activo en background');
            } else {
                // Tab visible - resetear contador y reconectar si se desconectó
                if (!this.isIntentionallyClosed) {
                    this.reconnectAttempts = 0; // Resetear para que vuelva a intentar
                    if (!this.isConnected()) {
                        console.log('Tab visible - reconectando WebSocket');
                        this.connect();
                    }
                }
            }
        });

        // Detectar cuando el navegador pierde/recupera conexión
        window.addEventListener('online', () => {
            console.log('Conexión a internet recuperada');
            if (!this.isConnected() && !this.isIntentionallyClosed) {
                this.connect();
            }
        });

        window.addEventListener('offline', () => {
            console.log('Conexión a internet perdida');
        });
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('WebSocket ya está conectado');
            return;
        }

        this.isIntentionallyClosed = false;
        
        // Construir URL del WebSocket
        let wsUrl;
        if (import.meta.env.VITE_BACKEND_URL) {
            // Si hay una URL del backend configurada (para ngrok)
            const backendUrl = import.meta.env.VITE_BACKEND_URL;
            const protocol = backendUrl.startsWith('https') ? 'wss:' : 'ws:';
            const host = backendUrl.replace(/^https?:\/\//, '');
            wsUrl = `${protocol}//${host}/api/v1/ws`;
        } else if (window.location.hostname.includes('ngrok') ||
                window.location.hostname.includes('trycloudflare')) {
            // Si estamos en túnel público (ngrok o Cloudflare), usar el mismo dominio (nginx maneja el routing)
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            wsUrl = `${protocol}//${window.location.host}/api/v1/ws`;
        } else {
            // Fallback: desarrollo local - usar el hostname actual
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
            wsUrl = `${protocol}//${host}:8080/api/v1/ws`;
        }
        
        // WebSocket no puede enviar headers personalizados, usamos query param como fallback
        const storedToken = localStorage.getItem('token');
        console.log('[WS] Token en localStorage:', storedToken ? 'SI (presente)' : 'NO (ausente)');
        console.log('[WS] Token value:', storedToken);
        const tokenQuery = storedToken ? `?token=${encodeURIComponent(storedToken)}` : '';
        wsUrl = `${wsUrl}${tokenQuery}`;
        console.log('[WS] Conectando a:', wsUrl);

        try {
            this.ws = new WebSocket(wsUrl);
            this.setupEventHandlers();
        } catch (error) {
            console.error('Error creando WebSocket:', error);
            this.handleReconnect();
        }
    }

    setupEventHandlers() {
        this.ws.onopen = () => {
            console.log('WebSocket conectado');
            this.reconnectAttempts = 0;
            this.notifyConnectionState('connected');
            this.startHeartbeat();
        };

        this.ws.onclose = (event) => {
            console.log('WebSocket desconectado:', event.code, event.reason);
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
        console.log('[WS] Mensaje recibido:', { type, payload });

        // Casos especiales que necesitan transformación antes de notificar
        if (type === 'pong') {
            console.log('Pong recibido del servidor');
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
        this.reconnectAttempts++;
        // Backoff suave: 1.5s, 2.2s, 3.4s... hasta 20s máximo
        const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 20000);
        console.log(`Reintentando conexión (intento ${this.reconnectAttempts}) en ${delay / 1000}s...`);
        setTimeout(() => this.connect(), delay);
    }

    on(event, handler) {
        if (!this.messageHandlers.has(event)) {
            this.messageHandlers.set(event, []);
        }
        this.messageHandlers.get(event).push(handler);
        
        // Si alguien se registra para 'contacts_online' y ya tenemos datos, enviárselos inmediatamente
        if (event === 'contacts_online' && this.lastContactsOnline !== null) {
            console.log('[WS] Enviando contactos online guardados a listener tardío:', this.lastContactsOnline);
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

    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    // Helper genérico para enviar mensajes al WebSocket
    _send(type, payload) {
        if (!this.isConnected()) {
            console.error('WebSocket no conectado');
            return false;
        }
        this.ws.send(JSON.stringify({ type, payload }));
        return true;
    }

    disconnect() {
        this.isIntentionallyClosed = true; // Evitar reconexión automática
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
