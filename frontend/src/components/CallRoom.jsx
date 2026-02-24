import React, { useRef, useEffect } from 'react';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';
import api from '../api/axios';

/**
 * CallRoom Component
 * Renderiza la interfaz de videollamada/audio usando ZegoCloud UIKit.
 * 
 * Props:
 *  - roomID: string - ID de la sala de llamada
 *  - userID: string - Teléfono del usuario actual
 *  - userName: string - Nombre del usuario actual
 *  - callType: "video" | "audio"
 *  - onCallEnd: () => void - Callback cuando termina la llamada
 */
export default function CallRoom({ roomID, userID, userName, callType = 'video', onCallEnd }) {
    const containerRef = useRef(null);
    const zpRef = useRef(null);

    useEffect(() => {
        if (!containerRef.current || !roomID || !userID) return;

        // Guard against React StrictMode double-invocation
        if (zpRef.current) return;

        let cancelled = false;

        const startCall = async () => {
            try {
                // Obtener token del backend (Token04 generado server-side)
                const { data } = await api.get(`/api/v1/call/token/${roomID}`);
                const { token, appID } = data;

                if (cancelled) return;

                // Usar generateKitTokenForProduction con el Token04 del servidor
                const kitToken = ZegoUIKitPrebuilt.generateKitTokenForProduction(
                    Number(appID),
                    token,
                    roomID,
                    userID,
                    userName || 'Usuario'
                );

                const zp = ZegoUIKitPrebuilt.create(kitToken);
                zpRef.current = zp;

                // Configurar y unirse a la sala
                // Usamos GroupCall porque manejamos la señalización nosotros
                // (OneONoneCall usa el sistema de invitación interno de Zego
                //  y reproduce un tono de espera que nunca para)
                zp.joinRoom({
                    container: containerRef.current,
                    scenario: {
                        mode: ZegoUIKitPrebuilt.GroupCall,
                    },
                    turnOnCameraWhenJoining: callType === 'video',
                    turnOnMicrophoneWhenJoining: true,
                    showPreJoinView: false,
                    showScreenSharingButton: false,
                    showLayoutButton: false,
                    maxUsers: 2,
                    layout: 'Auto',
                    onLeaveRoom: () => {
                        if (onCallEnd) onCallEnd();
                    },
                    onUserLeave: () => {
                        if (onCallEnd) onCallEnd();
                    },
                });
            } catch (err) {
                console.error('Error al iniciar llamada:', err);
                if (!cancelled && onCallEnd) onCallEnd();
            }
        };

        startCall();

        return () => {
            cancelled = true;
            // Limpiar al desmontar
            if (zpRef.current) {
                try {
                    zpRef.current.destroy();
                } catch (e) {
                    console.warn('Error al destruir ZegoUIKit:', e);
                }
                zpRef.current = null;
            }
        };
    }, [roomID, userID, userName, callType, onCallEnd]);

    return (
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
            {/* Header de la llamada */}
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-white text-sm font-medium">
                        {callType === 'video' ? 'Videollamada' : 'Llamada de voz'} en curso
                    </span>
                </div>
                <button
                    onClick={onCallEnd}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-full text-sm font-medium transition-colors"
                >
                    Colgar
                </button>
            </div>

            {/* Contenedor de ZegoCloud UIKit */}
            <div ref={containerRef} className="flex-1 w-full h-full" />
        </div>
    );
}
