import { useCallback, useEffect, useRef, useState } from 'react';
import { latestRealMessageId } from '../lib/groupReceipts';

/** Ventana para agrupar acuses de entrega (se envía el id más alto por grupo). */
export const DELIVERED_DEBOUNCE_MS = 150;
/** Separación mínima entre acuses de lectura del mismo grupo. */
export const READ_THROTTLE_MS = 500;

interface UseGroupReceiptAcksArgs {
    selfTelephon: string | undefined;
    isConnected: boolean;
    /** Grupo abierto en pantalla (null si no hay o ya se salió de él). */
    openGroupId: number | null;
    openGroupMessages: ReadonlyArray<{ messageID: number | string }> | undefined;
    sendGroupDelivered: (groupID: number, messageID: number) => boolean;
    sendGroupRead: (groupID: number, upToMessageID: number) => boolean;
}

interface UseGroupReceiptAcksResult {
    /** Llamar por cada `group_chat` recibido: agenda el acuse de entrega. */
    noteIncomingGroupMessage: (groupID: number, messageID: number, senderTelephon: string) => void;
}

const isPositiveId = (n: number): boolean => Number.isFinite(n) && n > 0;

/**
 * Envía los acuses de grupo del cliente:
 *  - entrega: por cada mensaje ajeno recibido, agrupando al id más alto por
 *    grupo en una ventana corta (el servidor también da por entregado todo al
 *    conectar, así que perder un acuse offline es inofensivo);
 *  - lectura: mientras el grupo está abierto y la pestaña visible, hasta el
 *    último mensaje real, con throttle (primer envío inmediato, resto en cola).
 */
export function useGroupReceiptAcks({
    selfTelephon, isConnected, openGroupId, openGroupMessages, sendGroupDelivered, sendGroupRead,
}: UseGroupReceiptAcksArgs): UseGroupReceiptAcksResult {
    // Las funciones de envío y el usuario van por ref: sus identidades no deben
    // re-disparar los efectos ni reiniciar temporizadores.
    const senders = useRef({ sendGroupDelivered, sendGroupRead, selfTelephon });
    useEffect(() => { senders.current = { sendGroupDelivered, sendGroupRead, selfTelephon }; });

    // ── Entrega ────────────────────────────────────────────────────────────
    const pendingDelivered = useRef(new Map<number, number>());
    const deliveredTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const noteIncomingGroupMessage = useCallback((groupID: number, messageID: number, senderTelephon: string) => {
        if (!isPositiveId(groupID) || !isPositiveId(messageID)) return;
        if (senderTelephon === senders.current.selfTelephon) return;
        const current = pendingDelivered.current.get(groupID) ?? 0;
        if (messageID > current) pendingDelivered.current.set(groupID, messageID);
        if (deliveredTimer.current !== null) return;
        deliveredTimer.current = setTimeout(() => {
            deliveredTimer.current = null;
            const batch = [...pendingDelivered.current];
            pendingDelivered.current.clear();
            for (const [gid, id] of batch) senders.current.sendGroupDelivered(gid, id);
        }, DELIVERED_DEBOUNCE_MS);
    }, []);

    // ── Lectura ────────────────────────────────────────────────────────────
    const [visibilityTick, setVisibilityTick] = useState(0);
    useEffect(() => {
        const onChange = () => setVisibilityTick(t => t + 1);
        document.addEventListener('visibilitychange', onChange);
        return () => document.removeEventListener('visibilitychange', onChange);
    }, []);

    const latestId = latestRealMessageId(openGroupMessages);
    const readState = useRef({ groupId: null as number | null, target: 0, connected: false });
    const lastSentId = useRef(new Map<number, number>());
    const lastSentAt = useRef(new Map<number, number>());
    const readTimer = useRef<{ handle: ReturnType<typeof setTimeout>; groupId: number } | null>(null);

    useEffect(() => {
        readState.current = { groupId: openGroupId, target: latestId, connected: isConnected };

        const flush = () => {
            readTimer.current = null;
            const { groupId, target, connected } = readState.current;
            if (groupId === null || !connected || document.visibilityState !== 'visible') return;
            if (!isPositiveId(target) || target <= (lastSentId.current.get(groupId) ?? 0)) return;
            if (senders.current.sendGroupRead(groupId, target)) {
                lastSentId.current.set(groupId, target);
                lastSentAt.current.set(groupId, Date.now());
            }
        };

        // Cambio de grupo: el envío en cola del anterior ya no aplica.
        if (readTimer.current && readTimer.current.groupId !== openGroupId) {
            clearTimeout(readTimer.current.handle);
            readTimer.current = null;
        }
        if (openGroupId === null || readTimer.current) return;
        const wait = Math.max(0, (lastSentAt.current.get(openGroupId) ?? -Infinity) + READ_THROTTLE_MS - Date.now());
        if (wait === 0) flush();
        else readTimer.current = { handle: setTimeout(flush, wait), groupId: openGroupId };
    }, [openGroupId, latestId, isConnected, visibilityTick]);

    useEffect(() => () => {
        if (deliveredTimer.current !== null) clearTimeout(deliveredTimer.current);
        if (readTimer.current) clearTimeout(readTimer.current.handle);
    }, []);

    return { noteIncomingGroupMessage };
}
