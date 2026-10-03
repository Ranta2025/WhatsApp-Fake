import api from './axios';
import { WS_URL } from '../config';
import type { Message, CallType, MediaType } from '../types/api';
import type {
    WsEventOf,
    WsEventType,
    WsError,
    WsClientMessage,
    WsClientMessageType,
} from '../types/ws';

const debug = import.meta.env.DEV ? (...args: unknown[]) => console.log(...args) : () => {};

// ─────────────────────────────────────────────────────────────────────────
// Contrato que reciben los listeners de `wsManager.on(event, handler)`.
//
// La mayoría de eventos pasan directo (mismo `type`, mismo `payload` que
// documenta WsEvent en src/types/ws.ts), pero handleMessage() remapea tres
// casos antes de notificar (ver ese método más abajo):
//   - "chat"            -> se notifica bajo el nombre "message".
//   - "error"           -> el listener recibe el envelope completo
//                          { type: 'error', error: string }, no solo el string.
//   - "contacts_online" -> el listener recibe directamente el array
//                          `string[]`, sin el wrapper { contacts }.
// "pong" nunca se notifica (se descarta en handleMessage). "chat" nunca
// llega a un listener bajo su propio nombre (siempre se remapea a "message").
// ─────────────────────────────────────────────────────────────────────────

type DirectPassthroughType = Exclude<WsEventType, 'chat' | 'error' | 'contacts_online' | 'pong'>;

/** Envelope de error tal como llega del servidor, sin normalizar. */
export type WsErrorEnvelope = Omit<WsError, 'error'> & { error?: unknown } & Record<string, unknown>;

export type WsHandlerMap = {
    [K in DirectPassthroughType]: WsEventOf<K>['payload'];
} & {
    message: WsEventOf<'chat'>['payload'];
    // El listener recibe el envelope crudo tal cual llegó por el wire (ver
    // handleMessage): puede traer campos extra, y `error` puede faltar o no
    // ser string, así que se tipa como unknown y el consumidor lo estrecha.
    error: WsErrorEnvelope;
    contacts_online: string[];
};

export type WsHandlerEvent = keyof WsHandlerMap;

/** Estados que puede reportar `onConnectionState`. */
export type WsConnectionState = 'connected' | 'disconnected' | 'unauthorized' | 'error';

/** Forma mínima que necesita `sendMessage`/`sendGroupMessage` del mensaje al que se responde. */
type ReplySource = Pick<Message, 'MessageID' | 'SenderTelephon' | 'Message'>;

interface WsTicketResponse {
    ticket: string;
}

/** Envelope de entrada tal como llega por el wire, sin validar aún. */
interface RawWsEnvelope {
    type?: string;
    payload?: unknown;
    error?: string;
}

function toEnvelope(raw: unknown): RawWsEnvelope {
    if (raw !== null && typeof raw === 'object') {
        return raw as RawWsEnvelope;
    }
    return {};
}

// R3-ws-unauthorized-branch-untested: igual que el JS original
// (`error.response?.status === 401`), sin exigir que `error` sea una
// instancia real de AxiosError — solo que tenga esa forma estructuralmente.
// Narrowing seguro de `unknown` en vez de un cast directo.
function getErrorStatus(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null || !('response' in error)) {
        return undefined;
    }
    const { response } = error as { response?: unknown };
    if (typeof response !== 'object' || response === null || !('status' in response)) {
        return undefined;
    }
    const { status } = response as { status?: unknown };
    return typeof status === 'number' ? status : undefined;
}

type ClientPayloadOf<T extends WsClientMessageType> = Extract<
    WsClientMessage,
    { type: T }
> extends { payload: infer P }
    ? P
    : never;

// Handler genérico usado en el almacenamiento interno (borra el tipo
// concreto de payload; `on`/`off` restauran la seguridad de tipos en el
// límite público mediante un cast controlado, ver más abajo).
type ErasedHandler = (data: unknown) => void;

// WebSocket Manager para el chat
class WebSocketManager {
    private ws: WebSocket | null = null;
    private reconnectAttempts = 0;
    private readonly reconnectDelay = 1500;
    private isIntentionallyClosed = true; // Iniciar como cerrado intencionalmente para evitar autoconexión al cargar
    private messageHandlers = new Map<WsHandlerEvent, ErasedHandler[]>();
    private connectionStateHandlers: Array<(state: WsConnectionState) => void> = [];
    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    private lastContactsOnline: string[] | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private connecting = false;

    constructor() {
        this.setupBrowserEventListeners();
    }

