import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    getStatusFeed,
    createStatus,
    markStatusViewed,
    getStatusViewers,
    deleteStatus,
} from '../../../api/statusApi';
import { useDashboard } from '../../dashboard/context/DashboardContext';
import { useWebSocket } from '../../../hooks/useWebSocket';
import {
    sortContacts,
    applyStatusNew,
    applyStatusDeleted,
    applyStatusViewedForOwner,
    nextTarget,
    contactsByTelephon,
} from '../lib/feed';

const StatusContext = createContext();

export const useStatus = () => {
    const context = useContext(StatusContext);
    if (!context) {
        throw new Error('useStatus must be used within a StatusProvider');
    }
    return context;
};

export const StatusProvider = ({ children }) => {
    const { user, sidebarView } = useDashboard();
    const { isConnected, on, off } = useWebSocket();

    const [feed, setFeed] = useState({ Mine: [], Contacts: [] });
    const [loading, setLoading] = useState(false);
    const [feedError, setFeedError] = useState(null);
    const [viewersByStatusId, setViewersByStatusId] = useState({});

    // Overlays: composer y viewer full-screen.
    const [composerOpen, setComposerOpen] = useState(false);
    const [viewerKey, setViewerKey] = useState(null); // null | { mode: 'mine' } | { mode: 'contact', telephon }
    const [statusIndex, setStatusIndex] = useState(0);

    const fetchFeed = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await getStatusFeed();
            setFeed({ Mine: data?.Mine || [], Contacts: sortContacts(data?.Contacts || []) });
            setFeedError(null);
        } catch (err) {
            console.error('Error al obtener el feed de estados:', err);
            setFeedError(err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Carga inicial al montar (con sesión activa).
    useEffect(() => {
        if (!user) return;
        fetchFeed();
    }, [user, fetchFeed]);

    // Refrescar al abrir la pestaña "Estados".
    useEffect(() => {
        if (sidebarView === 'estados') fetchFeed();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- solo se dispara al cambiar de pestaña
    }, [sidebarView]);

    // WebSocket: eventos en tiempo real de estados.
    useEffect(() => {
        if (!isConnected) return;

        const handleStatusNew = (payload) => {
            if (!payload?.status) return;
            setFeed(prev => applyStatusNew(prev, payload.owner || {}, payload.status));
        };

        const handleStatusDeleted = (payload) => {
            if (!payload) return;
            setFeed(prev => applyStatusDeleted(prev, payload.ownerTelephon, payload.statusId));
        };

        const handleStatusViewed = (payload) => {
            if (!payload?.statusId) return;
            setFeed(prev => applyStatusViewedForOwner(prev, payload));
            setViewersByStatusId(prev => {
                const existing = prev[payload.statusId];
                if (!existing) return prev; // aún no se consultó la lista de vistos, nada que actualizar
                if (payload.viewer?.Telephon && existing.some(v => v.Telephon === payload.viewer.Telephon)) return prev;
                return {
                    ...prev,
                    [payload.statusId]: [...existing, { ...payload.viewer, ViewedAt: payload.viewedAt }],
                };
            });
        };

        on('status_new', handleStatusNew);
        on('status_deleted', handleStatusDeleted);
        on('status_viewed', handleStatusViewed);
        return () => {
            off('status_new', handleStatusNew);
            off('status_deleted', handleStatusDeleted);
            off('status_viewed', handleStatusViewed);
        };
    }, [isConnected, on, off]);

    // ── Acciones ─────────────────────────────────────────────────────────────

    const publishStatus = useCallback(async (body) => {
        const { data } = await createStatus(body);
        setFeed(prev => ({ ...prev, Mine: [...(prev.Mine || []), data.status] }));
        return data.status;
    }, []);

    const viewStatus = useCallback((status, ownerTelephon, isMine) => {
        if (isMine || !status || status.Viewed) return;
        setFeed(prev => {
            const contacts = (prev.Contacts || []).map(g => {
                if (g.Telephon !== ownerTelephon) return g;
                const Statuses = g.Statuses.map(s => s.ID === status.ID ? { ...s, Viewed: true } : s);
                return { ...g, Statuses, AllViewed: Statuses.every(s => s.Viewed) };
            });
            return { ...prev, Contacts: sortContacts(contacts) };
        });
        markStatusViewed(status.ID).catch(err => console.error('Error al marcar estado como visto:', err));
    }, []);

    const fetchViewers = useCallback(async (statusId) => {
        try {
            const { data } = await getStatusViewers(statusId);
            const viewers = data?.viewers || [];
            setViewersByStatusId(prev => ({ ...prev, [statusId]: viewers }));
            return viewers;
        } catch (err) {
            console.error('Error al obtener los vistos del estado:', err);
            return [];
        }
    }, []);

    const removeMyStatus = useCallback(async (statusId) => {
        await deleteStatus(statusId);
        setFeed(prev => ({ ...prev, Mine: (prev.Mine || []).filter(s => s.ID !== statusId) }));
        // El viewer se cierra solo si ese era el último estado (ver efecto de
        // reajuste de statusIndex más abajo); si quedan otros, se recoloca.
    }, []);

    // ── Overlays ─────────────────────────────────────────────────────────────

    const openComposer = useCallback(() => setComposerOpen(true), []);
    const closeComposer = useCallback(() => setComposerOpen(false), []);

    const openMyViewer = useCallback(() => {
        if (!feed.Mine.length) {
            setComposerOpen(true);
            return;
        }
        setViewerKey({ mode: 'mine' });
        setStatusIndex(0);
    }, [feed.Mine]);

    // Orden de feed.Contacts congelado al abrir el visor (ver R3-goNext-reorder):
    // goNext navega sobre esta copia estable en vez del array en vivo, que puede
    // reordenarse (AllViewed se manda al final) justo al marcar como visto el
    // último estado del propio grupo que se está mostrando.
    const contactOrderSnapshotRef = useRef([]);

    const openContactViewer = useCallback((telephon) => {
        const group = feed.Contacts.find(g => g.Telephon === telephon);
        if (!group) return;
        contactOrderSnapshotRef.current = feed.Contacts.map(g => g.Telephon);
        const firstUnseen = group.Statuses.findIndex(s => !s.Viewed);
        setViewerKey({ mode: 'contact', telephon });
        setStatusIndex(firstUnseen === -1 ? 0 : firstUnseen);
    }, [feed.Contacts]);

    const closeViewer = useCallback(() => setViewerKey(null), []);

    const currentStatuses = useMemo(() => {
        if (!viewerKey) return [];
        if (viewerKey.mode === 'mine') return feed.Mine;
        return feed.Contacts.find(g => g.Telephon === viewerKey.telephon)?.Statuses || [];
    }, [viewerKey, feed]);

    const currentOwner = useMemo(() => {
        if (!viewerKey) return null;
        if (viewerKey.mode === 'mine') return null; // el consumidor usa profile/myAvatar
        return feed.Contacts.find(g => g.Telephon === viewerKey.telephon) || null;
    }, [viewerKey, feed]);

    // Si el estado actual desaparece (p. ej. se borró), cerrar o reajustar el índice.
    useEffect(() => {
        if (!viewerKey) return;
        if (currentStatuses.length === 0) {
            closeViewer();
            return;
        }
        if (statusIndex >= currentStatuses.length) {
            setStatusIndex(currentStatuses.length - 1);
        }
    }, [viewerKey, currentStatuses, statusIndex, closeViewer]);

    const goNext = useCallback(() => {
        if (!viewerKey) return;
        if (statusIndex < currentStatuses.length - 1) {
            setStatusIndex(i => i + 1);
            return;
        }
        if (viewerKey.mode === 'mine') {
            closeViewer();
            return;
        }
        const target = nextTarget(contactOrderSnapshotRef.current, contactsByTelephon(feed.Contacts), viewerKey.telephon);
        if (!target) {
            closeViewer();
            return;
        }
        setViewerKey({ mode: 'contact', telephon: target.telephon });
        setStatusIndex(target.statusIndex);
    }, [viewerKey, statusIndex, currentStatuses, feed.Contacts, closeViewer]);

    const goPrev = useCallback(() => {
        if (!viewerKey) return;
        if (statusIndex > 0) {
            setStatusIndex(i => i - 1);
            return;
        }
        if (viewerKey.mode === 'mine') return;
        const idx = feed.Contacts.findIndex(g => g.Telephon === viewerKey.telephon);
        if (idx > 0) {
            const prevGroup = feed.Contacts[idx - 1];
            setViewerKey({ mode: 'contact', telephon: prevGroup.Telephon });
            setStatusIndex(Math.max(prevGroup.Statuses.length - 1, 0));
        }
    }, [viewerKey, statusIndex, feed.Contacts]);

    const hasUnseen = useMemo(() => feed.Contacts.some(g => !g.AllViewed), [feed.Contacts]);

    const value = {
        feed,
        loading,
        feedError,
        fetchFeed,
        hasUnseen,
        publishStatus,
        viewStatus,
        fetchViewers,
        viewersByStatusId,
        removeMyStatus,
        // Composer
        composerOpen,
        openComposer,
        closeComposer,
        // Viewer
        viewerKey,
        statusIndex,
        currentStatuses,
        currentOwner,
        openMyViewer,
        openContactViewer,
        closeViewer,
        goNext,
        goPrev,
    };

    return (
        <StatusContext.Provider value={value}>
            {children}
        </StatusContext.Provider>
    );
};

export default StatusContext;
