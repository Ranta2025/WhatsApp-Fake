import React, { useState, useMemo } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { createGroup } from '../../../api/groupApi';

/**
 * Modal to create a new group chat.
 *
 * Props:
 *   isOpen   {boolean}  - controls visibility
 *   onClose  {function} - called when the modal is dismissed
 */
const CreateGroupModal = ({ isOpen, onClose }) => {
    const { contacts, addToast, fetchUserGroups } = useDashboard();

    const [name, setName]               = useState('');
    const [description, setDescription] = useState('');
    const [selectedMembers, setSelectedMembers] = useState(new Set());
    const [memberSearch, setMemberSearch]       = useState('');
    const [loading, setLoading] = useState(false);

    const acceptedContacts = useMemo(
        () => contacts.filter(c => c.Status === 'accepted'),
        [contacts]
    );

    const filteredContacts = useMemo(() => {
        const q = memberSearch.toLowerCase();
        if (!q) return acceptedContacts;
        return acceptedContacts.filter(c =>
            (c.ContactName || '').toLowerCase().includes(q) ||
            (c.Username || '').toLowerCase().includes(q) ||
            c.Number.includes(q)
        );
    }, [acceptedContacts, memberSearch]);

    const toggleMember = (telephon) => {
        setSelectedMembers(prev => {
            const next = new Set(prev);
            next.has(telephon) ? next.delete(telephon) : next.add(telephon);
            return next;
        });
    };

    const handleClose = () => {
        setName('');
        setDescription('');
        setSelectedMembers(new Set());
        setMemberSearch('');
        onClose();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim()) {
            addToast({ type: 'error', message: 'Escribe un nombre para crear el grupo' });
            return;
        }
        if (selectedMembers.size === 0) {
            addToast({ type: 'error', message: 'Elige al menos una persona para comenzar el grupo' });
            return;
        }

        setLoading(true);
        try {
            await createGroup(name.trim(), description.trim(), Array.from(selectedMembers));
            addToast({ type: 'success', message: `El grupo "${name.trim()}" ya está listo` });
            await fetchUserGroups();
            handleClose();
        } catch (err) {
            console.error('[CreateGroupModal] Error:', err);
            const msg = err?.response?.data?.error || 'No pudimos crear el grupo en este momento.';
            addToast({ type: 'error', message: msg });
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={handleClose}
        >
            <div
                className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.94))] shadow-[0_32px_120px_-48px_rgba(15,23,42,0.95)]"
                onClick={e => e.stopPropagation()}
            >
                <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.18),transparent_42%),linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                            <div className="inline-flex items-center rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200">Grupos</div>
                            <h2 className="mt-3 text-xl font-semibold text-white">Nuevo grupo</h2>
                            <p className="mt-1 text-sm text-slate-400">Reúne a las personas correctas y empieza una conversación con identidad propia.</p>
                        </div>
                        <button
                            onClick={handleClose}
                            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                            aria-label="Cerrar"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-slate-300">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2"><span className="block text-slate-500">Miembros</span><span className="mt-1 block font-semibold text-white">{selectedMembers.size}</span></div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2"><span className="block text-slate-500">Nombre</span><span className="mt-1 block font-semibold text-white">{name.trim() ? 'Definido' : 'Por definir'}</span></div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2"><span className="block text-slate-500">Selección</span><span className="mt-1 block truncate font-semibold text-white">{memberSearch || 'Lista completa'}</span></div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="space-y-4 border-b border-white/10 p-5">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">
                                Nombre del grupo <span className="text-red-400">*</span>
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                maxLength={60}
                                placeholder="Nombre del grupo"
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">
                                Descripción <span className="text-slate-500 text-xs">(opcional)</span>
                            </label>
                            <input
                                type="text"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                maxLength={200}
                                placeholder="Descripción breve del grupo"
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col flex-1 overflow-hidden p-5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-slate-300">
                                Invitar personas
                                {selectedMembers.size > 0 && (
                                    <span className="ml-2 text-amber-300">({selectedMembers.size} elegidos)</span>
                                )}
                            </span>
                        </div>

                        <input
                            type="text"
                            value={memberSearch}
                            onChange={e => setMemberSearch(e.target.value)}
                            placeholder="Buscar contactos..."
                            className="mb-3 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                        />

                        <div className="flex-1 space-y-1 overflow-y-auto rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-2 pr-1">
                            {filteredContacts.length === 0 && (
                                <p className="text-center text-slate-500 py-8 text-sm">
                                    {acceptedContacts.length === 0
                                        ? 'Cuando tengas contactos disponibles podrás crear tu grupo aquí'
                                        : 'No encontramos coincidencias con esa búsqueda'}
                                </p>
                            )}
                            {filteredContacts.map(c => {
                                const checked = selectedMembers.has(c.Number);
                                return (
                                    <button
                                        key={c.Number}
                                        type="button"
                                        onClick={() => toggleMember(c.Number)}
                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-left ${
                                            checked ? 'bg-amber-400/12 ring-1 ring-amber-300/20' : 'hover:bg-white/5'
                                        }`}
                                    >
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                            checked ? 'border-amber-400 bg-amber-400' : 'border-slate-600'
                                        }`}>
                                            {checked && (
                                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>

                                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[linear-gradient(135deg,rgba(251,191,36,0.22),rgba(59,130,246,0.22))] text-sm font-semibold text-white">
                                            {(c.ContactName || c.Username)?.charAt(0)?.toUpperCase()}
                                        </div>

                                        <div className="flex-1 overflow-hidden">
                                            <div className="font-medium text-slate-100 truncate text-sm">
                                                {c.ContactName || c.Username}
                                            </div>
                                            <div className="text-xs text-slate-500 truncate">{c.Number}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex gap-3 border-t border-white/10 p-5">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="flex-1 rounded-2xl bg-slate-800 py-3 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !name.trim() || selectedMembers.size === 0}
                            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#f59e0b,#ea580c)] py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loading ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                    </svg>
                                    Creando...
                                </>
                            ) : (
                                'Crear grupo'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateGroupModal;
