import React, { useState, useEffect, useRef } from 'react';
import { DashboardProvider, useDashboard } from './context/DashboardContext';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import GroupChatWindow from './components/GroupChatWindow';
import ProfileModal from './components/ProfileModal';
import ContactDetails from './components/ContactDetails';
import NotificationBanner from './components/NotificationBanner';
import AddContactModal from './components/AddContactModal';
import CreateGroupModal from './components/CreateGroupModal';
import PermissionsDialog from '../../components/PermissionsDialog';
import IncomingCall from '../../components/IncomingCall';
import CallRoom from '../../components/CallRoom';
import LoadingScreen from '../../components/LoadingScreen';
import { usePresence } from './hooks/usePresence';
import { useCalls } from './hooks/useCalls';

/**
 * CallingOverlay - Muestra el estado "Llamando..." mientras espera que el receptor conteste.
 * Reproduce un tono de llamada saliente y muestra el nombre/número del contacto.
 */
const CallingOverlay = ({ callState, onEndCall }) => {
    const audioRef = useRef(null);
    const [elapsed, setElapsed] = useState(0);

    // Reproducir tono de llamada saliente (beep sintetizado)
    useEffect(() => {
        let audioCtx;
        let oscillator;
        let gainNode;
        let intervalId;
        let elapsedTimer;

        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            gainNode = audioCtx.createGain();
            gainNode.connect(audioCtx.destination);
            gainNode.gain.value = 0;

            // Generar tono de llamada: 440Hz por 1s, silencio 3s, repetir
            const playRingTone = () => {
                oscillator = audioCtx.createOscillator();
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
                oscillator.connect(gainNode);

                // Fade in
                gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
                gainNode.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.05);

                // Sustain then fade out
                gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime + 0.9);
                gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.0);

                oscillator.start(audioCtx.currentTime);
                oscillator.stop(audioCtx.currentTime + 1.0);
            };

            playRingTone();
            intervalId = setInterval(playRingTone, 4000);

            // Contador de tiempo transcurrido
            elapsedTimer = setInterval(() => setElapsed(prev => prev + 1), 1000);
        } catch (e) {
            console.warn('[CallingOverlay] Audio API not available:', e);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
            if (elapsedTimer) clearInterval(elapsedTimer);
            if (audioCtx) {
                try { audioCtx.close(); } catch (e) { /* ignore */ }
            }
        };
    }, []);

    const formatTime = (s) => {
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed inset-0 z-[9998] bg-black/80 backdrop-blur-md flex items-center justify-center">
            <div className="bg-gradient-to-b from-gray-900 to-gray-800 rounded-[2rem] p-10 w-80 text-center shadow-2xl border border-white/10 relative overflow-hidden">
                {/* Animación de ondas */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-40 h-40 border border-indigo-500/20 rounded-full animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                    <div className="absolute w-32 h-32 border border-indigo-500/15 rounded-full animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite_0.5s]"></div>
                </div>
                <div className="relative z-10">
                    {/* Avatar / Icono */}
                    <div className="w-24 h-24 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-full mx-auto mb-6 flex items-center justify-center shadow-2xl shadow-indigo-500/30">
                        <span className="text-white text-3xl font-bold">
                            {(callState.remoteName || callState.remoteTelephon)?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                    </div>

                    {/* Estado */}
                    <h2 className="text-xl font-bold text-white mb-1">Llamando...</h2>
                    <p className="text-indigo-300 font-medium mb-1">
                        {callState.remoteName || callState.remoteTelephon}
                    </p>
                    <p className="text-slate-500 text-sm mb-2">
                        {callState.callType === 'video' ? 'Videollamada' : 'Llamada de voz'}
                    </p>
                    <p className="text-slate-600 text-xs font-mono mb-8">{formatTime(elapsed)}</p>

                    {/* Botón colgar */}
                    <button
                        onClick={onEndCall}
                        className="w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full mx-auto flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 shadow-lg shadow-red-500/25"
                        aria-label="Cancelar llamada"
                    >
                        <svg className="w-8 h-8 text-white rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

const DashboardContent = () => {
    // Activate presence and calls hooks
    usePresence();
    const { 
        callState, incomingCall, handleAcceptIncomingCall, 
        handleRejectIncomingCall, handleEndCall, handleStartCall, handleStartGroupCall
    } = useCalls();

    const { 
        profile, user, isConnected, notifPermission, setNotifPermission, 
        requestNotificationPermission,
        selectedGroup,
        dataReady, loadingSteps,
    } = useDashboard();

    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showContactDetails, setShowContactDetails] = useState(false);
    const [showAddContactModal, setShowAddContactModal] = useState(false);
    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
    const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
    const [viewImage, setViewImage] = useState(null);

    // Keep loading screen mounted for fade-out transition
    const [showLoader, setShowLoader] = useState(true);
    const [loaderFading, setLoaderFading] = useState(false);
    useEffect(() => {
        if (dataReady && showLoader) {
            setLoaderFading(true);
            const t = setTimeout(() => setShowLoader(false), 500);
            return () => clearTimeout(t);
        }
    }, [dataReady, showLoader]);

    return (
        <div className="flex h-screen bg-slate-950 text-white overflow-hidden relative" style={{height: '100dvh'}}>
            {/* Pantalla de carga moderna */}
            {showLoader && (
                <div
                    className="absolute inset-0 z-[99999] transition-opacity duration-500"
                    style={{ opacity: loaderFading ? 0 : 1, pointerEvents: loaderFading ? 'none' : 'auto' }}
                >
                    <LoadingScreen loadingSteps={loadingSteps} />
                </div>
            )}

            {/* Main UI */}
            <Sidebar 
                onOpenProfile={() => setShowProfileModal(true)} 
                onAddContact={() => setShowAddContactModal(true)}
                onCreateGroup={() => setShowCreateGroupModal(true)}
            />
            
            {/* Render the group chat window when a group is selected, 1-to-1 chat otherwise */}
            {selectedGroup ? (
                <GroupChatWindow onStartGroupCall={handleStartGroupCall} />
            ) : (
                <ChatWindow 
                    onShowContactDetails={() => setShowContactDetails(true)} 
                    onStartCall={handleStartCall}
                />
            )}

            {/* Panels and Modals */}
            <ContactDetails 
                isOpen={showContactDetails} 
                onClose={() => setShowContactDetails(false)} 
                onStartCall={handleStartCall}
                setViewImage={setViewImage}
            />

            <ProfileModal 
                isOpen={showProfileModal} 
                onClose={() => setShowProfileModal(false)} 
            />

            <AddContactModal 
                isOpen={showAddContactModal} 
                onClose={() => setShowAddContactModal(false)} 
            />

            <CreateGroupModal
                isOpen={showCreateGroupModal}
                onClose={() => setShowCreateGroupModal(false)}
            />

            <NotificationBanner />

            {/* Modal para ver imagen en grande */}
            {viewImage && (
                <div 
                    className="fixed inset-0 bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300"
                    onClick={() => setViewImage(null)}
                >
                    <div className="relative max-w-5xl max-h-[90vh] w-full h-full flex items-center justify-center p-4">
                        <button 
                            className="absolute -top-12 right-0 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-full p-3 transition-all active:scale-90"
                            onClick={(e) => {
                                e.stopPropagation();
                                setViewImage(null);
                            }}
                            title="Cerrar imagen"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                        <img 
                            src={viewImage} 
                            alt="Vista previa" 
                            className="max-w-full max-h-full object-contain rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in zoom-in duration-300"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}

            {/* ========== Diálogo de Permisos ========== */}
            {showPermissionsDialog && (
                <PermissionsDialog onDone={() => {
                    setShowPermissionsDialog(false);
                    // Actualizar permisos de notificación si es necesario
                }} />
            )}

            {/* Sistema de llamadas */}
            {incomingCall && (
                <IncomingCall 
                    callerName={incomingCall.username} 
                    callerNumber={incomingCall.from} 
                    callType={incomingCall.callType}
                    groupName={incomingCall.groupName}
                    onAccept={handleAcceptIncomingCall}
                    onReject={handleRejectIncomingCall}
                />
            )}

            {callState && callState.status === 'active' && (
                <CallRoom 
                    roomID={callState.roomID}
                    userID={user?.telephon || profile?.Telephon}
                    userName={user?.username || profile?.Username}
                    callType={callState.callType}
                    onCallEnd={handleEndCall}
                />
            )}

            {callState && callState.status === 'ringing' && callState.role === 'caller' && (
                <CallingOverlay 
                    callState={callState} 
                    onEndCall={handleEndCall} 
                />
            )}
        </div>
    );
};

export const DashboardFeature = () => {
    return (
        <DashboardProvider>
            <DashboardContent />
        </DashboardProvider>
    );
};

export default DashboardFeature;
