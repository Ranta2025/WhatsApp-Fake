import React, { useState, useEffect } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { useAuth } from '../../../context/AuthContext';
import CallHistory from '../../../components/CallHistory';

const Sidebar = ({ onOpenProfile, onAddContact }) => {
    const { 
        contacts, onlineUsers, selected, setSelected, 
        sidebarView, setSidebarView, sidebarOpen, setSidebarOpen,
        lastSeenMap, avatarMap, isConnected, myAvatar, profile,
        messagesByChat, allChatGroups, logout
    } = useDashboard();
    const { user } = useAuth();
    // logout is proxied through DashboardContext from AuthContext

    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const isContactOnline = (telephon) => onlineUsers.has(telephon);

    const getUnreadCount = (contact) => {
        const messages = messagesByChat[contact.Number] || [];
        return messages.filter(m => m && m.SenderTelephon === contact.Number && m.Status !== 'visto').length;
    };

    const formatLastMessage = (msg) => {
        if (!msg) return 'Sin mensajes';
        let mediaType = msg.MediaType;
        const text = msg.Message || '';
        
        if (!mediaType && text.includes('/media/')) {
            if (text.includes('/audio/')) mediaType = 'audio';
            else if (text.includes('/images/')) mediaType = 'image';
            else if (text.includes('/videos/')) mediaType = 'video';
            else if (text.includes('/docs/')) mediaType = 'document';
        }
        
        if (mediaType === 'audio') return '🎵 Audio';
        if (mediaType === 'image') return '📷 Foto';
        if (mediaType === 'video') return '🎥 Video';
        if (mediaType === 'document') return '📄 Documento';
        
        // Ocultar URLs de media que no fueron detectadas por MediaType
        if (text.match(/^https?:\/\/.+\/media\/(images|audio|videos|docs)\//i)) {
            if (text.includes('/audio/')) return '🎵 Audio';
            if (text.includes('/images/')) return '📷 Foto';
            if (text.includes('/videos/')) return '🎥 Video';
            if (text.includes('/docs/')) return '📄 Documento';
            return '📎 Archivo adjunto';
        }
        if (text.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|mp4|webm|ogg|mp3|wav|pdf|doc|docx)(\?.*)?$/i)) {
            return '📎 Archivo adjunto';
        }
        
        return text;
    };

    return (
        <aside className={`
            bg-slate-900 border-r border-white/5 flex flex-col
            ${selected ? 'hidden lg:flex lg:w-80' : 'w-full lg:w-80'}
        `}>
            {/* Header del Sidebar (Perfil y Ajustes) */}
            <div className="p-4 bg-slate-900 flex items-center justify-between border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div 
                        className="relative w-10 h-10 rounded-full cursor-pointer group flex-shrink-0" 
                        title="Ver foto de perfil"
                        onClick={onOpenProfile}
                    >
                        {myAvatar ? (
                            <img src={myAvatar} alt="avatar" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                            <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-full flex items-center justify-center font-bold text-white">
                                {user?.username?.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    </div>
                    <div className="overflow-hidden">
                        <div className="font-semibold text-white truncate">{user?.username}</div>
                        <div className="text-xs text-slate-400 truncate">{profile?.Telephon || 'Cargando...'}</div>
                    </div>
                </div>
                <div className="flex gap-1">
                    <button 
                        onClick={onOpenProfile} 
                        className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-full transition-colors" 
                        title="Ajustes"
                        aria-label="Abrir ajustes de perfil"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </button>
                    <button 
                        onClick={logout} 
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-white/5 rounded-full transition-colors" 
                        title="Cerrar Sesión"
                        aria-label="Cerrar sesión de la aplicación"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    </button>
                </div>
            </div>

            {/* Barra de Búsqueda */}
            <div className="p-3 bg-slate-900">
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2 border border-transparent rounded-full leading-5 bg-slate-800 text-slate-300 placeholder-slate-500 focus:outline-none focus:bg-slate-800 focus:border-slate-700 focus:ring-0 sm:text-sm transition-colors"
                        placeholder={
                            sidebarView === 'chats' ? "Buscar chats..." :
                            sidebarView === 'calls' ? "Buscar llamadas..." :
                            "Buscar contactos..."
                        }
                        aria-label={
                            sidebarView === 'chats' ? "Buscar en tus chats activos" :
                            sidebarView === 'calls' ? "Buscar en tu historial de llamadas" :
                            "Buscar en tu lista de contactos"
                        }
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
                            aria-label="Limpiar búsqueda"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>
            
            {/* Navegación (Tabs) */}
            <nav className="flex px-2 bg-slate-900 border-b border-white/5" role="tablist">
                <button
                    role="tab"
                    aria-selected={sidebarView === 'chats'}
                    onClick={() => { setSidebarView('chats'); }}
                    className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${sidebarView === 'chats' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
                >
                    Chats
                </button>
                <button
                    role="tab"
                    aria-selected={sidebarView === 'calls'}
                    onClick={() => { setSidebarView('calls'); }}
                    className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${sidebarView === 'calls' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
                >
                    Llamadas
                </button>
                <button
                    role="tab"
                    aria-selected={sidebarView === 'contacts'}
                    onClick={() => { setSidebarView('contacts'); }}
                    className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${sidebarView === 'contacts' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
                >
                    Contactos
                </button>
            </nav>

            <div className="flex-1 overflow-y-auto p-4">
                {/* Vista de Chats Activos */}
                {sidebarView === 'chats' && (
                    <>
                        <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3 px-2">
                            {debouncedSearchQuery ? 'Resultados de búsqueda' : 'Chats Activos'}
                        </div>
                        <div className="space-y-1">
                            {(() => {
                                const shownNumbers = new Set();
                                const acceptedContacts = contacts.filter(c => c.Status === 'accepted').map(c => c.Number);
                                const allNumbers = Array.from(new Set([
                                    ...acceptedContacts,
                                    ...Object.keys(messagesByChat)
                                ]));

                                const filteredNumbers = allNumbers.filter(contactNumber => {
                                    if (!debouncedSearchQuery) return true;
                                    const contact = contacts.find(c => c.Number === contactNumber);
                                    const group = allChatGroups[contactNumber];
                                    const displayName = contact?.ContactName || group?.ContactName || group?.ContactUsername || '';
                                    return displayName.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) || contactNumber.includes(debouncedSearchQuery);
                                });

                                if (filteredNumbers.length === 0 && debouncedSearchQuery) {
                                    return <div className="text-center text-slate-500 py-10">No se encontraron chats</div>;
                                }

                                return filteredNumbers.map((contactNumber) => {
                                    if (shownNumbers.has(contactNumber)) return null;
                                    shownNumbers.add(contactNumber);
                                    
                                    const messages = messagesByChat[contactNumber] || [];
                                    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
                                    const contact = contacts.find(c => c.Number === contactNumber);
                                    const group = allChatGroups[contactNumber];
                                    const displayName = contact?.ContactName || group?.ContactName || group?.ContactUsername || contactNumber;
                                    const isUnknown = group && !group.IsContact;

                                    return (
                                        <button
                                            key={contactNumber}
                                            onClick={() => {
                                                const contactToSelect = contact || {
                                                    Number: contactNumber,
                                                    Username: group?.ContactUsername || contactNumber,
                                                    ContactName: group?.ContactName || null,
                                                    Status: 'unknown'
                                                };
                                                setSelected(contactToSelect);
                                            }}
                                            className={`relative w-full text-left px-3 py-2 hover:bg-slate-800 transition-colors flex items-center gap-3 ${selected?.Number === contactNumber ? 'bg-slate-800' : ''}`}
                                        >
                                            <div className="relative w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center text-lg font-medium text-white overflow-hidden flex-shrink-0">
                                                {avatarMap[contactNumber] ? (
                                                    <img src={avatarMap[contactNumber]} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    displayName?.charAt(0)?.toUpperCase()
                                                )}
                                                {isContactOnline(contactNumber) && (
                                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900"></div>
                                                )}
                                            </div>
                                            <div className="flex-1 overflow-hidden border-b border-white/5 pb-3 pt-1">
                                                <div className="flex justify-between items-baseline mb-0.5">
                                                    <div className="font-semibold text-slate-100 truncate flex items-center gap-1">
                                                        {displayName}
                                                        {isUnknown && <span className="text-[9px] bg-yellow-500/20 text-yellow-300 px-1 rounded">?</span>}
                                                    </div>
                                                    {lastMessage?.Time && (
                                                        <div className="text-xs text-slate-500 flex-shrink-0 ml-2">
                                                            {new Date(lastMessage.Time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-sm text-slate-400 truncate">
                                                    {formatLastMessage(lastMessage)}
                                                </div>
                                            </div>
                                            {getUnreadCount(contact || {Number: contactNumber}) > 0 && (
                                                <span className="absolute top-1/2 -translate-y-1/2 right-4 bg-indigo-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                                    {getUnreadCount(contact || {Number: contactNumber})}
                                                </span>
                                            )}
                                        </button>
                                    );
                                });
                            })()}
                        </div>
                    </>
                )}

                {/* Vista de Llamadas */}
                {sidebarView === 'calls' && (
                    <CallHistory
                        contacts={contacts}
                        searchQuery={debouncedSearchQuery}
                        onSelectContact={(contact) => {
                            setSelected(contact);
                        }}
                    />
                )}

                {/* Vista de Contactos */}
                {sidebarView === 'contacts' && (
                    <>
                        <div className="flex justify-between items-center mb-3 px-2">
                            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                                {debouncedSearchQuery ? 'Resultados de búsqueda' : 'Mis Contactos'}
                            </div>
                            <button
                                onClick={onAddContact}
                                className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-full transition-colors font-medium"
                            >
                                + Agregar
                            </button>
                        </div>
                        <div className="space-y-1">
                            {(() => {
                                const filteredContacts = contacts.filter(c => {
                                    if (c.Status !== 'accepted') return false;
                                    if (!debouncedSearchQuery) return true;
                                    const query = debouncedSearchQuery.toLowerCase();
                                    return (c.ContactName || '').toLowerCase().includes(query) || 
                                           (c.Username || '').toLowerCase().includes(query) || 
                                           c.Number.includes(query);
                                });

                                if (filteredContacts.length === 0) return <div className="text-center text-slate-500 py-10">No se encontraron contactos</div>;

                                return filteredContacts.map((c) => (
                                    <button
                                        key={c.Number}
                                        onClick={() => {
                                            setSelected(c);
                                        }}
                                        className={`w-full text-left px-3 py-2 hover:bg-slate-800 transition-colors flex items-center gap-3 ${selected?.Number === c.Number ? 'bg-slate-800' : ''}`}
                                    >
                                        <div className="relative w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center text-lg font-medium text-white overflow-hidden flex-shrink-0">
                                            {avatarMap[c.Number] ? (
                                                <img src={avatarMap[c.Number]} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                (c.ContactName || c.Username)?.charAt(0)?.toUpperCase()
                                            )}
                                            {isContactOnline(c.Number) && (
                                                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900"></div>
                                            )}
                                        </div>
                                        <div className="flex-1 overflow-hidden border-b border-white/5 pb-3 pt-1">
                                            <div className="font-semibold text-slate-100 truncate">{c.ContactName || c.Username}</div>
                                            <div className="text-sm text-slate-400 truncate">
                                                {isContactOnline(c.Number) ? 'En línea' : (lastSeenMap[c.Number] ? `Últ. vez: ${new Date(lastSeenMap[c.Number]).toLocaleTimeString()}` : c.Number)}
                                            </div>
                                        </div>
                                    </button>
                                ));
                            })()}
                        </div>
                    </>
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
