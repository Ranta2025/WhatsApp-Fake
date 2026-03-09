import React, { useState, useEffect } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { useAuth } from '../../../context/AuthContext';
import CallHistory from '../../../components/CallHistory';

const Sidebar = ({ onOpenProfile, onAddContact, onCreateGroup, onCreateStatus }) => {
    const {
        contacts, onlineUsers, selected, setSelected,
        sidebarView, setSidebarView, sidebarOpen, setSidebarOpen,
        lastSeenMap, avatarMap, isConnected, myAvatar, profile,
        messagesByChat, allChatGroups, logout,
        groups, selectedGroup, setSelectedGroup,
        statusFeed, selectedStatusOwner, setSelectedStatusOwner,
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
            min-w-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.08),_transparent_28%),linear-gradient(to_bottom,_rgba(15,23,42,0.98),_rgba(2,6,23,0.98))] border-r border-white/5 flex flex-col
            ${(selected || selectedGroup || (sidebarView === 'statuses' && selectedStatusOwner)) ? 'hidden lg:flex lg:w-72 xl:w-80' : 'w-full lg:w-72 xl:w-80'}
        `}>
            {/* Header del Sidebar (Perfil y Ajustes) */}
            <div className="p-4 bg-transparent flex items-center justify-between border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div 
                        className="relative w-10 h-10 rounded-full cursor-pointer group flex-shrink-0" 
                        title="Ver foto de perfil"
                        onClick={onOpenProfile}
                    >
                        {myAvatar ? (
                            <img src={myAvatar} alt="avatar" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                            <div className="w-10 h-10 bg-gradient-to-tr from-cyan-500 to-indigo-600 rounded-full flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-950/30">
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
                        className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-2xl transition-colors" 
                        title="Ajustes"
                        aria-label="Abrir ajustes de perfil"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </button>
                    <button 
                        onClick={logout} 
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-white/5 rounded-2xl transition-colors" 
                        title="Cerrar Sesión"
                        aria-label="Cerrar sesión de la aplicación"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    </button>
                </div>
            </div>

            {/* Barra de Búsqueda */}
            <div className="p-3 bg-transparent">
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="block w-full pl-10 pr-10 py-3 border border-white/5 rounded-2xl leading-5 bg-slate-800/85 text-slate-200 placeholder-slate-500 focus:outline-none focus:bg-slate-800 focus:border-cyan-500/30 focus:ring-2 focus:ring-cyan-500/10 sm:text-sm transition-all"
                        placeholder={
                            sidebarView === 'chats' ? "Buscar chats..." :
                            sidebarView === 'calls' ? "Buscar llamadas..." :
                            sidebarView === 'statuses' ? "Buscar estados..." :
                            sidebarView === 'groups' ? "Buscar grupos..." :
                            "Buscar contactos..."
                        }
                        aria-label={
                            sidebarView === 'chats' ? "Buscar en tus chats activos" :
                            sidebarView === 'calls' ? "Buscar en tu historial de llamadas" :
                            sidebarView === 'statuses' ? "Buscar entre estados activos" :
                            sidebarView === 'groups' ? "Buscar en tus grupos" :
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
            <nav className="scrollbar-hidden mx-3 mb-2 mt-1 flex gap-1 overflow-x-auto rounded-2xl border border-white/5 bg-slate-800/70 p-1" role="tablist">
                <button
                    role="tab"
                    aria-selected={sidebarView === 'chats'}
                    onClick={() => { setSidebarView('chats'); }}
                    className={`shrink-0 rounded-xl px-3 py-2.5 text-xs font-medium leading-tight text-center transition-colors xl:text-sm ${sidebarView === 'chats' ? 'bg-slate-950 text-cyan-300 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                >
                    Chats
                </button>
                <button
                    role="tab"
                    aria-selected={sidebarView === 'calls'}
                    onClick={() => { setSidebarView('calls'); }}
                    className={`shrink-0 rounded-xl px-3 py-2.5 text-xs font-medium leading-tight text-center transition-colors xl:text-sm ${sidebarView === 'calls' ? 'bg-slate-950 text-cyan-300 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                >
                    Llamadas
                </button>
                <button
                    role="tab"
                    aria-selected={sidebarView === 'statuses'}
                    onClick={() => { setSidebarView('statuses'); }}
                    className={`shrink-0 rounded-xl px-3 py-2.5 text-xs font-medium leading-tight text-center transition-colors xl:text-sm ${sidebarView === 'statuses' ? 'bg-slate-950 text-cyan-300 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                >
                    Estados
                </button>
                <button
                    role="tab"
                    aria-selected={sidebarView === 'contacts'}
                    onClick={() => { setSidebarView('contacts'); }}
                    className={`shrink-0 rounded-xl px-3 py-2.5 text-xs font-medium leading-tight text-center transition-colors xl:text-sm ${sidebarView === 'contacts' ? 'bg-slate-950 text-cyan-300 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                >
                    Contactos
                </button>
                <button
                    role="tab"
                    aria-selected={sidebarView === 'groups'}
                    onClick={() => { setSidebarView('groups'); }}
                    className={`shrink-0 rounded-xl px-3 py-2.5 text-xs font-medium leading-tight text-center transition-colors xl:text-sm ${sidebarView === 'groups' ? 'bg-slate-950 text-cyan-300 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                >
                    Grupos
                </button>
            </nav>

            <div className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
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
                                            className={`relative w-full text-left rounded-2xl px-3 py-3 transition-all flex items-center gap-3 border ${selected?.Number === contactNumber ? 'bg-slate-800/95 border-cyan-500/20 shadow-lg shadow-cyan-950/10' : 'bg-slate-900/55 border-transparent hover:bg-slate-800/80 hover:border-white/5'}`}
                                        >
                                            <div className="relative w-12 h-12 bg-gradient-to-br from-slate-700 to-slate-600 rounded-full flex items-center justify-center text-lg font-medium text-white overflow-hidden flex-shrink-0 shadow-lg shadow-black/15">
                                                {avatarMap[contactNumber] ? (
                                                    <img src={avatarMap[contactNumber]} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    displayName?.charAt(0)?.toUpperCase()
                                                )}
                                                {isContactOnline(contactNumber) && (
                                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900"></div>
                                                )}
                                            </div>
                                            <div className="flex-1 overflow-hidden min-w-0">
                                                <div className="flex justify-between items-baseline mb-0.5">
                                                    <div className="font-semibold text-slate-100 truncate flex items-center gap-1">
                                                        {displayName}
                                                        {isUnknown && <span className="text-[9px] bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded-full">nuevo</span>}
                                                    </div>
                                                    {lastMessage?.Time && (
                                                        <div className="text-xs text-slate-500 flex-shrink-0 ml-2">
                                                            {new Date(lastMessage.Time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-sm text-slate-400 truncate mt-0.5 pr-8">
                                                    {formatLastMessage(lastMessage)}
                                                </div>
                                            </div>
                                            {getUnreadCount(contact || {Number: contactNumber}) > 0 && (
                                                <span className="absolute top-1/2 -translate-y-1/2 right-4 bg-cyan-500 text-slate-950 text-xs font-black px-2 py-0.5 rounded-full shadow-lg shadow-cyan-950/20">
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

                {sidebarView === 'statuses' && (
                    <>
                        <div className="flex justify-between items-center mb-3 px-2">
                            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                                {debouncedSearchQuery ? 'Resultados de búsqueda' : 'Estados activos'}
                            </div>
                            <button
                                onClick={onCreateStatus}
                                className="text-xs bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white px-3 py-1.5 rounded-xl transition-colors font-medium"
                            >
                                + Publicar
                            </button>
                        </div>
                        <div className="space-y-1">
                            {(() => {
                                const myThread = statusFeed?.myStatuses || null;
                                const contactThreads = Array.isArray(statusFeed?.contacts) ? statusFeed.contacts : [];
                                const filteredThreads = contactThreads.filter((thread) => {
                                    if (!debouncedSearchQuery) return true;
                                    const query = debouncedSearchQuery.toLowerCase();
                                    return (thread.ownerName || '').toLowerCase().includes(query)
                                        || (thread.ownerUsername || '').toLowerCase().includes(query)
                                        || thread.ownerTelephon.includes(query);
                                });

                                return (
                                    <>
                                        <button
                                            onClick={() => {
                                                if (myThread?.ownerTelephon) {
                                                    setSelectedStatusOwner(myThread.ownerTelephon);
                                                }
                                                setSidebarView('statuses');
                                            }}
                                            className={`w-full text-left rounded-2xl px-3 py-3 transition-all flex items-center gap-3 border ${selectedStatusOwner === myThread?.ownerTelephon ? 'bg-slate-800/95 border-cyan-500/20 shadow-lg shadow-cyan-950/10' : 'bg-slate-900/55 border-transparent hover:bg-slate-800/80 hover:border-white/5'}`}
                                        >
                                            <div className={`relative w-12 h-12 rounded-full p-[2px] ${myThread?.statuses?.length ? 'bg-gradient-to-br from-sky-400 via-cyan-400 to-indigo-500' : 'bg-white/10'}`}>
                                                <div className="w-full h-full rounded-full overflow-hidden bg-slate-900">
                                                    {myAvatar ? (
                                                        <img src={myAvatar} alt="Mi avatar" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-lg font-medium text-white bg-gradient-to-br from-slate-700 to-slate-600">
                                                            {user?.username?.charAt(0)?.toUpperCase()}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-slate-100 truncate">Mi estado</div>
                                                <div className="flex items-center gap-2 text-sm text-slate-400 truncate">
                                                    <span className={`inline-flex h-2.5 w-2.5 rounded-full ${myThread?.statuses?.length ? 'bg-sky-400 shadow-[0_0_0_4px_rgba(56,189,248,0.12)]' : 'bg-slate-600'}`} />
                                                    <span className="truncate">{myThread?.statuses?.length ? `${myThread.statuses.length} publicación${myThread.statuses.length === 1 ? '' : 'es'} activas` : 'Publica un texto, una foto o un video'}</span>
                                                </div>
                                            </div>
                                        </button>

                                        {filteredThreads.length === 0 ? (
                                            <div className="text-center text-slate-500 py-10">No hay estados disponibles</div>
                                        ) : filteredThreads.map((thread) => (
                                            <button
                                                key={thread.ownerTelephon}
                                                onClick={() => {
                                                    setSelectedStatusOwner(thread.ownerTelephon);
                                                    setSidebarView('statuses');
                                                }}
                                                className={`w-full text-left rounded-2xl px-3 py-3 transition-all flex items-center gap-3 border ${selectedStatusOwner === thread.ownerTelephon ? 'bg-slate-800/95 border-cyan-500/20 shadow-lg shadow-cyan-950/10' : 'bg-slate-900/55 border-transparent hover:bg-slate-800/80 hover:border-white/5'}`}
                                            >
                                                <div className={`relative w-12 h-12 rounded-full p-[2px] ${thread.hasUnviewed ? 'bg-gradient-to-br from-emerald-400 via-sky-400 to-indigo-500' : 'bg-white/10'}`}>
                                                    <div className="w-full h-full rounded-full overflow-hidden bg-slate-900">
                                                        {thread.ownerAvatar ? (
                                                            <img src={thread.ownerAvatar} alt="avatar" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-lg font-medium text-white bg-gradient-to-br from-slate-700 to-slate-600">
                                                                {(thread.ownerName || thread.ownerUsername || thread.ownerTelephon)?.charAt(0)?.toUpperCase()}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-semibold text-slate-100 truncate">{thread.ownerName}</div>
                                                    <div className="flex items-center gap-2 text-sm text-slate-400 truncate">
                                                        <span className={`inline-flex h-2.5 w-2.5 rounded-full ${thread.hasUnviewed ? 'bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]' : 'bg-slate-600'}`} />
                                                        <span className="truncate">{thread.hasUnviewed ? 'Tiene novedades sin ver' : 'Ya viste sus estados'}</span>
                                                    </div>
                                                </div>
                                                <span className="text-xs text-slate-500">{thread.statuses.length}</span>
                                            </button>
                                        ))}
                                    </>
                                );
                            })()}
                        </div>
                    </>
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
                                className="text-xs bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white px-3 py-1.5 rounded-xl transition-colors font-medium"
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
                                        className={`w-full text-left rounded-2xl px-3 py-3 transition-all flex items-center gap-3 border ${selected?.Number === c.Number ? 'bg-slate-800/95 border-cyan-500/20 shadow-lg shadow-cyan-950/10' : 'bg-slate-900/55 border-transparent hover:bg-slate-800/80 hover:border-white/5'}`}
                                    >
                                        <div className="relative w-12 h-12 bg-gradient-to-br from-slate-700 to-slate-600 rounded-full flex items-center justify-center text-lg font-medium text-white overflow-hidden flex-shrink-0 shadow-lg shadow-black/15">
                                            {avatarMap[c.Number] ? (
                                                <img src={avatarMap[c.Number]} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                (c.ContactName || c.Username)?.charAt(0)?.toUpperCase()
                                            )}
                                            {isContactOnline(c.Number) && (
                                                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900"></div>
                                            )}
                                        </div>
                                        <div className="flex-1 overflow-hidden min-w-0">
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
                {/* Vista de Grupos */}
                {sidebarView === 'groups' && (
                    <>
                        <div className="flex justify-between items-center mb-3 px-2">
                            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                                {debouncedSearchQuery ? 'Resultados de búsqueda' : 'Mis Grupos'}
                            </div>
                            <button
                                onClick={onCreateGroup}
                                className="text-xs bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white px-3 py-1.5 rounded-xl transition-colors font-medium"
                            >
                                + Nuevo
                            </button>
                        </div>
                        <div className="space-y-1">
                            {(() => {
                                const filtered = (groups || []).filter(g => {
                                    if (!debouncedSearchQuery) return true;
                                    return (g.Name || '').toLowerCase().includes(debouncedSearchQuery.toLowerCase());
                                });

                                if (filtered.length === 0) {
                                    return (
                                        <div className="text-center text-slate-500 py-10 text-sm">
                                            {debouncedSearchQuery ? 'No se encontraron grupos' : 'No perteneces a ningún grupo'}
                                            {!debouncedSearchQuery && (
                                                <div className="mt-3">
                                                    <button
                                                        onClick={onCreateGroup}
                                                        className="text-amber-300 hover:text-amber-200 text-xs underline"
                                                    >
                                                        Crear tu primer grupo
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                return filtered.map(g => (
                                    <button
                                        key={g.ID}
                                        onClick={() => {
                                            setSelectedGroup(g);
                                            setSidebarOpen(false);
                                        }}
                                        className={`relative w-full text-left rounded-2xl px-3 py-3 transition-all flex items-center gap-3 border ${
                                            selectedGroup?.ID === g.ID ? 'bg-slate-800/95 border-amber-500/20 shadow-lg shadow-orange-950/10' : 'bg-slate-900/55 border-transparent hover:bg-slate-800/80 hover:border-white/5'
                                        }`}
                                    >
                                        {/* Group avatar */}
                                        <div className="w-12 h-12 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-full flex items-center justify-center text-lg font-bold text-white flex-shrink-0 overflow-hidden shadow-lg shadow-orange-950/20">
                                            {g.AvatarUrl
                                                ? <img src={g.AvatarUrl} alt={g.Name} className="w-full h-full object-cover" />
                                                : g.Name?.charAt(0)?.toUpperCase()
                                            }
                                        </div>

                                        <div className="flex-1 overflow-hidden min-w-0">
                                            <div className="flex justify-between items-baseline mb-0.5">
                                                <div className="font-semibold text-slate-100 truncate">{g.Name}</div>
                                                {g.UserRole === 'admin' && (
                                                    <span className="text-[9px] bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded-full ml-2 flex-shrink-0">admin</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-400 truncate">
                                                {g.MemberCount} miembros{g.Description ? ` · ${g.Description}` : ''}
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
