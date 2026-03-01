import { useEffect } from 'react';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { useDashboard } from '../context/DashboardContext';

export const usePresence = () => {
    const { on, off } = useWebSocket();
    const { setOnlineUsers, setLastSeenMap, setTypingUsers } = useDashboard();

    useEffect(() => {
        const handleContactsOnline = (contacts) => {
            if (Array.isArray(contacts)) setOnlineUsers(new Set(contacts));
        };

        const handleUserOnline = (payload) => {
            if (payload?.telephon) {
                setOnlineUsers(prev => new Set([...prev, payload.telephon]));
            }
        };

        const handleUserOffline = (payload) => {
            if (payload?.telephon) {
                setOnlineUsers(prev => {
                    const next = new Set(prev);
                    next.delete(payload.telephon);
                    return next;
                });
                if (payload.last_seen) {
                    setLastSeenMap(prev => ({ ...prev, [payload.telephon]: payload.last_seen }));
                }
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
        };
    }, [on, off, setOnlineUsers, setLastSeenMap, setTypingUsers]);
};
