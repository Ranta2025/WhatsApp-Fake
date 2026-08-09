import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { GroupMessagingProvider, useGroupMessaging } from '../hooks/useGroupMessaging';
import api from '../../../api/axios';
import AddContactModal from './AddContactModal';
import GroupMessageList from './group/GroupMessageList';
import GroupMessageInput from './group/GroupMessageInput';
import AddMembersModal from './group/AddMembersModal';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';

// ── GroupChatWindow (inner — needs GroupMessagingProvider) ────────────────────

const GroupChatWindowInner = ({ onStartGroupCall }) => {
    const {
        selectedGroup, setSelectedGroup,
        groupMessages, setGroupMessages, fetchGroupMessages, fetchGroupDetail,
        typingUsers, profile,
        isConnected,
        contacts,
        setSelected,
        avatarMap, myAvatar,
        setGroups, addToast,
        globalWallpaper,
    } = useDashboard();

    const [showAddMembers, setShowAddMembers]     = useState(false);
    const [showMembers, setShowMembers]           = useState(false);
    const [showOptions, setShowOptions]           = useState(false);
    const [confirmClear, setConfirmClear]         = useState(false);
    const [confirmLeave, setConfirmLeave]         = useState(false);
    const [confirmDelete, setConfirmDelete]       = useState(false);
    const [loadingLeave, setLoadingLeave]         = useState(false);
    const [uploadingAvatar, setUploadingAvatar]   = useState(false);
    const [uploadingWallpaper, setUploadingWallpaper] = useState(false);
    const [showAvatarMenu, setShowAvatarMenu]     = useState(false);
    const [viewAvatarOpen, setViewAvatarOpen]     = useState(false);
    const [memberMenuOpen, setMemberMenuOpen]     = useState(null);
    const [roleLoading, setRoleLoading]           = useState(null);
    const [editingDesc, setEditingDesc]           = useState(false);
    const [descInput, setDescInput]               = useState('');
    const [savingDesc, setSavingDesc]             = useState(false);
    const [descError, setDescError]               = useState('');
    const [addContactOpen, setAddContactOpen]     = useState(false);
    const [addContactTarget, setAddContactTarget] = useState({ number: '', username: '' });
    const [confirmRemove, setConfirmRemove]       = useState(null);
    const [removeLoading, setRemoveLoading]       = useState(false);
    const optionsRef                               = useRef(null);
    const memberMenuRef                            = useRef(null);
    const avatarInputRef                           = useRef(null);
    const avatarMenuRef                            = useRef(null);

    useEffect(() => {
        if (!showAvatarMenu) return;
        const handler = (e) => {
            if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target)) setShowAvatarMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showAvatarMenu]);

    const [groupWallpapers, setGroupWallpapers] = useState(() => {
        try { return JSON.parse(localStorage.getItem('group_wallpapers') || '{}'); } catch { return {}; }
    });
    useEffect(() => {
        const onCustom = (e) => setGroupWallpapers(e.detail || {});
        window.addEventListener('group-wallpaper-changed', onCustom);
        return () => window.removeEventListener('group-wallpaper-changed', onCustom);
    }, []);

    const activeWallpaper = (selectedGroup && groupWallpapers[selectedGroup.ID]) || globalWallpaper || null;

    const handleGroupWallpaperUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !selectedGroup?.ID) return;
        setUploadingWallpaper(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const { data } = await api.post('/api/v1/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const newWps = { ...groupWallpapers, [selectedGroup.ID]: data.url };
            setGroupWallpapers(newWps);
            localStorage.setItem('group_wallpapers', JSON.stringify(newWps));
            window.dispatchEvent(new CustomEvent('group-wallpaper-changed', { detail: newWps }));
            addToast({ type: 'success', message: 'Fondo del grupo actualizado' });
        } catch (err) {
            addToast({ type: 'error', message: err?.response?.data?.error || 'Error al subir el fondo' });
        } finally {
            setUploadingWallpaper(false);
            e.target.value = '';
        }
    };

    const handleRemoveGroupWallpaper = () => {
        if (!selectedGroup?.ID) return;
        const newWps = { ...groupWallpapers };
        delete newWps[selectedGroup.ID];
        setGroupWallpapers(newWps);
        localStorage.setItem('group_wallpapers', JSON.stringify(newWps));
        window.dispatchEvent(new CustomEvent('group-wallpaper-changed', { detail: newWps }));
    };

    useEffect(() => {
        if (!memberMenuOpen) return;
        const handler = (e) => {
            if (memberMenuRef.current && !memberMenuRef.current.contains(e.target)) setMemberMenuOpen(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [memberMenuOpen]);

    useEffect(() => {
        const handler = (e) => {
            if (optionsRef.current && !optionsRef.current.contains(e.target)) setShowOptions(false);
        };
        if (showOptions) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showOptions]);

    const handleClearChat = () => {
        setGroupMessages(prev => ({ ...prev, [selectedGroup.ID]: [] }));
        setConfirmClear(false);
        setShowOptions(false);
    };

    const handleLeaveGroup = async () => {
        setLoadingLeave(true);
        try {
            const { leaveGroup } = await import('../../../api/groupApi');
            await leaveGroup(selectedGroup.ID);
            const gid = selectedGroup.ID;
            setGroups(prev => prev.map(g => g.ID === gid ? { ...g, UserRole: 'left' } : g));
            setSelectedGroup(prev => prev ? { ...prev, UserRole: 'left' } : prev);
            addToast({ type: 'success', message: 'Has salido del grupo' });
        } catch (err) {
            addToast({ type: 'error', message: err?.response?.data?.error || 'Error al salir del grupo' });
        } finally {
            setLoadingLeave(false);
            setConfirmLeave(false);
        }
    };

    const handleSaveDesc = async () => {
        setSavingDesc(true);
        setDescError('');
        try {
            const { updateGroupDescription } = await import('../../../api/groupApi');
            await updateGroupDescription(selectedGroup.ID, descInput.trim());
            const gid     = selectedGroup.ID;
            const newDesc = descInput.trim();
            setGroups(prev => prev.map(g => g.ID === gid ? { ...g, Description: newDesc } : g));
            setSelectedGroup(prev => prev ? { ...prev, Description: newDesc } : prev);
            setEditingDesc(false);
            addToast({ type: 'success', message: 'Descripción actualizada' });
        } catch (err) {
            setDescError(err?.response?.data?.error || 'Error al guardar la descripción');
        } finally {
            setSavingDesc(false);
        }
    };

    const handleRemoveMember = async () => {
        if (!confirmRemove || !selectedGroup) return;
        setRemoveLoading(true);
        try {
            const { removeMember } = await import('../../../api/groupApi');
            await removeMember(selectedGroup.ID, confirmRemove.telephon);
            setSelectedGroup(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    MemberCount: Math.max((prev.MemberCount || 1) - 1, 0),
                    Members: (prev.Members || []).filter(m => m.Telephon !== confirmRemove.telephon),
                };
            });
            addToast({ type: 'success', message: `${confirmRemove.username || confirmRemove.telephon} fue eliminado del grupo` });
            setConfirmRemove(null);
            setMemberMenuOpen(null);
        } catch (err) {
            addToast({ type: 'error', message: err?.response?.data?.error || 'Error al eliminar al miembro' });
        } finally {
            setRemoveLoading(false);
        }
    };

    const handleSetRole = async (targetTelephon, newRole) => {
        setRoleLoading(targetTelephon);
        try {
            const { setMemberRole } = await import('../../../api/groupApi');
            await setMemberRole(selectedGroup.ID, targetTelephon, newRole);
            setSelectedGroup(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    Members: (prev.Members || []).map(m =>
                        m.Telephon === targetTelephon ? { ...m, Role: newRole } : m
                    ),
                };
            });
            addToast({ type: 'success', message: newRole === 'admin' ? 'Ahora es administrador' : 'Ya no es administrador' });
        } catch (err) {
            addToast({ type: 'error', message: err?.response?.data?.error || 'Error al cambiar el rol' });
        } finally {
            setRoleLoading(null);
            setMemberMenuOpen(null);
        }
    };

    const handleDeleteGroup = async () => {
        setLoadingLeave(true);
        const gid = selectedGroup.ID;
        setConfirmDelete(false);
        try {
            const { leaveGroup } = await import('../../../api/groupApi');
            await leaveGroup(gid);
            setGroups(prev => prev.filter(g => g.ID !== gid));
            setGroupMessages(prev => { const n = { ...prev }; delete n[gid]; return n; });
            setSelectedGroup(null);
            addToast({ type: 'success', message: 'Has salido del grupo' });
        } catch (err) {
            addToast({ type: 'error', message: 'Error al salir del grupo. Intenta de nuevo.' });
        } finally {
            setLoadingLeave(false);
        }
    };

    const handleGroupAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !selectedGroup?.ID) return;
        setUploadingAvatar(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const uploadRes = await api.post('/api/v1/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const avatarUrl = uploadRes.data?.url;
            if (!avatarUrl) throw new Error('No se obtuvo URL del archivo');
            const { updateGroupAvatar } = await import('../../../api/groupApi');
            await updateGroupAvatar(selectedGroup.ID, avatarUrl);
            const gid = selectedGroup.ID;
            setGroups(prev => prev.map(g => g.ID === gid ? { ...g, AvatarUrl: avatarUrl } : g));
            setSelectedGroup(prev => prev ? { ...prev, AvatarUrl: avatarUrl } : prev);
            addToast({ type: 'success', message: 'Foto del grupo actualizada' });
        } catch (err) {
            addToast({ type: 'error', message: err?.response?.data?.error || 'Error al actualizar la foto' });
        } finally {
            setUploadingAvatar(false);
            e.target.value = '';
        }
    };

    const myTelephon = profile?.Telephon;
    const messages   = groupMessages[selectedGroup?.ID] || [];

    const myRole = useMemo(() => {
        if (!selectedGroup?.Members || !myTelephon) return selectedGroup?.UserRole || 'member';
        return selectedGroup.Members.find(m => m.Telephon === myTelephon)?.Role || 'member';
    }, [selectedGroup, myTelephon]);

    const typingInGroup = selectedGroup
        ? Array.from(typingUsers).filter(k => k.startsWith(`group:${selectedGroup.ID}:`))
        : [];

    useEffect(() => {
        if (!selectedGroup?.ID) return;
        if (!selectedGroup.Members) {
            fetchGroupDetail(selectedGroup.ID);
        } else if (!groupMessages[selectedGroup.ID]) {
            fetchGroupMessages(selectedGroup.ID);
        }
    }, [selectedGroup?.ID, selectedGroup?.Members, fetchGroupDetail, fetchGroupMessages]);

    if (!selectedGroup) return null;

    return (
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-[#0B1120] relative">
            {/* ── Header ── */}
            <div className="flex-shrink-0 px-4 py-3 border-b border-white/[0.04] bg-[#0B1120]/95 backdrop-blur-md flex items-center gap-3 z-10">
                <button onClick={() => setSelectedGroup(null)}
                        className="lg:hidden p-2 hover:bg-white/10 rounded-2xl transition-colors text-slate-400"
                        aria-label="Volver">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>

                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-full flex items-center justify-center font-bold text-white text-lg flex-shrink-0 shadow overflow-hidden">
                    {selectedGroup.AvatarUrl
                        ? <img src={selectedGroup.AvatarUrl} alt="grupo" className="w-full h-full object-cover" />
                        : selectedGroup.Name?.charAt(0)?.toUpperCase()
                    }
                </div>

                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setShowMembers(!showMembers)}>
                    <div className="font-semibold text-slate-100 truncate">{selectedGroup.Name}</div>
                    <div className="text-xs text-slate-400 truncate">
                        {typingInGroup.length > 0 ? (
                            <span className="text-cyan-400 italic animate-pulse">alguien está escribiendo...</span>
                        ) : (
                            `${selectedGroup.MemberCount ?? '?'} miembros`
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                    {selectedGroup?.UserRole !== 'left' && (
                        <>
                            <button
                                onClick={() => onStartGroupCall?.('audio')}
                                disabled={!isConnected}
                                className="p-2 hover:bg-emerald-500/10 rounded-2xl transition-colors text-slate-400 hover:text-emerald-400 disabled:opacity-40"
                                title="Llamada de voz grupal"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                            </button>
                            <button
                                onClick={() => onStartGroupCall?.('video')}
                                disabled={!isConnected}
                                className="p-2 hover:bg-sky-500/10 rounded-2xl transition-colors text-slate-400 hover:text-sky-400 disabled:opacity-40"
                                title="Videollamada grupal"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                            </button>
                        </>
                    )}
                    <div className="relative" ref={optionsRef}>
                        <button onClick={() => setShowOptions(v => !v)}
                            className="p-2 hover:bg-white/10 rounded-2xl transition-colors text-slate-400 hover:text-white"
                                title="Más opciones">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                        </button>
                        {showOptions && (
                            <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden min-w-[185px] z-50">
                                {selectedGroup?.UserRole !== 'left' && (
                                    <button onClick={() => { setConfirmLeave(true); setShowOptions(false); }}
                                            className="w-full text-left px-4 py-2.5 text-sm text-amber-400 hover:bg-amber-500/10 flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                        </svg>
                                        Salir del grupo
                                    </button>
                                )}
                                <button onClick={() => { setConfirmDelete(true); setShowOptions(false); }}
                                        className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                                    </svg>
                                    Eliminar de mi lista
                                </button>
                                <div className="border-t border-white/5" />
                                <button onClick={() => { setConfirmClear(true); setShowOptions(false); }}
                                        className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:bg-white/5 flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Vaciar chat
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Group info side panel ── */}
            {showMembers && (
                <>
                    <div className="absolute inset-0 z-[100] bg-black/40"
                         onClick={() => setShowMembers(false)} />
                    <div className="absolute top-0 right-0 h-full w-full sm:w-96 z-[101] bg-[#0B1120] flex flex-col shadow-2xl border-l border-white/[0.04]"
                         style={{ animation: 'slideInRight 0.22s ease' }}>
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] bg-[#0B1120] flex-shrink-0">
                            <button onClick={() => setShowMembers(false)}
                                    className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                            <span className="font-semibold text-white text-sm">Info del grupo</span>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            <div className="flex flex-col items-center py-7 px-4 bg-[#0B1120]">
                                <div className="relative group/avatar mb-4" ref={avatarMenuRef}>
                                    <button
                                        onClick={() => setShowAvatarMenu(v => !v)}
                                        className="relative w-24 h-24 rounded-full overflow-hidden shadow-xl focus:outline-none"
                                        disabled={uploadingAvatar}>
                                        <div className="w-full h-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-4xl font-bold text-white">
                                            {selectedGroup.AvatarUrl
                                                ? <img src={selectedGroup.AvatarUrl} alt="grupo" className="w-full h-full object-cover" />
                                                : selectedGroup.Name?.charAt(0)?.toUpperCase()
                                            }
                                        </div>
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                                            {uploadingAvatar
                                                ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                : <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                                  </svg>
                                            }
                                        </div>
                                    </button>

                                    {showAvatarMenu && (
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-44 bg-slate-800 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
                                            {selectedGroup.AvatarUrl && (
                                                <button
                                                    onClick={() => { setViewAvatarOpen(true); setShowAvatarMenu(false); }}
                                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors">
                                                    <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                    Ver foto
                                                </button>
                                            )}
                                            {selectedGroup?.UserRole !== 'left' && (
                                                <label className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer">
                                                    <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    </svg>
                                                    {uploadingAvatar ? 'Subiendo...' : 'Cambiar foto'}
                                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { setShowAvatarMenu(false); handleGroupAvatarChange(e); }} disabled={uploadingAvatar} />
                                                </label>
                                            )}
                                        </div>
                                    )}

                                    <input
                                        ref={avatarInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleGroupAvatarChange}
                                    />
                                </div>
                                <h2 className="text-xl font-bold text-white text-center">{selectedGroup.Name}</h2>

                                {editingDesc ? (
                                    <div className="w-full max-w-xs mt-3">
                                        <textarea
                                            rows={2}
                                            maxLength={300}
                                            autoFocus
                                            value={descInput}
                                            onChange={e => setDescInput(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Escape') { setEditingDesc(false); setDescError(''); } }}
                                            className="w-full bg-slate-800 text-sm text-slate-200 rounded-xl px-3 py-2 border border-indigo-500/50 focus:outline-none focus:border-indigo-400 resize-none placeholder-slate-500"
                                            placeholder="Descripción del grupo..."
                                        />
                                        <div className="text-right text-[10px] text-slate-600 mt-0.5 pr-1">{descInput.length}/300</div>
                                        {descError && <p className="text-xs text-red-400 mt-1 text-center">{descError}</p>}
                                        <div className="flex justify-center gap-2 mt-2">
                                            <button
                                                onClick={() => { setEditingDesc(false); setDescError(''); }}
                                                className="px-3 py-1.5 text-xs rounded-lg bg-white/10 text-slate-300 hover:bg-white/20 transition-colors">
                                                Cancelar
                                            </button>
                                            <button
                                                disabled={savingDesc}
                                                onClick={handleSaveDesc}
                                                className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                                                {savingDesc ? 'Guardando...' : 'Guardar'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-2 text-center max-w-xs w-full px-2">
                                        {selectedGroup.Description ? (
                                            <div
                                                onClick={() => selectedGroup.UserRole !== 'left' && (setDescInput(selectedGroup.Description), setEditingDesc(true))}
                                                className={`group/desc flex items-start justify-center gap-1.5 ${selectedGroup.UserRole !== 'left' ? 'cursor-pointer' : ''}`}>
                                                <p className={`text-sm text-slate-400 leading-relaxed ${selectedGroup.UserRole !== 'left' ? 'group-hover/desc:text-slate-300 transition-colors' : ''}`}>
                                                    {selectedGroup.Description}
                                                </p>
                                                {selectedGroup.UserRole !== 'left' && (
                                                    <svg className="w-3.5 h-3.5 text-indigo-400/50 group-hover/desc:text-indigo-400 transition-colors flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                )}
                                            </div>
                                        ) : (
                                            selectedGroup.UserRole !== 'left' && (
                                                <button
                                                    onClick={() => { setDescInput(''); setEditingDesc(true); }}
                                                    className="flex items-center gap-1.5 mx-auto text-xs text-indigo-400/60 hover:text-indigo-400 transition-colors">
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                    </svg>
                                                    Añadir descripción
                                                </button>
                                            )
                                        )}
                                    </div>
                                )}

                                <p className="text-xs text-slate-500 mt-2">
                                    Grupo · {selectedGroup.MemberCount ?? (selectedGroup.Members?.length ?? '?')} participantes
                                </p>
                                {selectedGroup.CreatedAt && (
                                    <p className="text-xs text-slate-600 mt-0.5">
                                        Creado el {new Date(selectedGroup.CreatedAt).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })}
                                    </p>
                                )}
                            </div>

                            <div className="h-2 bg-slate-950/60" />

                            {/* Wallpaper section */}
                            <div className="px-5 py-4">
                                <div className="text-xs text-indigo-300/70 mb-3 uppercase tracking-wider font-semibold">Fondo de este chat</div>
                                {groupWallpapers[selectedGroup.ID] ? (
                                    <div className="relative rounded-xl overflow-hidden h-28 mb-1">
                                        <img src={groupWallpapers[selectedGroup.ID]} alt="fondo" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2 gap-2">
                                            <label className="cursor-pointer flex items-center gap-1 text-xs text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm px-2 py-1 rounded-lg transition-colors">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                {uploadingWallpaper ? 'Subiendo...' : 'Cambiar'}
                                                <input type="file" accept="image/*" className="hidden" onChange={handleGroupWallpaperUpload} disabled={uploadingWallpaper} />
                                            </label>
                                            <button type="button" onClick={handleRemoveGroupWallpaper}
                                                    className="flex items-center gap-1 text-xs text-red-300 bg-red-500/20 hover:bg-red-500/30 backdrop-blur-sm px-2 py-1 rounded-lg transition-colors">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                                Quitar
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <label className={`flex flex-col items-center justify-center h-20 rounded-xl border-2 border-dashed border-white/20 hover:border-indigo-400/60 bg-white/5 hover:bg-white/10 transition-all cursor-pointer gap-2 ${uploadingWallpaper ? 'opacity-50 pointer-events-none' : ''}`}>
                                        {uploadingWallpaper
                                            ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            : <>
                                                <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                <span className="text-xs text-indigo-300">Poner fondo a este grupo</span>
                                              </>
                                        }
                                        <input type="file" accept="image/*" className="hidden" onChange={handleGroupWallpaperUpload} disabled={uploadingWallpaper} />
                                    </label>
                                )}
                                {!groupWallpapers[selectedGroup.ID] && globalWallpaper && (
                                    <p className="text-xs text-indigo-300/50 mt-2 text-center">Usando fondo global</p>
                                )}
                            </div>

                            {/* Members list */}
                            <div className="px-0 py-2">
                                <div className="px-4 py-2 flex items-center justify-between">
                                    <span className="text-sm font-semibold text-slate-300">
                                        {selectedGroup.Members?.length ?? selectedGroup.MemberCount ?? '?'} participantes
                                    </span>
                                    <button onClick={() => { setShowMembers(false); setShowAddMembers(true); }}
                                            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                        </svg>
                                        Añadir
                                    </button>
                                </div>

                                {selectedGroup.Members ? (
                                    selectedGroup.Members.map((m) => {
                                        const isSelf     = m.Telephon === myTelephon;
                                        const isOpen     = memberMenuOpen === m.Telephon;
                                        const isContact  = contacts.some(c => c.Number === m.Telephon && c.Status === 'accepted');
                                        const displayName = isSelf ? 'Tú' : (m.ContactName || ('~' + m.Username));
                                        return (
                                            <div key={m.Telephon} className="relative" ref={isOpen ? memberMenuRef : null}>
                                                <div
                                                    onClick={() => !isSelf && setMemberMenuOpen(isOpen ? null : m.Telephon)}
                                                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${!isSelf ? 'hover:bg-white/5 cursor-pointer' : ''}`}>
                                                    <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-slate-600 to-slate-500 flex items-center justify-center text-base font-bold text-white flex-shrink-0 overflow-hidden">
                                                        {(isSelf ? myAvatar : avatarMap[m.Telephon]) ? (
                                                            <img src={isSelf ? myAvatar : avatarMap[m.Telephon]} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            (m.Username || m.Telephon)?.charAt(0)?.toUpperCase()
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0 border-b border-white/5 pb-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`font-medium truncate text-sm ${isSelf ? 'text-indigo-300' : 'text-slate-100'}`}>
                                                                {displayName}
                                                            </span>
                                                            {m.Role === 'admin' && (
                                                                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">admin</span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-slate-500 truncate mt-0.5">{m.Telephon}</div>
                                                    </div>
                                                </div>
                                                {isOpen && (
                                                    <div className="absolute left-4 top-full mt-0.5 bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden min-w-[190px] z-[200]">
                                                        <button
                                                            onClick={() => { setSelected({ Number: m.Telephon, Username: m.Username, ContactName: m.ContactName || '', Status: 'unknown' }); setShowMembers(false); setMemberMenuOpen(null); }}
                                                            className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10 flex items-center gap-2">
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                                            </svg>
                                                            Iniciar chat
                                                        </button>
                                                        {!isContact && (
                                                            <button
                                                                onClick={() => { setAddContactTarget({ number: m.Telephon, username: m.Username }); setAddContactOpen(true); setMemberMenuOpen(null); }}
                                                                className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10 flex items-center gap-2">
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                                                </svg>
                                                                Agregar a contactos
                                                            </button>
                                                        )}
                                                        {myRole === 'admin' && !isSelf && (
                                                            <>
                                                                <div className="border-t border-white/5 my-1" />
                                                                {m.Role !== 'admin' ? (
                                                                    <button
                                                                        disabled={roleLoading === m.Telephon}
                                                                        onClick={() => handleSetRole(m.Telephon, 'admin')}
                                                                        className="w-full text-left px-4 py-2.5 text-sm text-indigo-400 hover:bg-indigo-500/10 flex items-center gap-2 disabled:opacity-50 transition-colors">
                                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                                                                        </svg>
                                                                        {roleLoading === m.Telephon ? 'Guardando...' : 'Hacer admin'}
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        disabled={roleLoading === m.Telephon}
                                                                        onClick={() => handleSetRole(m.Telephon, 'member')}
                                                                        className="w-full text-left px-4 py-2.5 text-sm text-amber-400 hover:bg-amber-500/10 flex items-center gap-2 disabled:opacity-50 transition-colors">
                                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                        </svg>
                                                                        {roleLoading === m.Telephon ? 'Guardando...' : 'Quitar admin'}
                                                                    </button>
                                                                )}
                                                                <div className="border-t border-white/5 my-1" />
                                                                <button
                                                                    onClick={() => { setConfirmRemove({ telephon: m.Telephon, username: m.ContactName || m.Username }); setMemberMenuOpen(null); }}
                                                                    className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors">
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                                                                    </svg>
                                                                    Eliminar del grupo
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="px-4 py-6 text-center text-slate-500 text-sm">Cargando participantes...</div>
                                )}
                            </div>

                            <div className="h-2 bg-slate-950/60" />

                            <div className="py-2">
                                {selectedGroup?.UserRole !== 'left' && (
                                    <button onClick={() => { setShowMembers(false); setConfirmLeave(true); }}
                                            className="w-full flex items-center gap-4 px-5 py-3.5 text-amber-400 hover:bg-amber-500/10 transition-colors">
                                        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                        </svg>
                                        <span className="text-sm font-medium">Salir del grupo</span>
                                    </button>
                                )}
                                <button onClick={() => { setShowMembers(false); setConfirmDelete(true); }}
                                        className="w-full flex items-center gap-4 px-5 py-3.5 text-red-400 hover:bg-red-500/10 transition-colors">
                                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                                    </svg>
                                    <span className="text-sm font-medium">Eliminar de mi lista</span>
                                </button>
                                <div className="border-t border-white/5 mx-4 my-1" />
                                <button onClick={() => { setShowMembers(false); setConfirmClear(true); }}
                                        className="w-full flex items-center gap-4 px-5 py-3.5 text-slate-400 hover:bg-white/5 transition-colors">
                                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    <span className="text-sm font-medium">Vaciar chat</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            <style>{`@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

            <GroupMessageList groupID={selectedGroup.ID} messages={messages} myTelephon={myTelephon} activeWallpaper={activeWallpaper} />
            <GroupMessageInput />

            <AddMembersModal
                isOpen={showAddMembers}
                onClose={() => setShowAddMembers(false)}
                group={selectedGroup}
            />

            <AddContactModal
                isOpen={addContactOpen}
                onClose={() => setAddContactOpen(false)}
                initialNumber={addContactTarget.number}
                initialName={addContactTarget.username}
            />

            <ConfirmDialog
                isOpen={confirmLeave}
                onClose={() => setConfirmLeave(false)}
                onConfirm={handleLeaveGroup}
                title="¿Salir del grupo?"
                description="Dejarás de poder enviar mensajes, pero podrás seguir leyendo el historial."
                confirmText="Salir"
                variant="warning"
                loading={loadingLeave}
            />

            <ConfirmDialog
                isOpen={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                onConfirm={handleDeleteGroup}
                title="¿Eliminar de tu lista?"
                description="Saldrás del grupo y desaparecerá de tu lista. Esta acción no se puede deshacer."
                confirmText="Eliminar"
                variant="danger"
                loading={loadingLeave}
            />

            <ConfirmDialog
                isOpen={!!confirmRemove}
                onClose={() => setConfirmRemove(null)}
                onConfirm={handleRemoveMember}
                title={`¿Eliminar a ${confirmRemove?.username || confirmRemove?.telephon}?`}
                description="Esta persona será eliminada del grupo y ya no podrá ver los mensajes futuros."
                confirmText="Eliminar"
                variant="danger"
                loading={removeLoading}
            />

            <ConfirmDialog
                isOpen={confirmClear}
                onClose={() => setConfirmClear(false)}
                onConfirm={handleClearChat}
                title="¿Vaciar chat?"
                description="Solo se borrará en tu dispositivo. Los demás miembros seguirán viendo los mensajes."
                confirmText="Vaciar"
                variant="danger"
            />

            {viewAvatarOpen && selectedGroup.AvatarUrl && (
                <div className="fixed inset-0 z-[500] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6"
                     onClick={() => setViewAvatarOpen(false)}>
                    <button onClick={() => setViewAvatarOpen(false)}
                            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    <img
                        src={selectedGroup.AvatarUrl}
                        alt={selectedGroup.Name}
                        className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
                        onClick={e => e.stopPropagation()}
                    />
                    <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/70 text-sm font-medium">{selectedGroup.Name}</p>
                </div>
            )}
        </div>
    );
};

const GroupChatWindow = ({ onStartGroupCall }) => {
    return (
        <GroupMessagingProvider>
            <GroupChatWindowInner onStartGroupCall={onStartGroupCall} />
        </GroupMessagingProvider>
    );
};

export default GroupChatWindow;
