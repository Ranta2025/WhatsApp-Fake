import {
    createContext, useContext, useState, useEffect, useCallback, useMemo, useRef,
    type ReactNode,
} from 'react';
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
import type { WsHandlerMap } from '../../../api/websocket';
import type { StatusFeed, StatusItem, StatusContactGroup, StatusViewer, StatusCreateRequest } from '../../../types/api';

/** Qué overlay de visor está abierto: el propio estado o el de un contacto. */
export type ViewerKey = { mode: 'mine' } | { mode: 'contact'; telephon: string };

/** Return shape of `useStatus()` — members verified against real consumers
 * (`StatusList.jsx`, `StatusComposer.jsx`, `StatusViewer.jsx`, `Sidebar.jsx`, via `rg`). */
export interface StatusContextValue {
    feed: StatusFeed;
    loading: boolean;
    /** Sin consumidores hoy (dead field, preexistente) — se mantiene, no se agrega comportamiento nuevo. */
    feedError: unknown;
    fetchFeed: () => Promise<void>;
    hasUnseen: boolean;
    publishStatus: (body: StatusCreateRequest) => Promise<StatusItem>;
    viewStatus: (status: StatusItem, ownerTelephon: string, isMine: boolean) => void;
    fetchViewers: (statusId: number) => Promise<StatusViewer[]>;
    viewersByStatusId: Record<number, StatusViewer[]>;
    removeMyStatus: (statusId: number) => Promise<void>;
    // Composer
    composerOpen: boolean;
    openComposer: () => void;
    closeComposer: () => void;
    // Viewer
    viewerKey: ViewerKey | null;
    statusIndex: number;
    currentStatuses: StatusItem[];
    currentOwner: StatusContactGroup | null;
    openMyViewer: () => void;
    openContactViewer: (telephon: string) => void;
    closeViewer: () => void;
    goNext: () => void;
    goPrev: () => void;
}

const StatusContext = createContext<StatusContextValue | null>(null);

export const useStatus = (): StatusContextValue => {
    const context = useContext(StatusContext);
    if (!context) {
        throw new Error('useStatus must be used within a StatusProvider');
    }
    return context;
};

export const StatusProvider = ({ children }: { children: ReactNode }) => {
    const { user, sidebarView } = useDashboard();
    const { isConnected, on, off } = useWebSocket();

    const [feed, setFeed] = useState<StatusFeed>({ Mine: [], Contacts: [] });
    const [loading, setLoading] = useState(false);
    const [feedError, setFeedError] = useState<unknown>(null);
    const [viewersByStatusId, setViewersByStatusId] = useState<Record<number, StatusViewer[]>>({});

    // Overlays: composer y viewer full-screen.
    const [composerOpen, setComposerOpen] = useState(false);
    const [viewerKey, setViewerKey] = useState<ViewerKey | null>(null);
    const [statusIndex, setStatusIndex] = useState(0);

    const fetchFeed = useCallback(async () => {
        setLoading(true);
        try {
            // El cuerpo puede llegar vacío/null; `data?.` restaura la tolerancia
            // de la versión JS en vez de asumir StatusFeed no-nulo.
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
        // eslint-disable-next-line react-hooks/exhaustive-deps -- solo se dispara al cambiar de tab
    }, [sidebarView]);

    // WebSocket: eventos en tiempo real de estados.
    useEffect(() => {
        if (!isConnected) return;

        const handleStatusNew = (payload: WsHandlerMap['status_new']) => {
            if (!payload?.status) return;
            // El contrato (ws.ts) garantiza `owner`, pero el runtime no lo
            // valida (R3-status-new-owner-fallback-unproved) — sin
            // `owner.Telephon` no hay grupo al que agregar el estado;
            // `applyStatusNew` ignora el evento (no cambia el feed) en vez de
            // crear un grupo fantasma con teléfono vacío.
            setFeed(prev => applyStatusNew(prev, payload.owner, payload.status));
        };

        const handleStatusDeleted = (payload: WsHandlerMap['status_deleted']) => {
            if (!payload) return;
            setFeed(prev => applyStatusDeleted(prev, payload.ownerTelephon, payload.statusId));
        };

        const handleStatusViewed = (payload: WsHandlerMap['status_viewed']) => {
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

    const publishStatus = useCallback(async (body: StatusCreateRequest) => {
        const { data } = await createStatus(body);
        setFeed(prev => ({ ...prev, Mine: [...(prev.Mine || []), data.status] }));
        return data.status;
    }, []);

    const viewStatus = useCallback((status: StatusItem, ownerTelephon: string, isMine: boolean) => {
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

    const fetchViewers = useCallback(async (statusId: number): Promise<StatusViewer[]> => {
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

    const removeMyStatus = useCallback(async (statusId: number) => {
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
    const contactOrderSnapshotRef = useRef<string[]>([]);

    const openContactViewer = useCallback((telephon: string) => {
        const group = feed.Contacts.find(g => g.Telephon === telephon);
        if (!group) return;
        contactOrderSnapshotRef.current = feed.Contacts.map(g => g.Telephon);
        const firstUnseen = group.Statuses.findIndex(s => !s.Viewed);
        setViewerKey({ mode: 'contact', telephon });
        setStatusIndex(firstUnseen === -1 ? 0 : firstUnseen);
    }, [feed.Contacts]);

    const closeViewer = useCallback(() => setViewerKey(null), []);

    const currentStatuses = useMemo((): StatusItem[] => {
        if (!viewerKey) return [];
        if (viewerKey.mode === 'mine') return feed.Mine;
        return feed.Contacts.find(g => g.Telephon === viewerKey.telephon)?.Statuses || [];
    }, [viewerKey, feed]);

    const currentOwner = useMemo((): StatusContactGroup | null => {
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
            if (!prevGroup) return;
            setViewerKey({ mode: 'contact', telephon: prevGroup.Telephon });
            setStatusIndex(Math.max(prevGroup.Statuses.length - 1, 0));
        }
    }, [viewerKey, statusIndex, feed.Contacts]);

    const hasUnseen = useMemo(() => feed.Contacts.some(g => !g.AllViewed), [feed.Contacts]);

    const value: StatusContextValue = {
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
