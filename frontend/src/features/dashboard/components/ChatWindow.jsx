import React, { useState, useEffect } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { MessagingProvider } from '../hooks/useMessaging';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import AddContactModal from './AddContactModal';
import api from '../../../api/axios';

const ChatWindow = ({ onShowContactDetails, onStartCall }) => {
    const { 
        selected, setSelected, isConnected, avatarMap, onlineUsers, typingUsers, 
        lastSeenMap, setMessagesByChat,
        messagesByChat, fetchChatMessages, profile, allChatGroups, markAsRead
    } = useDashboard();
    const [showAddContactModal, setShowAddContactModal] = useState(false);

    // Cargar mensajes al seleccionar un contacto si aún no están en cache
    useEffect(() => {
        if (selected?.Number && !messagesByChat[selected.Number]) {
            fetchChatMessages(selected.Number);
        }
    }, [selected?.Number, fetchChatMessages]);

    // Marcar mensajes como "visto" cuando se abre un chat con mensajes no leídos
    useEffect(() => {
        if (!selected?.Number || !isConnected || !profile?.Telephon) return;
        const msgs = messagesByChat[selected.Number];
        if (!msgs || msgs.length === 0) return;
        // Si hay mensajes recibidos (de ese contacto) sin estado "visto", marcar como leídos
        const hasUnread = msgs.some(
            m => m.SenderTelephon === selected.Number && m.Status !== 'visto'
        );
        if (hasUnread) {
            markAsRead(selected.Number);
        }
    }, [selected?.Number, messagesByChat, isConnected, profile?.Telephon, markAsRead]);

    if (!selected) {
        // En móvil el sidebar ocupa toda la pantalla, así que no mostramos nada aquí.
        // En desktop mostramos la pantalla de bienvenida.
        return (
            <div className="hidden lg:flex flex-1 flex-col min-h-0 min-w-0 bg-slate-950 relative">
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center overflow-y-auto"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23334155' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
                    }}
                >
                    <div className="w-32 h-32 bg-slate-900 rounded-full flex items-center justify-center mb-8 shadow-lg border border-white/5">
                        <img src="/todos.svg" alt="todos" className="w-16 h-16 opacity-50 grayscale" />
                    </div>
                    <h2 className="text-3xl font-semibold mb-3 text-slate-200">Bienvenido a todos</h2>
                    <p className="max-w-md text-slate-500 text-lg">
                        Selecciona un chat para comenzar a enviar mensajes.
                    </p>
                    <div className="mt-8 flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-full border border-white/5">
                        <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                        <span className={`text-sm font-medium ${isConnected ? 'text-slate-300' : 'text-red-400'}`}>
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
        if (!window.confirm(`¿Seguro que quieres vaciar el chat con ${selected.ContactName || selected.Username}?`)) return;
        try {
            await api.delete(`/api/v1/chat/${selected.Number}`);
            setMessagesByChat(prev => ({
                ...prev,
                [selected.Number]: []
            }));
        } catch (err) {
            console.error('Error al vaciar chat:', err);
            alert('Error al vaciar el chat');
        }
    };

    const handleCallClick = (type) => {
        if (!isConnected) {
            alert('No se puede iniciar la llamada: El servidor no está conectado.');
            return;
        }
        if (!selected) return;
        if (onStartCall) {
            onStartCall(type);
        }
    };

    return (
        <MessagingProvider>
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-slate-950">
            {/* Header fijo */}
            <div className="flex-shrink-0 px-4 py-3 border-b border-white/5 bg-slate-900/95 backdrop-blur-md flex flex-col gap-2 z-10 shadow-sm">
                <div className="flex items-center gap-3">
                    {/* Botón atrás para móvil (estilo WhatsApp) */}
                    <button
                        onClick={() => setSelected(null)}
                        className="lg:hidden p-2 hover:bg-white/10 rounded-full transition-colors flex-shrink-0 text-slate-400"
                        aria-label="Volver a chats"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    
                    <div 
                        className="flex items-center gap-3 cursor-pointer hover:bg-white/5 p-1.5 rounded-xl transition-colors flex-1 min-w-0"
                        onClick={onShowContactDetails}
                    >
                        <div className="relative w-10 h-10 sm:w-12 sm:h-12 bg-slate-700 rounded-full flex items-center justify-center shadow-sm overflow-hidden flex-shrink-0">
                            {avatarMap[selected.Number] ? (
                                <img src={avatarMap[selected.Number]} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-lg font-medium text-white">
                                    {(selected.ContactName || selected.Username)?.charAt(0)?.toUpperCase()}
                                </span>
                            )}
                            {isContactOnline(selected.Number) && (
                                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900"></div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-semibold text-base truncate text-slate-100">{selected.ContactName || selected.Username}</div>
                            <div className="text-sm text-slate-400 truncate">
                                {isContactTyping(selected.Number) ? (
                                    <span className="text-indigo-400 italic font-medium animate-pulse">escribiendo...</span>
                                ) : isContactOnline(selected.Number) ? (
                                    <span className="text-green-400 font-medium">en línea</span>
                                ) : (
                                    <span>{getLastSeenText(selected.Number) || selected.Number}</span>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    {/* Botones de acción del chat */}
                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                        <button
                            onClick={() => handleCallClick('audio')}
                            disabled={!isConnected}
                            className="p-2 hover:bg-white/10 rounded-full transition-all text-slate-400 hover:text-indigo-400 disabled:opacity-30"
                            title="Llamada de voz"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                        </button>
                        <button
                            onClick={() => handleCallClick('video')}
                            disabled={!isConnected}
                            className="p-2 hover:bg-white/10 rounded-full transition-all text-slate-400 hover:text-purple-400 disabled:opacity-30"
                            title="Videollamada"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        </button>
                        <div className="w-px h-6 bg-white/10 mx-1"></div>
                        <button
                            onClick={handleClearChat}
                            className="p-2.5 hover:bg-red-500/20 rounded-full transition-all text-slate-400 hover:text-red-400"
                            title="Vaciar Chat"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* Banner "Agregar / Bloquear" para contactos desconocidos */}
            {selected && allChatGroups[selected.Number] && !allChatGroups[selected.Number].IsContact && (
                <div className="flex-shrink-0 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between gap-3">
                    <span className="text-sm text-amber-300">
                        <strong>{selected.Username || selected.Number}</strong> no está en tus contactos
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowAddContactModal(true)}
                            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                        >
                            Agregar
                        </button>
                        <button
                            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-red-600/80 hover:bg-red-500 text-white transition-colors"
                            title="Bloquear contacto"
                        >
                            Bloquear
                        </button>
                    </div>
                </div>
            )}

            {/* Lista de Mensajes */}
            <MessageList />

            {/* Input de Mensajes */}
            <MessageInput />

            {/* Modal para agregar contacto desconocido */}
            <AddContactModal
                isOpen={showAddContactModal}
                onClose={() => setShowAddContactModal(false)}
                initialNumber={selected?.Number || ''}
                initialName={allChatGroups[selected?.Number]?.ContactUsername || ''}
            />
        </div>
        </MessagingProvider>
    );
};

export default ChatWindow;
