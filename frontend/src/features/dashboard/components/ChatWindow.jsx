import React, { useState, useEffect } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { MessagingProvider, useMessaging } from '../hooks/useMessaging';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import AddContactModal from './AddContactModal';
import ForwardMessageModal from './ForwardMessageModal';
import api from '../../../api/axios';

const ForwardMessageModalWrapper = () => {
    const { forwardingMessage, setForwardingMessage, executeForward } = useMessaging();
    return (
        <ForwardMessageModal
            isOpen={!!forwardingMessage}
            onClose={() => setForwardingMessage(null)}
            message={forwardingMessage}
            onForward={(targetNumbers) => executeForward(targetNumbers)}
        />
    );
};

const ChatWindow = ({ onShowContactDetails, onStartCall }) => {
    const { 
        selected, setSelected, isConnected, avatarMap, onlineUsers, typingUsers, 
        lastSeenMap, setMessagesByChat,
        messagesByChat, fetchChatMessages, profile, allChatGroups, markAsRead
    } = useDashboard();
    const [showAddContactModal, setShowAddContactModal] = useState(false);

    useEffect(() => {
        if (selected?.Number && !messagesByChat[selected.Number]) {
            fetchChatMessages(selected.Number);
        }
    }, [selected?.Number, fetchChatMessages]);

    useEffect(() => {
        if (!selected?.Number || !isConnected || !profile?.Telephon) return;
        const msgs = messagesByChat[selected.Number];
        if (!msgs || msgs.length === 0) return;
        const hasUnread = msgs.some(
            m => m.SenderTelephon === selected.Number && m.Status !== 'visto'
        );
        if (hasUnread) {
            markAsRead(selected.Number);
        }
    }, [selected?.Number, messagesByChat, isConnected, profile?.Telephon, markAsRead]);

    if (!selected) {
        return (
            <div className="hidden lg:flex flex-1 flex-col min-h-0 min-w-0 bg-[#0B1120] relative">
                <div className="flex-1 flex flex-col items-center justify-center text-slate-600 p-8 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-6">
                        <img src="/todos.svg" alt="todos" className="w-10 h-10 opacity-40" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2 text-slate-400">Tus conversaciones empiezan aqui</h2>
                    <p className="max-w-sm text-slate-600 text-sm leading-relaxed">
                        Elige un chat para retomar la conversacion o empezar una nueva.
                    </p>
                    <div className="mt-6 flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <span className="text-xs font-medium text-slate-600">
                            {isConnected ? 'Conectado' : 'Desconectado'}
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    const isContactOnline = (number) => onlineUsers.has(number);
    const isContactTyping = (number) => typingUsers.has(number);
    
    const getLastSeenText = (number) => {
        const lastSeen = lastSeenMap[number];
        if (!lastSeen) return null;
        const date = new Date(lastSeen);
        const now = new Date();
        const diff = now - date;
        if (diff < 60000) return 'hace un momento';
        if (diff < 3600000) return `hace ${Math.floor(diff / 60000)} min`;
        if (date.toDateString() === now.toDateString()) {
            return `hoy a las ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
        return `el ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };

    const handleClearChat = async () => {
        if (!selected) return;
        if (!window.confirm(`Quieres vaciar la conversacion con ${selected.ContactName || selected.Username}?`)) return;
        try {
            await api.delete(`/api/v1/chat/${selected.Number}`);
            setMessagesByChat(prev => ({
                ...prev,
                [selected.Number]: []
            }));
        } catch (err) {
            console.error('Error al vaciar chat:', err);
            alert('No pudimos vaciar la conversacion en este momento.');
        }
    };

    const handleCallClick = (type) => {
        if (!isConnected) {
            alert('Revisa tu conexion e intentalo de nuevo.');
            return;
        }
        if (!selected) return;
        if (onStartCall) {
            onStartCall(type);
        }
    };

    return (
        <MessagingProvider>
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-[#0B1120]">
            {/* Header */}
            <div className="flex-shrink-0 h-16 px-4 border-b border-white/[0.04] bg-[#0B1120]/95 backdrop-blur-md flex items-center gap-3 z-10">
                <button
                    onClick={() => setSelected(null)}
                    className="lg:hidden p-2 hover:bg-white/[0.04] rounded-lg transition-colors flex-shrink-0 text-slate-400"
                    aria-label="Volver a chats"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                
                <div 
                    className="flex items-center gap-3 cursor-pointer hover:bg-white/[0.03] p-1.5 rounded-xl transition-colors flex-1 min-w-0"
                    onClick={onShowContactDetails}
                >
                    <div className={`relative w-10 h-10 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 bg-gradient-to-br from-sky-500 to-indigo-600 ${isContactOnline(selected.Number) ? 'ring-2 ring-emerald-500/50 ring-offset-2 ring-offset-[#0B1120]' : ''}`}>
                        {avatarMap[selected.Number] ? (
                            <img src={avatarMap[selected.Number]} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-sm font-medium text-white">
                                {(selected.ContactName || selected.Username)?.charAt(0)?.toUpperCase()}
                            </span>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-white truncate">{selected.ContactName || selected.Username}</div>
                        <div className="text-xs text-slate-500 truncate">
                            {isContactTyping(selected.Number) ? (
                                <span className="text-sky-400 font-medium animate-pulse">escribiendo...</span>
                            ) : isContactOnline(selected.Number) ? (
                                <span className="text-emerald-400 font-medium">en linea</span>
                            ) : (
                                <span>{getLastSeenText(selected.Number) || selected.Number}</span>
                            )}
                        </div>
                    </div>
                </div>
                
                {/* Botones de accion */}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                        onClick={() => handleCallClick('audio')}
                        disabled={!isConnected}
                        className="p-2.5 rounded-lg hover:bg-white/[0.04] text-slate-400 hover:text-white transition disabled:opacity-30"
                        title="Llamada de voz"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                    </button>
                    <button
                        onClick={() => handleCallClick('video')}
                        disabled={!isConnected}
                        className="p-2.5 rounded-lg hover:bg-white/[0.04] text-slate-400 hover:text-white transition disabled:opacity-30"
                        title="Videollamada"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </button>
                    <button
                        onClick={handleClearChat}
                        className="p-2.5 rounded-lg hover:bg-white/[0.04] text-slate-400 hover:text-white transition"
                        title="Vaciar Chat"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Banner para contactos desconocidos */}
            {selected && allChatGroups[selected.Number] && !allChatGroups[selected.Number].IsContact && (
                <div className="flex-shrink-0 px-4 py-2.5 bg-amber-500/5 border-b border-amber-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <span className="text-sm text-amber-200/80 leading-relaxed">
                        <strong>{selected.Username || selected.Number}</strong> no esta en tus contactos
                    </span>
                    <div className="flex items-center gap-2 self-stretch sm:self-auto w-full sm:w-auto">
                        <button
                            onClick={() => setShowAddContactModal(true)}
                            className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-500 hover:bg-sky-400 text-white transition-colors"
                        >
                            Agregar
                        </button>
                    </div>
                </div>
            )}

            <MessageList />
            <MessageInput />

            <AddContactModal
                isOpen={showAddContactModal}
                onClose={() => setShowAddContactModal(false)}
                initialNumber={selected?.Number || ''}
                initialName={allChatGroups[selected?.Number]?.ContactUsername || ''}
            />

            <ForwardMessageModalWrapper />
        </div>
        </MessagingProvider>
    );
};

export default ChatWindow;
