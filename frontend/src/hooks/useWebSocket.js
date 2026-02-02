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
        wsManager.onConnectionState(connectionHandler);

        // Cleanup al desmontar
        return () => {
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

    const sendMessage = useCallback((to, message) => {
        return wsManager.sendMessage(to, message);
    }, []);

    const sendReadConfirmation = useCallback((from) => {
        return wsManager.sendReadConfirmation(from);
    }, []);

    const sendTypingIndicator = useCallback((to) => {
        return wsManager.sendTypingIndicator(to);
    }, []);

    const onOnlineStatus = useCallback((handler) => {
        wsManager.onOnlineStatus(handler);
    }, []);

    const acceptContact = useCallback((username) => {
        return wsManager.acceptContact(username);
    }, []);

    const rejectContact = useCallback((username) => {
        return wsManager.rejectContact(username);
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
        onOnlineStatus,
        acceptContact,
        rejectContact
    };
}

export function useOnlineStatus() {
    const [onlineUsers, setOnlineUsers] = useState(new Set());

    useEffect(() => {
        // Handler para lista inicial de contactos
        const contactListHandler = (contacts) => {
            const online = new Set(
                contacts.filter(c => c.online).map(c => c.username)
            );
            setOnlineUsers(online);
        };

        // Handler para cambios de estado online/offline
        const onlineHandler = (username, isOnline) => {
            setOnlineUsers(prev => {
                const newSet = new Set(prev);
                if (isOnline) {
                    newSet.add(username);
                } else {
                    newSet.delete(username);
                }
                return newSet;
            });
        };

        wsManager.on('contact_list', contactListHandler);
        wsManager.onOnlineStatus(onlineHandler);

        return () => {
            wsManager.off('contact_list', contactListHandler);
        };
    }, []);

    const isOnline = useCallback((username) => {
        return onlineUsers.has(username);
    }, [onlineUsers]);

    return { onlineUsers: Array.from(onlineUsers), isOnline };
}
