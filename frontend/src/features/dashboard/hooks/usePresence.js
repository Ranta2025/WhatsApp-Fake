import { useEffect, useRef } from 'react';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { useDashboard } from '../context/DashboardContext';

// Debounce para eventos offline: espera antes de marcar como desconectado.
// Si llega un 'online' antes del timeout, se cancela el offline (evita parpadeo).
const OFFLINE_DEBOUNCE_MS = 3000;

export const usePresence = () => {
    const { on, off } = useWebSocket();
    const { setOnlineUsers, setLastSeenMap, setTypingUsers } = useDashboard();
    // Map de telephon → timeoutId para debounce de offline
    const offlineTimers = useRef(new Map());

    useEffect(() => {
        const handleContactsOnline = (contacts) => {
            if (Array.isArray(contacts)) {
                // Cancelar cualquier timer de offline pendiente para contactos que están online
                contacts.forEach(tel => {
                    if (offlineTimers.current.has(tel)) {
                        clearTimeout(offlineTimers.current.get(tel));
                        offlineTimers.current.delete(tel);
                    }
                });
                setOnlineUsers(new Set(contacts));
            }
        };

        const handleUserOnline = (payload) => {
            if (payload?.telephon) {
                // Cancelar timer de offline pendiente (reconexión rápida)
                if (offlineTimers.current.has(payload.telephon)) {
                    clearTimeout(offlineTimers.current.get(payload.telephon));
                    offlineTimers.current.delete(payload.telephon);
                }
                setOnlineUsers(prev => new Set([...prev, payload.telephon]));
            }
        };

        const handleUserOffline = (payload) => {
            if (payload?.telephon) {
                const { telephon, last_seen } = payload;
                // Debounce: no marcar offline de inmediato, esperar por si se reconecta
                if (offlineTimers.current.has(telephon)) {
                    clearTimeout(offlineTimers.current.get(telephon));
                }
                offlineTimers.current.set(telephon, setTimeout(() => {
                    offlineTimers.current.delete(telephon);
                    setOnlineUsers(prev => {
                        const next = new Set(prev);
                        next.delete(telephon);
                        return next;
                    });
                    if (last_seen) {
                        setLastSeenMap(prev => ({ ...prev, [telephon]: last_seen }));
                    }
                }, OFFLINE_DEBOUNCE_MS));
            }
        };

        const handleTyping = (typingData) => {
            if (!typingData?.from) return;
            const { from } = typingData;
            setTypingUsers(prev => new Set([...prev, from]));
            setTimeout(() => {
                setTypingUsers(prev => {
                    const next = new Set(prev);
                    next.delete(from);
                    return next;
                });
            }, 3000);
        };

        on('contacts_online', handleContactsOnline);
        on('online', handleUserOnline);
        on('offline', handleUserOffline);
        on('typing', handleTyping);

        return () => {
            off('contacts_online', handleContactsOnline);
            off('online', handleUserOnline);
            off('offline', handleUserOffline);
            off('typing', handleTyping);
            // Limpiar todos los timers pendientes al desmontar
            offlineTimers.current.forEach(timer => clearTimeout(timer));
            offlineTimers.current.clear();
        };
    }, [on, off, setOnlineUsers, setLastSeenMap, setTypingUsers]);
};
