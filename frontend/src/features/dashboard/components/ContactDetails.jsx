import React, { useState, useEffect, useRef } from 'react';
import api from '../../../api/axios';
import { useDashboard } from '../context/DashboardContext';

const ContactDetails = ({ isOpen, onClose, onStartCall, setViewImage }) => {
    const { 
        selected, 
        onlineUsers, 
        lastSeenMap, 
        avatarMap, 
        isConnected, 
        globalWallpaper,
        renameContact,
    } = useDashboard();

    const [chatWallpapers, setChatWallpapers] = useState({});
    const [uploadingWallpaper, setUploadingWallpaper] = useState(false);

    // ── Edit contact name ─────────────────────────────────────────────────
    const [editingName, setEditingName] = useState(false);
    const [nameInput, setNameInput] = useState('');
    const [savingName, setSavingName] = useState(false);
    const [nameError, setNameError] = useState('');
    const nameInputRef = useRef(null);

    const startEditName = () => {
        setNameInput(selected.ContactName || selected.Username || '');
        setNameError('');
        setEditingName(true);
    };

    useEffect(() => {
        if (editingName) nameInputRef.current?.focus();
    }, [editingName]);

    const cancelEditName = () => {
        setEditingName(false);
        setNameError('');
    };

    const submitEditName = async () => {
        if (!nameInput.trim()) {
            setNameError('El nombre no puede quedar vacío.');
            return;
        }
        setSavingName(true);
        setNameError('');
        try {
            await renameContact(selected.Number, nameInput.trim());
            setEditingName(false);
        } catch (err) {
            setNameError(err?.response?.data?.error || err.message || 'No pudimos guardar el cambio de nombre.');
        } finally {
            setSavingName(false);
        }
    };

    const handleNameKeyDown = (e) => {
        if (e.key === 'Enter') submitEditName();
        if (e.key === 'Escape') cancelEditName();
    };

    // Cargar fondos de chat guardados en localStorage
    useEffect(() => {
        const saved = localStorage.getItem('chat_wallpapers');
        if (saved) {
            try {
                setChatWallpapers(JSON.parse(saved));
            } catch (e) {
                console.error('Error parsing chat wallpapers:', e);
            }
        }
    }, []);

    if (!isOpen || !selected) return null;

    const isContactOnline = (number) => onlineUsers.has(number);
    
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

    const handleContactWallpaperUpload = async (e, contactNumber) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadingWallpaper(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const { data } = await api.post('/api/v1/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const newWps = { ...chatWallpapers, [contactNumber]: data.url };
            setChatWallpapers(newWps);
            localStorage.setItem('chat_wallpapers', JSON.stringify(newWps));
            window.dispatchEvent(new CustomEvent('chat-wallpaper-changed', { detail: newWps }));
        } catch (err) {
            console.error('Error uploading contact wallpaper:', err);
            alert('No pudimos actualizar el fondo de esta conversación. Inténtalo nuevamente.');
        } finally {
            setUploadingWallpaper(false);
        }
    };

    const handleRemoveContactWallpaper = (contactNumber) => {
        const newWps = { ...chatWallpapers };
        delete newWps[contactNumber];
        setChatWallpapers(newWps);
        localStorage.setItem('chat_wallpapers', JSON.stringify(newWps));
        window.dispatchEvent(new CustomEvent('chat-wallpaper-changed', { detail: newWps }));
    };

    const avatarUrl = avatarMap[selected.Number];
    const displayName = selected.ContactName || selected.Username;

    return (
        <div className="fixed inset-0 lg:static lg:w-80 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.08),_transparent_30%),linear-gradient(to_bottom,_rgba(15,23,42,0.98),_rgba(2,6,23,0.98))] lg:border-l border-white/10 flex flex-col h-full z-50 lg:z-40 shadow-2xl transition-all duration-300">
            <div className="p-4 border-b border-white/10 flex items-center gap-3 bg-white/5">
                <button 
                    onClick={onClose}
                    className="p-2 hover:bg-white/10 rounded-2xl transition-colors text-slate-400 hover:text-white"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </button>
                <h3 className="font-bold text-lg text-white">Info. del contacto</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
                <div 
                    className="relative w-32 h-32 rounded-full mb-4 cursor-pointer group shadow-2xl border-4 border-slate-800"
                    onClick={() => avatarUrl && setViewImage(avatarUrl)}
                    title={avatarUrl ? "Ver foto" : ""}
                >
                    {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-cyan-500 to-indigo-600 rounded-full flex items-center justify-center text-4xl font-bold text-white">
                            {displayName?.charAt(0)?.toUpperCase()}
                        </div>
                    )}
                    {avatarUrl && (
                        <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                            </svg>
                        </div>
                    )}
                    {isContactOnline(selected.Number) && (
                        <div className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 rounded-full border-4 border-slate-900"></div>
                    )}
                </div>
                
                {/* Contact name with inline edit */}
                {editingName ? (
                    <div className="w-full mb-1 flex flex-col items-center gap-1">
                        <div className="flex items-center gap-2 w-full max-w-xs">
                            <input
                                ref={nameInputRef}
                                value={nameInput}
                                onChange={e => setNameInput(e.target.value)}
                                onKeyDown={handleNameKeyDown}
                                disabled={savingName}
                                maxLength={100}
                                className="flex-1 bg-white/10 border border-indigo-400/60 text-white text-lg font-bold text-center rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400 disabled:opacity-50"
                                placeholder="Nombre del contacto"
                            />
                            <button
                                onClick={submitEditName}
                                disabled={savingName}
                                title="Guardar"
                                className="p-1.5 bg-indigo-500 hover:bg-indigo-600 rounded-lg text-white disabled:opacity-50 transition-colors"
                            >
                                {savingName ? (
                                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                    </svg>
                                ) : (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </button>
                            <button
                                onClick={cancelEditName}
                                disabled={savingName}
                                title="Cancelar"
                                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-slate-300 disabled:opacity-50 transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        {nameError && <p className="text-red-400 text-xs mt-0.5">{nameError}</p>}
                    </div>
                ) : (
                    <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-2xl font-bold text-white text-center">{displayName}</h2>
                        <button
                            onClick={startEditName}
                            title="Editar nombre"
                            className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-white/10 rounded-2xl transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </button>
                    </div>
                )}
                <p className="text-cyan-300/85 mb-6 text-center font-medium tracking-wide">
                    {selected.Number}
                </p>

                <div className="w-full space-y-4">
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5 shadow-lg shadow-black/10">
                        <div className="text-xs text-cyan-300/70 mb-1 uppercase tracking-wider font-semibold">Estado</div>
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isContactOnline(selected.Number) ? 'bg-green-500' : 'bg-slate-500'}`}></span>
                            <span className="text-white font-medium">
                                {isContactOnline(selected.Number) ? 'En línea' : (getLastSeenText(selected.Number) || 'Desconectado')}
                            </span>
                        </div>
                    </div>
                    
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5 shadow-lg shadow-black/10">
                        <div className="text-xs text-cyan-300/70 mb-1 uppercase tracking-wider font-semibold">Acciones</div>
                        <div className="flex gap-2 mt-3">
                            <button 
                                onClick={() => onStartCall('audio')}
                                disabled={!isConnected}
                                className="flex-1 flex flex-col items-center justify-center gap-2 p-3 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 hover:text-emerald-100 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                <span className="text-xs font-medium">Llamar</span>
                            </button>
                            <button 
                                onClick={() => onStartCall('video')}
                                disabled={!isConnected}
                                className="flex-1 flex flex-col items-center justify-center gap-2 p-3 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 hover:text-sky-100 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                <span className="text-xs font-medium">Video</span>
                            </button>
                        </div>
                    </div>

                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5 shadow-lg shadow-black/10">
                        <div className="text-xs text-cyan-300/70 mb-3 uppercase tracking-wider font-semibold">Fondo de este chat</div>
                        {chatWallpapers[selected.Number] ? (
                            <div className="relative rounded-xl overflow-hidden h-28 mb-2">
                                <img
                                    src={chatWallpapers[selected.Number]}
                                    alt="Fondo del chat"
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2 gap-2">
                                    <label className="cursor-pointer flex items-center gap-1 text-xs text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm px-2 py-1 rounded-lg transition-colors">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        {uploadingWallpaper ? 'Subiendo...' : 'Cambiar'}
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleContactWallpaperUpload(e, selected.Number)} disabled={uploadingWallpaper} />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveContactWallpaper(selected.Number)}
                                        className="flex items-center gap-1 text-xs text-red-300 bg-red-500/20 hover:bg-red-500/30 backdrop-blur-sm px-2 py-1 rounded-lg transition-colors"
                                    >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Quitar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <label className={`flex flex-col items-center justify-center h-20 rounded-2xl border-2 border-dashed border-white/20 hover:border-cyan-400/60 bg-white/5 hover:bg-white/10 transition-all cursor-pointer gap-2 ${uploadingWallpaper ? 'opacity-50 pointer-events-none' : ''}`}>
                                {uploadingWallpaper ? (
                                    <svg className="animate-spin h-5 w-5 text-indigo-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                    </svg>
                                ) : (
                                    <>
                                        <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        <span className="text-xs text-cyan-300">Poner fondo a este chat</span>
                                    </>
                                )}
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleContactWallpaperUpload(e, selected.Number)} disabled={uploadingWallpaper} />
                            </label>
                        )}
                        {!chatWallpapers[selected.Number] && globalWallpaper && (
                            <p className="text-xs text-cyan-300/50 mt-2 text-center">Usando fondo global</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ContactDetails;
