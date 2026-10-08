import { useEffect, useState, useCallback, useRef } from 'react';
import wsManager, { type ReplySource, type WsHandlerEvent, type WsHandlerMap, type WsConnectionState } from '../api/websocket';
import type { CallType, MediaType } from '../types/api';

// Contador de referencia global para el singleton WebSocket.
// Solo se conecta al primer consumidor y desconecta al último.
let wsRefCount = 0;

// Handler tal como lo ven los consumidores del hook (mismo tipo genérico que
// wsManager.on/off, ver src/api/websocket.ts).
type Handler<K extends WsHandlerEvent> = (payload: WsHandlerMap[K]) => void;

// Almacenamiento interno de handlers registrados por este hook, por evento,
// para poder darlos de baja al desmontar (ver cleanup más abajo). Borra el
// tipo concreto de payload, igual que wsManager por dentro.
type ErasedHandler = (data: unknown) => void;

export function useWebSocket() {
    const [isConnected, setIsConnected] = useState(() => wsManager.isConnected());
    const [connectionState, setConnectionState] = useState<WsConnectionState>(
        wsManager.isConnected() ? 'connected' : 'disconnected'
    );
    const handlersRef = useRef(new Map<WsHandlerEvent, ErasedHandler[]>());

    useEffect(() => {
        wsRefCount++;

        // Solo conectar si es el primer consumidor
        if (wsRefCount === 1) {
            wsManager.connect();
        } else if (wsManager.isConnected()) {
            // Si ya estaba conectado, sincronizar estado local
            setIsConnected(true);
            setConnectionState('connected');
        }

        // Manejar estado de conexión
        const connectionHandler = (state: WsConnectionState) => {
            setConnectionState(state);
            setIsConnected(state === 'connected');
        };
        const unsubscribe = wsManager.onConnectionState(connectionHandler);

        // Cleanup al desmontar
        return () => {
            unsubscribe();
            wsRefCount--;
            // Solo desconectar si es el último consumidor
            if (wsRefCount <= 0) {
                wsRefCount = 0;
                wsManager.disconnect();
            }
        };
    }, []);

    // Nota (M3, ver M2): wsManager.on/off no devuelven una función de
    // desuscripción; el hook sigue gestionando su propia limpieza llamando a
    // off() explícitamente (más abajo), igual que antes de tipar.
    const on = useCallback(<K extends WsHandlerEvent>(event: K, handler: Handler<K>): void => {
        wsManager.on(event, handler);

        // Guardar referencia para cleanup
        if (!handlersRef.current.has(event)) {
            handlersRef.current.set(event, []);
        }
        handlersRef.current.get(event)!.push(handler as ErasedHandler);
    }, []);

    const off = useCallback(<K extends WsHandlerEvent>(event: K, handler: Handler<K>): void => {
        wsManager.off(event, handler);
        // Olvidar también el handler local (si no, la lista crece en cada re-suscripción)
        const handlers = handlersRef.current.get(event);
        if (handlers) {
            const idx = handlers.indexOf(handler as ErasedHandler);
            if (idx > -1) handlers.splice(idx, 1);
        }
    }, []);

    const sendMessage = useCallback((to: string, message: string, replyTo: ReplySource | null = null, mediaType: MediaType | null = null) => {
        return wsManager.sendMessage(to, message, replyTo, mediaType);
    }, []);

    const sendReadConfirmation = useCallback((from: string) => {
        return wsManager.sendReadConfirmation(from);
    }, []);

    const sendTypingIndicator = useCallback((to: string) => {
        return wsManager.sendTypingIndicator(to);
    }, []);

    const sendEditMessage = useCallback((messageID: number, receptor: string, newContent: string) => {
        return wsManager.sendEditMessage(messageID, receptor, newContent);
    }, []);

    const sendDeleteMessage = useCallback((messageID: number, receptor: string) => {
        return wsManager.sendDeleteMessage(messageID, receptor);
    }, []);

    const sendCallOffer = useCallback((to: string, roomID: string, callType?: CallType) => {
        return wsManager.sendCallOffer(to, roomID, callType);
    }, []);

    const sendCallAccept = useCallback((to: string, roomID: string) => {
        return wsManager.sendCallAccept(to, roomID);
    }, []);

    const sendCallReject = useCallback((to: string, roomID: string) => {
        return wsManager.sendCallReject(to, roomID);
    }, []);

    const sendCallEnd = useCallback((to: string, roomID: string) => {
        return wsManager.sendCallEnd(to, roomID);
    }, []);

    // --- Group send wrappers ---
    const sendGroupMessage = useCallback((groupID: number, message: string, replyTo: ReplySource | null = null, mediaType: MediaType | null = null) => {
        return wsManager.sendGroupMessage(groupID, message, replyTo, mediaType);
    }, []);

    const sendGroupTyping = useCallback((groupID: number) => {
        return wsManager.sendGroupTyping(groupID);
    }, []);

    const sendGroupEditMessage = useCallback((groupID: number, messageID: number, newContent: string) => {
        return wsManager.sendGroupEditMessage(groupID, messageID, newContent);
    }, []);

    const sendGroupDeleteMessage = useCallback((groupID: number, messageID: number) => {
        return wsManager.sendGroupDeleteMessage(groupID, messageID);
    }, []);

    const sendGroupJoin = useCallback((groupID: number) => {
        return wsManager.sendGroupJoin(groupID);
    }, []);

    const sendGroupDelivered = useCallback((groupID: number, messageID: number) => {
        return wsManager.sendGroupDelivered(groupID, messageID);
    }, []);

    const sendGroupRead = useCallback((groupID: number, upToMessageID: number) => {
        return wsManager.sendGroupRead(groupID, upToMessageID);
    }, []);

    // Cleanup de handlers al desmontar
    useEffect(() => {
        const registered = handlersRef.current;
        return () => {
            registered.forEach((handlers, event) => {
                handlers.forEach(handler => {
                    wsManager.off(event, handler);
                });
            });
        };
    }, []);

    return {
        isConnected,
        connectionState,
        on,
        off,
        sendMessage,
        sendReadConfirmation,
        sendTypingIndicator,
        sendEditMessage,
        sendDeleteMessage,
        sendCallOffer,
        sendCallAccept,
        sendCallReject,
        sendCallEnd,
        // Group
        sendGroupMessage,
        sendGroupTyping,
        sendGroupEditMessage,
        sendGroupDeleteMessage,
        sendGroupJoin,
        sendGroupDelivered,
        sendGroupRead,
    };
}
