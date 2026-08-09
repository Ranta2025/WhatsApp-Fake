import { useState } from 'react';
import { useDashboard } from '../../context/DashboardContext';
import Modal from '../../../../components/ui/Modal';

export default function AddMembersModal({ isOpen, onClose, group }) {
    const { contacts, addToast, fetchUserGroups } = useDashboard();
    const [selected, setSelected] = useState(new Set());
    const [search, setSearch]     = useState('');
    const [loading, setLoading]   = useState(false);

    const existingMembers = new Set((group?.Members || []).map(m => m.Telephon));
    const candidates = contacts.filter(c =>
        c.Status === 'accepted' &&
        !existingMembers.has(c.Number) &&
        ((c.ContactName||'').toLowerCase().includes(search.toLowerCase()) ||
         (c.Username||'').toLowerCase().includes(search.toLowerCase()) ||
         c.Number.includes(search))
    );

    const toggle = (num) => setSelected(prev => {
        const next = new Set(prev);
        next.has(num) ? next.delete(num) : next.add(num);
        return next;
    });

    const submit = async () => {
        if (!selected.size) return;
        setLoading(true);
        try {
            const { addGroupMembers } = await import('../../../../api/groupApi');
            await addGroupMembers(group.ID, Array.from(selected));
            addToast({ type: 'success', message: 'Miembros añadidos' });
            await fetchUserGroups();
            onClose();
        } catch (err) {
            addToast({ type: 'error', message: err?.response?.data?.error || 'Error al añadir miembros' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Añadir miembros" maxWidth="max-w-sm">
            <div className="space-y-4">
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar contacto..."
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
                />
                <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                    {candidates.map(c => (
                        <button key={c.Number} type="button" onClick={() => toggle(c.Number)}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-left ${selected.has(c.Number) ? 'bg-indigo-600/20' : 'hover:bg-white/5'}`}>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected.has(c.Number) ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600'}`}>
                                {selected.has(c.Number) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <div className="w-9 h-9 bg-slate-700 rounded-full flex items-center justify-center text-sm font-semibold text-white overflow-hidden flex-shrink-0">
                                {(c.ContactName || c.Username)?.charAt(0)?.toUpperCase()}
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <div className="font-medium text-slate-100 truncate text-sm">{c.ContactName || c.Username}</div>
                                <div className="text-xs text-slate-500 truncate">{c.Number}</div>
                            </div>
                        </button>
                    ))}
                    {candidates.length === 0 && <p className="text-center text-slate-500 py-6 text-sm">No hay contactos disponibles</p>}
                </div>
                <div className="flex gap-3 pt-2">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors">Cancelar</button>
                    <button onClick={submit} disabled={loading || !selected.size}
                            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
                        {loading ? 'Añadiendo...' : `Añadir (${selected.size})`}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
