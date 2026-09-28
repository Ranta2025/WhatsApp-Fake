import { useEffect, useRef } from 'react';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { useDashboard } from '../context/DashboardContext';

// Debounce para eventos offline: espera antes de marcar como desconectado.
// Si llega un 'online' antes del timeout, se cancela el offline (evita parpadeo).
const OFFLINE_DEBOUNCE_MS = 3000;

export const usePresence = (): void => {
    const { on, off } = useWebSocket();
    const { setOnlineUsers, setLastSeenMap, setTypingUsers } = useDashboard();
    // Map de telephon → timeoutId para debounce de offline
    const offlineTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

    useEffect(() => {
        const timers = offlineTimers.current;
        const handleContactsOnline = (contacts: string[]) => {
            if (Array.isArray(contacts)) {
                // Cancelar cualquier timer de offline pendiente para contactos que están online
                contacts.forEach(tel => {
                    const timer = offlineTimers.current.get(tel);
                    if (timer !== undefined) {
                        clearTimeout(timer);
                        offlineTimers.current.delete(tel);
                    }
                });
                setOnlineUsers(new Set(contacts));
            }
        };

        const handleUserOnline = (payload: { telephon: string; username: string }) => {
            if (payload?.telephon) {
                // Cancelar timer de offline pendiente (reconexión rápida)
                const timer = offlineTimers.current.get(payload.telephon);
                if (timer !== undefined) {
                    clearTimeout(timer);
                    offlineTimers.current.delete(payload.telephon);
                }
                setOnlineUsers(prev => new Set([...prev, payload.telephon]));
            }
        };

        const handleUserOffline = (payload: { telephon: string; username: string; last_seen: string }) => {
            if (payload?.telephon) {
                const { telephon, last_seen } = payload;
                // Debounce: no marcar offline de inmediato, esperar por si se reconecta
                const existing = offlineTimers.current.get(telephon);
                if (existing !== undefined) {
                    clearTimeout(existing);
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

        const handleTyping = (typingData: { from: string }) => {
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
            timers.forEach(timer => clearTimeout(timer));
            timers.clear();
        };
    }, [on, off, setOnlineUsers, setLastSeenMap, setTypingUsers]);
};
