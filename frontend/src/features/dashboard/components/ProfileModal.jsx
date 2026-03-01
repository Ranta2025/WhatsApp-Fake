import React, { useState, useEffect } from 'react';
import api from '../../../api/axios';
import { useDashboard } from '../context/DashboardContext';
import { useAuth } from '../../../context/AuthContext';

const ProfileModal = ({ isOpen, onClose }) => {
    const { profile, setProfile, myAvatar, setMyAvatar, globalWallpaper, setGlobalWallpaper, fetchProfile } = useDashboard();
    const { user, updateUsername } = useAuth();

    const [newUsername, setNewUsername] = useState(user?.username || '');
    const [newAvatarFile, setNewAvatarFile] = useState(null);
    const [newAvatarPreview, setNewAvatarPreview] = useState(null);
    const [removeAvatar, setRemoveAvatar] = useState(false);
    const [status, setStatus] = useState('');
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [uploadingWallpaper, setUploadingWallpaper] = useState(false);

    useEffect(() => {
        if (user?.username) setNewUsername(user.username);
    }, [user]);

    if (!isOpen) return null;

    const handleAvatarUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            setNewAvatarFile(file);
            setNewAvatarPreview(URL.createObjectURL(file));
            setRemoveAvatar(false);
        }
    };

    const handleRemoveAvatar = () => {
        setRemoveAvatar(true);
        setNewAvatarFile(null);
        setNewAvatarPreview(null);
    };

    const handleGlobalWallpaperUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadingWallpaper(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const { data } = await api.post('/api/v1/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            await api.put('/api/v1/profile/wallpaper', { wallpaper_url: data.url });
            setGlobalWallpaper(data.url);
        } catch (err) {
            console.error('Error uploading wallpaper:', err);
            alert('Error al subir el fondo');
        } finally {
            setUploadingWallpaper(false);
        }
    };

    const handleRemoveGlobalWallpaper = async () => {
        setUploadingWallpaper(true);
        try {
            await api.put('/api/v1/profile/wallpaper', { wallpaper_url: "" });
            setGlobalWallpaper("");
        } catch (err) {
            console.error('Error removing wallpaper:', err);
            alert('Error al quitar el fondo');
        } finally {
            setUploadingWallpaper(false);
        }
    };

    const submitEdit = async (e) => {
        e.preventDefault();
        const nu = newUsername.trim();
        const nameChanged = nu && nu !== user?.username;
        const photoChanged = !!newAvatarFile;
        const photoRemoved = removeAvatar && myAvatar;

        if (!nameChanged && !photoChanged && !photoRemoved) {
            onClose();
            return;
        }

        if (nameChanged && nu.length < 5) {
            setStatus('El usuario tiene que tener mas de 5 caracteres');
            return;
        }

        try {
            setStatus('Guardando cambios...');
            setUploadingAvatar(true);

            if (photoChanged) {
                const formData = new FormData();
                formData.append('file', newAvatarFile);
                const { data: uploadData } = await api.post('/api/v1/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                const avatarUrl = uploadData.url;
                await api.put('/api/v1/profile/avatar', { avatar_url: avatarUrl });
                setMyAvatar(avatarUrl);
            } else if (photoRemoved) {
                await api.put('/api/v1/profile/avatar', { avatar_url: "" });
                setMyAvatar("");
            }

            if (nameChanged) {
                await api.put('/api/v1/user', { username: nu });
                // El servidor ya actualizó la cookie HttpOnly con el nuevo JWT
                updateUsername(nu);
            }

            await fetchProfile();
            onClose();
            setStatus('');
            setNewAvatarFile(null);
            setNewAvatarPreview(null);
        } catch (err) {
            const d = err?.response?.data;
            const msg = typeof d === 'string' ? d : d?.message || d?.error || err?.message || 'Error al actualizar';
            setStatus(msg);
        } finally {
            setUploadingAvatar(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-700/50">
                <div className="p-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/50">
                    <h2 className="text-xl font-semibold text-slate-100">Editar Perfil</h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-200 transition-colors p-2 hover:bg-slate-700/50 rounded-lg"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <form onSubmit={submitEdit} className="p-6 space-y-6">
                    <div className="flex flex-col items-center mb-6">
                        <label className="relative w-24 h-24 rounded-full cursor-pointer group mb-2 shadow-lg" title="Cambiar foto de perfil">
                            {newAvatarPreview || (myAvatar && !removeAvatar) ? (
                                <img src={newAvatarPreview || myAvatar} alt="avatar" className="w-24 h-24 rounded-full object-cover border-2 border-indigo-500/50" />
                            ) : (
                                <div className="w-24 h-24 bg-gradient-to-tr from-indigo-600 to-slate-600 rounded-full flex items-center justify-center font-bold text-3xl border-2 border-indigo-500/50 text-white">
                                    {user?.username?.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div className="absolute inset-0 bg-slate-900/60 rounded-full opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity">
                                {uploadingAvatar ? (
                                    <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                                    </svg>
                                ) : (
                                    <>
                                        <svg className="w-6 h-6 text-white mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        <span className="text-[10px] text-white font-medium">Cambiar</span>
                                    </>
                                )}
                            </div>
                            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                        </label>
                        <div className="flex items-center gap-3 mt-1">
                            <p className="text-xs text-slate-200/70">Haz clic para actualizar tu foto</p>
                            {(myAvatar || newAvatarPreview) && !removeAvatar && (
                                <button 
                                    type="button"
                                    onClick={handleRemoveAvatar}
                                    className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 bg-red-500/10 px-2 py-1 rounded-md"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Quitar
                                </button>
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Fondo Global de Chats</label>
                        {globalWallpaper ? (
                            <div className="relative rounded-xl overflow-hidden mb-2 h-32 bg-slate-900/50 border border-slate-700/50 group">
                                <img
                                    src={globalWallpaper.startsWith('/') ? window.location.origin + globalWallpaper : globalWallpaper}
                                    alt="Fondo actual"
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center p-3 gap-3">
                                    <label className="cursor-pointer flex items-center gap-1.5 text-sm font-medium text-white bg-indigo-500/80 hover:bg-indigo-500 backdrop-blur-md px-3 py-1.5 rounded-lg transition-all shadow-lg">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        Cambiar
                                        <input type="file" accept="image/*" className="hidden" onChange={handleGlobalWallpaperUpload} disabled={uploadingWallpaper} />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleRemoveGlobalWallpaper}
                                        className="flex items-center gap-1.5 text-sm font-medium text-white bg-rose-500/80 hover:bg-rose-500 backdrop-blur-md px-3 py-1.5 rounded-lg transition-all shadow-lg"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Quitar
                                    </button>
                                </div>
                                {uploadingWallpaper && (
                                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center">
                                        <svg className="animate-spin h-8 w-8 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                        </svg>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <label className={`flex flex-col items-center justify-center h-32 rounded-xl border-2 border-dashed border-slate-600 hover:border-indigo-500/50 bg-slate-800/50 hover:bg-slate-700/30 transition-all cursor-pointer gap-3 group ${uploadingWallpaper ? 'opacity-50 pointer-events-none' : ''}`}>
                                {uploadingWallpaper ? (
                                    <svg className="animate-spin h-8 w-8 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                    </svg>
                                ) : (
                                    <>
                                        <div className="p-3 rounded-full bg-slate-700/50 group-hover:bg-indigo-500/20 transition-colors">
                                            <svg className="w-6 h-6 text-slate-400 group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                        <span className="text-sm font-medium text-slate-400 group-hover:text-indigo-300 transition-colors">Seleccionar imagen de fondo</span>
                                    </>
                                )}
                                <input type="file" accept="image/*" className="hidden" onChange={handleGlobalWallpaperUpload} disabled={uploadingWallpaper} />
                            </label>
                        )}
                        <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Se aplica a todos los chats que no tengan fondo propio
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Nombre de usuario</label>
                        <input
                            type="text"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-100 placeholder-slate-500 transition-all"
                            placeholder="Tu nombre visible"
                        />
                    </div>

                    {status && (
                        <div className={`text-sm ${status.includes('Error') || status.includes('caracteres') ? 'text-red-400' : 'text-indigo-400'}`}>
                            {status}
                        </div>
                    )}

                    <div className="flex gap-3 pt-4 border-t border-slate-700/50">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-xl font-medium text-slate-300 bg-slate-700/50 hover:bg-slate-700 hover:text-white transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2.5 rounded-xl font-medium text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98]"
                            disabled={uploadingAvatar || uploadingWallpaper}
                        >
                            {uploadingAvatar ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ProfileModal;
