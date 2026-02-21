import { useEffect, useState, useCallback, useRef } from 'react';
import wsManager from '../api/websocket';

export function useWebSocket() {
    const [isConnected, setIsConnected] = useState(false);
    const [connectionState, setConnectionState] = useState('disconnected');
    const handlersRef = useRef(new Map());

    useEffect(() => {
        // Conectar WebSocket al montar
        wsManager.connect();

        // Manejar estado de conexión
        const connectionHandler = (state) => {
            setConnectionState(state);
            setIsConnected(state === 'connected');
        };
        const unsubscribe = wsManager.onConnectionState(connectionHandler);

        // Cleanup al desmontar
        return () => {
            unsubscribe();
            wsManager.disconnect();
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

    const sendMessage = useCallback((to, message, replyTo = null) => {
        return wsManager.sendMessage(to, message, replyTo);
    }, []);

    const sendReadConfirmation = useCallback((from) => {
        return wsManager.sendReadConfirmation(from);
    }, []);

    const sendTypingIndicator = useCallback((to) => {
        return wsManager.sendTypingIndicator(to);
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
        sendTypingIndicator
    };
}