    private setupBrowserEventListeners(): void {
        // Cerrar conexión cuando se cierra el navegador o tab
        const closeConnection = (): void => {
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
    async connect(): Promise<void> {
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

        let ticket: string;
        try {
            const { data } = await api.get<WsTicketResponse>('/api/v1/ws-ticket');
            ticket = data.ticket;
        } catch (error) {
            this.connecting = false;
            if (getErrorStatus(error) === 401) {
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

    private clearReconnectTimer(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private setupEventHandlers(): void {
        if (!this.ws) return;

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
                const data: unknown = JSON.parse(event.data as string);
                this.handleMessage(data);
            } catch (error) {
                console.error('Error parseando mensaje:', error);
            }
        };
    }

    private handleMessage(raw: unknown): void {
        const { type, payload } = toEnvelope(raw);
        if (!type) return; // JSON válido pero sin `type`: se ignora, nada que rutear

        debug('[WS] Mensaje recibido:', { type, payload });

        // Casos especiales que necesitan transformación antes de notificar
        if (type === 'pong') {
            debug('Pong recibido del servidor');
            return;
        }

        if (type === 'error') {
            // R3-ws-error-envelope-normalization: notificar el envelope crudo
            // tal cual (todos sus campos), no un objeto reconstruido a mano
            // que descartaba cualquier campo extra fuera de {type, error}.
            const envelope = raw as WsErrorEnvelope;
            const errorMessage = typeof envelope.error === 'string' ? envelope.error : '';
            console.error('Error del servidor:', errorMessage);
            this.notifyHandlers('error', envelope);
            return;
        }

        if (type === 'contacts_online') {
            const contactsPayload = payload as { contacts?: string[] } | undefined;
            this.lastContactsOnline = contactsPayload?.contacts || [];
            this.notifyHandlers('contacts_online', this.lastContactsOnline);
            return;
        }

        // Mantener actualizado el caché de contactos online para late-listeners
        if (type === 'online' && this.lastContactsOnline !== null) {
            const onlinePayload = payload as { telephon?: string } | undefined;
            if (onlinePayload?.telephon && !this.lastContactsOnline.includes(onlinePayload.telephon)) {
                this.lastContactsOnline.push(onlinePayload.telephon);
            }
        }
        if (type === 'offline' && this.lastContactsOnline !== null) {
            const offlinePayload = payload as { telephon?: string } | undefined;
            if (offlinePayload?.telephon) {
                this.lastContactsOnline = this.lastContactsOnline.filter((t) => t !== offlinePayload.telephon);
            }
        }

        // Ruteo genérico: el type del mensaje se mapea directo al event handler
        // Esto cubre: chat, edit_message, delete_message, read, message_delivered,
        // typing, online, offline, contact_request, contact_response,
        // username_changed, incoming_call, call_accepted, call_rejected,
        // call_ended, call_unavailable, y cualquier tipo futuro
        if (type === 'chat') {
            this.notifyHandlers('message', payload as WsEventOf<'chat'>['payload']);
        } else {
            this.notifyHandlers(type, payload);
        }
    }

    private notifyHandlers<K extends WsHandlerEvent>(event: K, data: WsHandlerMap[K]): void;
    private notifyHandlers(event: string, data: unknown): void;
    private notifyHandlers(event: string, data: unknown): void {
        const handlers = this.messageHandlers.get(event as WsHandlerEvent) || [];
        handlers.forEach((handler) => handler(data));
    }

    private notifyConnectionState(state: WsConnectionState): void {
        this.connectionStateHandlers.forEach((handler) => handler(state));
    }

    private handleReconnect(): void {
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

    /** Registra un listener tipado para `event`; ver WsHandlerMap para el payload que recibirá. */
    on<K extends WsHandlerEvent>(event: K, handler: (payload: WsHandlerMap[K]) => void): void {
        if (!this.messageHandlers.has(event)) {
            this.messageHandlers.set(event, []);
        }
        this.messageHandlers.get(event)!.push(handler as ErasedHandler);

        // Si alguien se registra para 'contacts_online' y ya tenemos datos, enviárselos inmediatamente
        if (event === 'contacts_online' && this.lastContactsOnline !== null) {
            const cached = this.lastContactsOnline;
            debug('[WS] Enviando contactos online guardados a listener tardío:', cached);
            // Usar setTimeout para evitar ejecución síncrona durante el registro
            setTimeout(() => (handler as (payload: string[]) => void)(cached), 0);
        }
    }

    off<K extends WsHandlerEvent>(event: K, handler: (payload: WsHandlerMap[K]) => void): void {
        const handlers = this.messageHandlers.get(event);
        if (handlers) {
            const erased = handler as ErasedHandler;
            const index = handlers.indexOf(erased);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    // Registra un listener para cambios de estado de conexión
    onConnectionState(handler: (state: WsConnectionState) => void): () => void {
        this.connectionStateHandlers.push(handler);
        // Devolver función para desuscribirse
        return () => {
            const index = this.connectionStateHandlers.indexOf(handler);
            if (index > -1) {
                this.connectionStateHandlers.splice(index, 1);
            }
        };
    }

    sendMessage(to: string, message: string, replyTo: ReplySource | null = null, mediaType: MediaType | null = null): boolean {
        const payload: ClientPayloadOf<'chat'> = { receptor: to, message };
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

    sendReadConfirmation(from: string): boolean {
        return this._send('read', { from });
    }

    sendTypingIndicator(to: string): boolean {
        return this._send('typing', { to });
    }

    sendEditMessage(messageID: number, receptor: string, newContent: string): boolean {
        return this._send('edit_message', { messageID, receptor, message: newContent });
    }

    sendDeleteMessage(messageID: number, receptor: string): boolean {
        return this._send('delete_message', { messageID, receptor });
    }

    // --- Call signaling methods ---
    sendCallOffer(to: string, roomID: string, callType: CallType = 'video'): boolean {
        return this._send('call_offer', { to, roomID, callType });
    }

    sendCallAccept(to: string, roomID: string): boolean {
        return this._send('call_accept', { to, roomID });
    }

    sendCallReject(to: string, roomID: string): boolean {
        return this._send('call_reject', { to, roomID });
    }

    sendCallEnd(to: string, roomID: string): boolean {
        return this._send('call_end', { to, roomID });
    }

    // --- Group chat methods ---

    /**
     * Send a message to a group room.
     * @param groupID
     * @param message  - text content (or media URL if mediaType is set)
     * @param replyTo - message being replied to
     * @param mediaType - 'image'|'video'|'audio'|'document'|null
     */
    sendGroupMessage(groupID: number, message: string, replyTo: ReplySource | null = null, mediaType: MediaType | null = null): boolean {
        const payload: ClientPayloadOf<'group_chat'> = { groupID, message };
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
    sendGroupTyping(groupID: number): boolean {
        return this._send('group_typing', { groupID });
    }

    /** Edit a message inside a group. */
    sendGroupEditMessage(groupID: number, messageID: number, newContent: string): boolean {
        return this._send('group_edit_message', { groupID, messageID, message: newContent });
    }

    /** Delete a message inside a group for everyone. */
    sendGroupDeleteMessage(groupID: number, messageID: number): boolean {
        return this._send('group_delete_message', { groupID, messageID });
    }

    /** Join a group's WS room — called every time the user opens a group chat. */
    sendGroupJoin(groupID: number): boolean {
        return this._send('group_join', { groupID });
    }

    /** Acuse de entrega de mensajes de grupo hasta `messageID` (false si no hay conexión). */
    sendGroupDelivered(groupID: number, messageID: number): boolean {
        return this._send('group_delivered', { groupID, messageID });
    }

    /** Acuse de lectura del grupo hasta `upToMessageID` (false si no hay conexión). */
    sendGroupRead(groupID: number, upToMessageID: number): boolean {
        return this._send('group_read', { groupID, upToMessageID });
    }

    /** Fija (emoji no vacío) o quita (emoji vacío) mi reacción a un mensaje 1:1 o de grupo. */
    sendReaction(kind: 'direct' | 'group', messageID: number, emoji: string, groupID?: number): boolean {
        return this._send('react', {
            kind,
            messageID,
            emoji,
            ...(kind === 'group' && groupID !== undefined ? { groupID } : {}),
        });
    }

    isConnected(): boolean {
        return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
    }

    // Helper genérico para enviar mensajes al WebSocket
    private _send<T extends WsClientMessageType>(type: T, payload: ClientPayloadOf<T>): boolean {
        if (!this.isConnected()) {
            debug('[WS] No conectado, mensaje no enviado:', type);
            return false;
        }
        this.ws!.send(JSON.stringify({ type, payload }));
        return true;
    }

    disconnect(): void {
        this.isIntentionallyClosed = true; // Evitar reconexión automática
        this.clearReconnectTimer();
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close(1000, 'Cliente desconectado intencionalmente');
            this.ws = null;
        }
    }

    // Heartbeat adicional desde el cliente para detectar conexiones muertas
    private startHeartbeat(): void {
        this.stopHeartbeat(); // Limpiar cualquier heartbeat previo

        // Enviar ping cada 30 segundos (menos que el pongWait del servidor de 60s)
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected()) {
                try {
                    // Enviar mensaje de heartbeat
                    this.ws!.send(JSON.stringify({ type: 'ping' }));
                } catch (error) {
                    console.error('Error enviando heartbeat:', error);
                    // Si falla, probablemente la conexión está muerta
                    this.ws!.close();
                }
            }
        }, 30000); // 30 segundos
    }

    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
}

// Exportar instancia única (singleton)
const wsManager = new WebSocketManager();
export default wsManager;
