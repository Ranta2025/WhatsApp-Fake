import { useCallback, useEffect, useRef } from 'react';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { useDashboard } from '../context/DashboardContext';

/**
 * useCalls Hook
 * Maneja la lógica de señalización de llamadas y videollamadas con WebRTC.
 * Implementa reintentos, timeouts y gestión de estados.
 */
export const useCalls = () => {
    const { on, off, sendCallOffer, sendCallAccept, sendCallReject, sendCallEnd, sendGroupCallOffer, sendGroupCallEnd } = useWebSocket();
    const { selected, selectedGroup, callState, setCallState, incomingCall, setIncomingCall, isConnected, addToast } = useDashboard();
    
    const callTimeoutRef = useRef(null);
    const retryCountRef = useRef(0);
    const MAX_RETRIES = 3;

    /**
     * Limpia el timeout de la llamada actual.
     */
    const clearCallTimeout = useCallback(() => {
        if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
        }
    }, []);

    useEffect(() => {
        const handleIncomingCall = (payload) => {
            console.log('[CALL] Incoming call from:', payload.from);
            if (callState) {
                console.log('[CALL] Busy, rejecting incoming call');
                sendCallReject(payload.from, payload.roomID);
                return;
            }
            setIncomingCall(payload);
        };

        const handleCallAccepted = () => {
            console.log('[CALL] Call accepted');
            clearCallTimeout();
            retryCountRef.current = 0;
            setCallState(prev => prev ? { ...prev, status: 'active' } : prev);
        };

        const handleCallRejected = () => {
            console.log('[CALL] Call rejected');
            clearCallTimeout();
            setCallState(null);
            addToast({ type: 'info', message: 'Llamada rechazada' });
        };

        const handleCallEnded = () => {
            console.log('[CALL] Call ended by remote');
            clearCallTimeout();
            setCallState(null);
        };

        const handleCallUnavailable = () => {
            console.log('[CALL] Remote unavailable');
            clearCallTimeout();
            
            if (retryCountRef.current < MAX_RETRIES && callState?.role === 'caller') {
                const delay = Math.pow(2, retryCountRef.current) * 1000;
                retryCountRef.current++;
                console.log(`[CALL] Retrying in ${delay}ms (Attempt ${retryCountRef.current}/${MAX_RETRIES})`);
                
                setTimeout(() => {
                    if (callState) {
                        sendCallOffer(callState.remoteTelephon, callState.roomID, callState.callType);
                    }
                }, delay);
            } else {
                setCallState(null);
                addToast({ type: 'error', message: 'El usuario no está disponible' });
            }
        };

        on('incoming_call', handleIncomingCall);
        on('call_accepted', handleCallAccepted);
        on('call_rejected', handleCallRejected);
        on('call_ended', handleCallEnded);
        on('call_unavailable', handleCallUnavailable);

        return () => {
            off('incoming_call', handleIncomingCall);
            off('call_accepted', handleCallAccepted);
            off('call_rejected', handleCallRejected);
            off('call_ended', handleCallEnded);
            off('call_unavailable', handleCallUnavailable);
            clearCallTimeout();
        };
    }, [on, off, callState, sendCallReject, sendCallOffer, setCallState, setIncomingCall, clearCallTimeout, addToast]);

    /**
     * Inicia una nueva llamada.
     * @param {string} callType - 'video' o 'audio'
     */
    const handleStartCall = useCallback((callType = 'video') => {
        if (!selected) return;
        if (!isConnected) {
            addToast({ type: 'error', message: 'No hay conexión con el servidor' });
            return;
        }

        const roomID = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log(`[CALL] Starting ${callType} call. Room: ${roomID}`);
        
        setCallState({
            roomID,
            remoteTelephon: selected.Number,
            remoteName: selected.ContactName || selected.Username,
            callType,
            role: 'caller',
            status: 'ringing'
        });

        sendCallOffer(selected.Number, roomID, callType);

        // Timeout de 30 segundos para la señalización
        clearCallTimeout();
        callTimeoutRef.current = setTimeout(() => {
            console.log('[CALL] Call signaling timeout');
            setCallState(null);
            addToast({ type: 'error', message: 'La llamada no pudo establecerse (Timeout)' });
        }, 30000);
        
    }, [selected, isConnected, sendCallOffer, setCallState, addToast, clearCallTimeout]);

    /**
     * Acepta una llamada entrante.
     */
    const handleAcceptIncomingCall = useCallback(() => {
        if (!incomingCall) return;
        console.log('[CALL] Accepting incoming call');
        sendCallAccept(incomingCall.from, incomingCall.roomID);
        setCallState({
            roomID: incomingCall.roomID,
            remoteTelephon: incomingCall.from,
            remoteName: incomingCall.groupName || incomingCall.username,
            callType: incomingCall.callType,
            role: 'receiver',
            status: 'active',
            isGroupCall: !!incomingCall.groupID,
            groupID: incomingCall.groupID,
            groupName: incomingCall.groupName,
        });
        setIncomingCall(null);
    }, [incomingCall, sendCallAccept, setCallState, setIncomingCall]);

    /**
     * Rechaza una llamada entrante.
     */
    const handleRejectIncomingCall = useCallback(() => {
        if (!incomingCall) return;
        console.log('[CALL] Rejecting incoming call');
        sendCallReject(incomingCall.from, incomingCall.roomID);
        setIncomingCall(null);
    }, [incomingCall, sendCallReject, setIncomingCall]);

    /**
     * Finaliza la llamada actual (1:1 o grupal).
     */
    const handleEndCall = useCallback(() => {
        if (callState) {
            console.log('[CALL] Ending call manually');
            if (callState.isGroupCall) {
                sendGroupCallEnd(callState.groupID, callState.roomID);
            } else {
                sendCallEnd(callState.remoteTelephon, callState.roomID);
            }
        }
        clearCallTimeout();
        setCallState(null);
    }, [callState, sendCallEnd, sendGroupCallEnd, setCallState, clearCallTimeout]);

    /**
     * Inicia una llamada grupal (llama a todos los miembros del grupo).
     * El caller entra directamente a la sala de ZegoCloud.
     */
    const handleStartGroupCall = useCallback((callType = 'video') => {
        if (!selectedGroup) return;
        if (!isConnected) {
            addToast({ type: 'error', message: 'No hay conexión con el servidor' });
            return;
        }
        if (callState) {
            addToast({ type: 'error', message: 'Ya tienes una llamada activa' });
            return;
        }

        const roomID = `group_call_${selectedGroup.ID}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log(`[CALL] Starting ${callType} group call. Room: ${roomID}`);

        sendGroupCallOffer(selectedGroup.ID, roomID, callType);

        // Para llamadas grupales el caller entra directamente (status 'active')
        setCallState({
            roomID,
            remoteName: selectedGroup.Name,
            callType,
            role: 'caller',
            status: 'active',
            isGroupCall: true,
            groupID: selectedGroup.ID,
            groupName: selectedGroup.Name,
        });
    }, [selectedGroup, isConnected, callState, sendGroupCallOffer, setCallState, addToast]);

    return { 
        callState, 
        incomingCall, 
        handleStartCall, 
        handleStartGroupCall,
        handleAcceptIncomingCall, 
        handleRejectIncomingCall, 
        handleEndCall 
    };
};
