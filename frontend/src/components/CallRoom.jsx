import React, { useRef, useEffect, useState } from 'react';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';
import api from '../api/axios';

/**
 * CallRoom Component
 * Interfaz profesional de videollamada/audio con gestión de estados y WebRTC.
 * 
 * @param {Object} props
 * @param {string} props.roomID - ID de la sala
 * @param {string} props.userID - Teléfono del usuario actual
 * @param {string} props.userName - Nombre del usuario actual
 * @param {string} props.callType - "video" | "audio"
 * @param {Function} props.onCallEnd - Callback al finalizar
 */
export default function CallRoom({ roomID, userID, userName, callType = 'video', onCallEnd }) {
    const containerRef = useRef(null);
    const zpRef = useRef(null);
    const [callStatus, setCallStatus] = useState('connecting'); // connecting, active, error
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (!containerRef.current || !roomID || !userID) return;
        if (zpRef.current) return;

        let cancelled = false;

        const startCall = async () => {
            try {
                console.log(`[CallRoom] Initializing ${callType} room: ${roomID}`);
                setCallStatus('connecting');

                // 0. Pre-solicitar permisos de media antes de iniciar ZegoCloud
                try {
                    const mediaConstraints = {
                        audio: true,
                        video: callType === 'video'
                    };
                    const preStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
                    // Liberar inmediatamente - solo necesitamos el permiso
                    preStream.getTracks().forEach(t => t.stop());
                    console.log('[CallRoom] Media permissions granted');
                } catch (mediaErr) {
                    console.warn('[CallRoom] Media permission issue:', mediaErr.name);
                    if (mediaErr.name === 'NotAllowedError' || mediaErr.name === 'PermissionDeniedError') {
                        setErrorMsg(
                            callType === 'video' 
                                ? 'Permiso de cámara y micrófono denegado. Habilita los permisos en tu navegador.'
                                : 'Permiso de micrófono denegado. Habilita el permiso en tu navegador.'
                        );
                        setCallStatus('error');
                        setTimeout(() => {
                            if (!cancelled && onCallEnd) onCallEnd();
                        }, 4000);
                        return;
                    }
                    if (mediaErr.name === 'NotFoundError') {
                        // Sin cámara disponible, intentar solo audio para video calls
                        if (callType === 'video') {
                            try {
                                const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
                                audioOnly.getTracks().forEach(t => t.stop());
                                console.log('[CallRoom] No camera found, continuing with audio only');
                            } catch {
                                setErrorMsg('No se encontró micrófono ni cámara en este dispositivo.');
                                setCallStatus('error');
                                setTimeout(() => {
                                    if (!cancelled && onCallEnd) onCallEnd();
                                }, 4000);
                                return;
                            }
                        }
                    }
                }

                // 1. Obtener token con retry logic simple
                let response;
                let attempts = 0;
                while (attempts < 3) {
                    try {
                        response = await api.get(`/api/v1/call/token/${roomID}`);
                        break;
                    } catch (e) {
                        attempts++;
                        if (attempts === 3) throw e;
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
                    }
                }

                const { token, appID } = response.data;
                if (cancelled) return;

                // 2. Generar Kit Token
                const kitToken = ZegoUIKitPrebuilt.generateKitTokenForProduction(
                    Number(appID),
                    token,
                    roomID,
                    userID,
                    userName || 'Usuario'
                );

                const zp = ZegoUIKitPrebuilt.create(kitToken);
                zpRef.current = zp;

                // 3. Unirse a la sala con configuración profesional
                zp.joinRoom({
                    container: containerRef.current,
                    scenario: {
                        mode: ZegoUIKitPrebuilt.OneONoneCall,
                    },
                    turnOnCameraWhenJoining: callType === 'video',
                    turnOnMicrophoneWhenJoining: true,
                    showPreJoinView: false,
                    showScreenSharingButton: false,
                    showLayoutButton: false,
                    showAudioVideoSettingsButton: true,
                    maxUsers: 2,
                    layout: 'Auto',
                    branding: {
                        logoURL: '/todos.svg'
                    },
                    onJoinRoom: () => {
                        console.log('[CallRoom] Joined successfully');
                        setCallStatus('active');
                    },
                    onLeaveRoom: () => {
                        console.log('[CallRoom] Left room');
                        if (onCallEnd) onCallEnd();
                    },
                    onUserLeave: () => {
                        console.log('[CallRoom] Remote user left');
                        if (onCallEnd) onCallEnd();
                    },
                });
            } catch (err) {
                console.error('[CallRoom] Critical error:', err);
                setErrorMsg('No se pudo establecer la conexión. Verifica tu internet.');
                setCallStatus('error');
                // Auto-cerrar después de 3 segundos en caso de error
                setTimeout(() => {
                    if (!cancelled && onCallEnd) onCallEnd();
                }, 3000);
            }
        };

        startCall();

        return () => {
            cancelled = true;
            if (zpRef.current) {
                try {
                    zpRef.current.destroy();
                } catch (e) {
                    console.warn('[CallRoom] Destroy error:', e);
                }
                zpRef.current = null;
            }
        };
    }, [roomID, userID, userName, callType, onCallEnd]);

    return (
        <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col overflow-hidden animate-in fade-in duration-500">
            {/* Capa de estado / Overlay */}
            {callStatus === 'connecting' && (
                <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center gap-6">
                    <div className="w-16 h-16 border-4 border-sky-500/20 border-t-sky-400 rounded-full animate-spin"></div>
                    <div className="text-center space-y-2">
                        <h2 className="text-white text-xl font-bold tracking-tight">Estableciendo conexión segura</h2>
                        <p className="text-slate-400 text-sm animate-pulse">Configurando cifrado de extremo a extremo...</p>
                    </div>
                </div>
            )}

            {callStatus === 'error' && (
                <div className="absolute inset-0 z-50 bg-red-950/30 backdrop-blur-xl flex flex-col items-center justify-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                    <p className="text-white font-bold text-lg">{errorMsg}</p>
                </div>
            )}

            {/* Header minimalista */}
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-slate-950/90 to-transparent px-6 py-4 z-10 flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse`}></div>
                    <div className="flex flex-col">
                        <span className="text-white text-xs font-black uppercase tracking-[0.2em]">
                            {callType === 'video' ? 'Videollamada' : 'Llamada de voz'}
                        </span>
                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                            {callStatus === 'active' ? 'Protegido con WebRTC' : 'Conectando...'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Contenedor de ZegoCloud UIKit */}
            <div 
                ref={containerRef} 
                className="flex-1 w-full h-full"
                style={{ filter: callStatus === 'active' ? 'none' : 'blur(10px)' }}
            ></div>

            {/* Botón de colgar flotante (Backup) */}
            <button 
                onClick={onCallEnd}
                className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 w-14 h-14 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-2xl shadow-red-500/30 transition-all sm:hidden"
                aria-label="Finalizar llamada"
            >
                <svg className="w-8 h-8 text-white rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
            </button>
        </div>
    );
}
