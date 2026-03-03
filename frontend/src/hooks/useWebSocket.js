import { useEffect, useState, useCallback, useRef } from 'react';
import wsManager from '../api/websocket';

// Contador de referencia global para el singleton WebSocket.
// Solo se conecta al primer consumidor y desconecta al último.
let wsRefCount = 0;

export function useWebSocket() {
    const [isConnected, setIsConnected] = useState(() => wsManager.isConnected());
    const [connectionState, setConnectionState] = useState(
        wsManager.isConnected() ? 'connected' : 'disconnected'
    );
    const handlersRef = useRef(new Map());

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
        const connectionHandler = (state) => {
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

    const on = useCallback((event, handler) => {
        wsManager.on(event, handler);
        
        // Guardar referencia para cleanup
        if (!handlersRef.current.has(event)) {
            handlersRef.current.set(event, []);
        }
        handlersRef.current.get(event).push(handler);
    }, []);

    const off = useCallback((event, handler) => {
        wsManager.off(event, handler);
    }, []);

    const sendMessage = useCallback((to, message, replyTo = null, mediaType = null) => {
        return wsManager.sendMessage(to, message, replyTo, mediaType);
    }, []);

    const sendReadConfirmation = useCallback((from) => {
        return wsManager.sendReadConfirmation(from);
    }, []);

    const sendTypingIndicator = useCallback((to) => {
        return wsManager.sendTypingIndicator(to);
    }, []);

    const sendEditMessage = useCallback((messageID, receptor, newContent) => {
        return wsManager.sendEditMessage(messageID, receptor, newContent);
    }, []);

    const sendDeleteMessage = useCallback((messageID, receptor) => {
        return wsManager.sendDeleteMessage(messageID, receptor);
    }, []);

    const sendCallOffer = useCallback((to, roomID, callType) => {
        return wsManager.sendCallOffer(to, roomID, callType);
    }, []);

    const sendCallAccept = useCallback((to, roomID) => {
        return wsManager.sendCallAccept(to, roomID);
    }, []);

    const sendCallReject = useCallback((to, roomID) => {
        return wsManager.sendCallReject(to, roomID);
    }, []);

    const sendCallEnd = useCallback((to, roomID) => {
        return wsManager.sendCallEnd(to, roomID);
    }, []);

    // --- Group send wrappers ---
    const sendGroupMessage = useCallback((groupID, message, replyTo = null, mediaType = null) => {
        return wsManager.sendGroupMessage(groupID, message, replyTo, mediaType);
    }, []);

    const sendGroupTyping = useCallback((groupID) => {
        return wsManager.sendGroupTyping(groupID);
    }, []);

    const sendGroupEditMessage = useCallback((groupID, messageID, newContent) => {
        return wsManager.sendGroupEditMessage(groupID, messageID, newContent);
    }, []);

    const sendGroupDeleteMessage = useCallback((groupID, messageID) => {
        return wsManager.sendGroupDeleteMessage(groupID, messageID);
    }, []);

    const sendGroupJoin = useCallback((groupID) => {
        return wsManager.sendGroupJoin(groupID);
    }, []);

    // Cleanup de handlers al desmontar
    useEffect(() => {
        return () => {
            handlersRef.current.forEach((handlers, event) => {
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
    };
}
