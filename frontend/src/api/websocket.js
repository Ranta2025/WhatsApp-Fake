// WebSocket Manager para el chat
class WebSocketManager {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.isIntentionallyClosed = false;
        this.messageHandlers = new Map();
        this.connectionStateHandlers = [];
        this.heartbeatInterval = null;
        this.lastContactsOnline = null; // Guardar último estado de contactos online
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

        // Manejar cuando el tab se oculta/muestra
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // Tab oculto - mantener conexión pero podría reducir actividad
                console.log('Tab oculto - WebSocket activo en background');
            } else {
                // Tab visible - reconectar si se desconectó
                if (!this.isConnected() && !this.isIntentionallyClosed) {
                    console.log('Tab visible - reconectando WebSocket');
                    this.connect();
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
        } else if (window.location.hostname.includes('ngrok')) {
            // Si estamos en ngrok, usar el mismo dominio (nginx maneja el routing)
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            wsUrl = `${protocol}//${window.location.host}/api/v1/ws`;
        } else {
            // Fallback: desarrollo local - usar el hostname actual
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            wsUrl = `${protocol}//${window.location.hostname}:8080/api/v1/ws`;
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

        switch (type) {
            case 'chat':
                // El backend envía el mensaje completo en payload
                this.notifyHandlers('message', payload);
                break;
            case 'read':
                // Confirmación de que alguien leyó mis mensajes
                this.notifyHandlers('read', payload);
                break;
            case 'typing':
                // Notificación de que alguien está escribiendo
                console.log('[WS] Usuario escribiendo:', payload.from);
                this.notifyHandlers('typing', payload);
                break;
            case 'contacts_online':
                // Lista inicial de contactos online
                console.log('[WS] Contactos online iniciales recibidos:', payload.contacts);
                this.lastContactsOnline = payload.contacts || []; // Guardar para listeners tardíos
                this.notifyHandlers('contacts_online', payload.contacts || []);
                break;
            case 'online':
                // Un contacto se conectó - notificar con payload completo {username, telephon}
                console.log('[WS] Contacto conectado:', payload.telephon, payload.username);
                this.notifyHandlers('online', payload);
                break;
            case 'offline':
                // Un contacto se desconectó - notificar con payload completo {username, telephon}
                console.log('[WS] Contacto desconectado:', payload.telephon, payload.username);
                this.notifyHandlers('offline', payload);
                break;
            case 'username_changed':
                // Un contacto cambió su nombre de usuario
                console.log('[WS] Contacto cambió username:', payload);
                this.notifyHandlers('username_changed', payload);
                break;
            case 'pong':
                console.log('Pong recibido del servidor');
                break;
            case 'error':
                console.error('Error del servidor:', data.error);
                this.notifyHandlers('error', data);
                break;
            default:
                console.log('Tipo de mensaje desconocido:', type, data);
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
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Reintentando conexión (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this.connect(), this.reconnectDelay);
        } else {
            console.error('Máximo de reintentos alcanzado');
            this.notifyConnectionState('failed');
        }
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

    sendMessage(to, message, replyTo = null) {
        if (!this.isConnected()) {
            console.error('WebSocket no conectado');
            return false;
        }

        const payload = {
            receptor: to,
            message: message
        };
        
        // Agregar campos de reply si existe
        if (replyTo) {
            payload.replyToMessageID = replyTo.MessageID;
            payload.replyToTelephon = replyTo.SenderTelephon;
            payload.replyToMessage = replyTo.Message;
        }

        const msg = {
            type: 'chat',
            payload: payload
        };

        this.ws.send(JSON.stringify(msg));
        return true;
    }

    sendReadConfirmation(from) {
        if (!this.isConnected()) return false;

        const msg = {
            type: 'read',
            payload: {
                from: from
            }
        };

        this.ws.send(JSON.stringify(msg));
        return true;
    }

    sendTypingIndicator(to) {
        if (!this.isConnected()) return false;

        const msg = {
            type: 'typing',
            payload: {
                to: to
            }
        };

        this.ws.send(JSON.stringify(msg));
        return true;
    }

    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    disconnect() {
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
