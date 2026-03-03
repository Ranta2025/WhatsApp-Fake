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
            addToast({ type: 'error', message: 'El nombre del grupo es obligatorio' });
            return;
        }
        if (selectedMembers.size === 0) {
            addToast({ type: 'error', message: 'Añade al menos un miembro al grupo' });
            return;
        }

        setLoading(true);
        try {
            await createGroup(name.trim(), description.trim(), Array.from(selectedMembers));
            addToast({ type: 'success', message: `Grupo "${name.trim()}" creado` });
            await fetchUserGroups();
            handleClose();
        } catch (err) {
            console.error('[CreateGroupModal] Error:', err);
            const msg = err?.response?.data?.error || 'Error al crear el grupo';
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
                className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <h2 className="text-lg font-semibold text-white">Nuevo grupo</h2>
                    <button
                        onClick={handleClose}
                        className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                        aria-label="Cerrar"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="p-5 space-y-4 border-b border-white/5">
                        {/* Group name */}
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
                                className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                            />
                        </div>

                        {/* Description */}
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
                                className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                            />
                        </div>
                    </div>

                    {/* Member picker */}
                    <div className="flex flex-col flex-1 overflow-hidden p-5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-slate-300">
                                Añadir miembros
                                {selectedMembers.size > 0 && (
                                    <span className="ml-2 text-indigo-400">({selectedMembers.size} seleccionados)</span>
                                )}
                            </span>
                        </div>

                        {/* Search contacts */}
                        <input
                            type="text"
                            value={memberSearch}
                            onChange={e => setMemberSearch(e.target.value)}
                            placeholder="Buscar contactos..."
                            className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm mb-3"
                        />

                        {/* Contact list */}
                        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                            {filteredContacts.length === 0 && (
                                <p className="text-center text-slate-500 py-8 text-sm">
                                    {acceptedContacts.length === 0
                                        ? 'No tienes contactos aceptados'
                                        : 'No se encontraron contactos'}
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
                                            checked ? 'bg-indigo-600/20' : 'hover:bg-white/5'
                                        }`}
                                    >
                                        {/* Checkbox indicator */}
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                            checked ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600'
                                        }`}>
                                            {checked && (
                                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>

                                        {/* Avatar */}
                                        <div className="w-9 h-9 bg-slate-700 rounded-full flex items-center justify-center text-sm font-semibold text-white overflow-hidden flex-shrink-0">
                                            {(c.ContactName || c.Username)?.charAt(0)?.toUpperCase()}
                                        </div>

                                        {/* Info */}
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

                    {/* Footer */}
                    <div className="p-5 border-t border-white/5 flex gap-3">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !name.trim() || selectedMembers.size === 0}
                            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
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
