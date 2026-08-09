import { useState, useEffect } from 'react';
import { useDashboard } from '../context/DashboardContext';

const MAX_CONTACTS = 5;

const ForwardMessageModal = ({ isOpen, onClose, onForward, message }) => {
    const { contacts, avatarMap } = useDashboard();
    const [selected, setSelected] = useState([]);
    const [search, setSearch] = useState('');

    // Reset state each time it opens
    useEffect(() => {
        if (isOpen) {
            setSelected([]);
            setSearch('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const getMessagePreview = () => {
        if (!message) return '';
        if (message.MediaType && message.MediaType !== 'text') {
            const labels = { image: '📷 Imagen', video: '🎥 Vídeo', audio: '🎵 Audio', file: '📄 Archivo' };
            return labels[message.MediaType] || '📎 Archivo adjunto';
        }
        const text = message.Message || '';
        return text.length > 60 ? text.substring(0, 60) + '…' : text;
    };

    const toggleContact = (number) => {
        setSelected(prev =>
            prev.includes(number)
                ? prev.filter(n => n !== number)
                : prev.length < MAX_CONTACTS
                    ? [...prev, number]
                    : prev
        );
    };

    const handleForward = () => {
        if (selected.length === 0) return;
        onForward(selected);
        onClose();
    };

    const filteredContacts = (contacts || []).filter(c => {
        const name = (c.ContactName || c.Username || '').toLowerCase();
        const number = (c.Number || '').toLowerCase();
        const q = search.toLowerCase();
        return name.includes(q) || number.includes(q);
    });

    return (
        <div
            className="fixed inset-0 bg-[#0B1120]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-700/50 flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-700/50 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h2 className="text-lg font-semibold text-slate-100">Reenviar mensaje</h2>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{getMessagePreview()}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex-shrink-0 p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 rounded-lg transition-colors"
                        aria-label="Cerrar"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Search */}
                <div className="px-4 pt-4 pb-2">
                    <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Buscar contacto..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-slate-900 text-slate-100 pl-9 pr-4 py-2.5 rounded-xl border border-white/10 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm placeholder:text-slate-500"
                        />
                    </div>
                    {selected.length === MAX_CONTACTS && (
                        <p className="text-xs text-amber-400 font-medium mt-2 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            </svg>
                            Máximo {MAX_CONTACTS} contactos
                        </p>
                    )}
                </div>

                {/* Contact list */}
                <div className="flex-1 overflow-y-auto px-2 pb-2">
                    {filteredContacts.length === 0 ? (
                        <p className="text-center text-slate-500 text-sm py-8">No se encontraron contactos</p>
                    ) : (
                        filteredContacts.map(contact => {
                            const isSelected = selected.includes(contact.Number);
                            const isDisabled = selected.length >= MAX_CONTACTS && !isSelected;
                            const displayName = contact.ContactName || contact.Username || contact.Number;

                            return (
                                <button
                                    key={contact.Number}
                                    onClick={() => !isDisabled && toggleContact(contact.Number)}
                                    disabled={isDisabled}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left ${
                                        isDisabled
                                            ? 'opacity-40 cursor-not-allowed'
                                            : isSelected
                                                ? 'bg-indigo-600/20 hover:bg-indigo-600/30'
                                                : 'hover:bg-slate-700/50'
                                    }`}
                                >
                                    {/* Avatar */}
                                    <div className="relative w-10 h-10 flex-shrink-0">
                                        {avatarMap?.[contact.Number] ? (
                                            <img
                                                src={avatarMap[contact.Number]}
                                                alt={displayName}
                                                className="w-10 h-10 rounded-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-slate-700 border border-white/5 flex items-center justify-center text-sm font-bold text-indigo-400">
                                                {displayName.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </div>

                                    {/* Name */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-100 truncate">{displayName}</p>
                                        <p className="text-xs text-slate-500 truncate">{contact.Number}</p>
                                    </div>

                                    {/* Checkbox */}
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                        isSelected
                                            ? 'bg-indigo-600 border-indigo-600'
                                            : 'border-slate-500'
                                    }`}>
                                        {isSelected && (
                                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-slate-700/50 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">
                        {selected.length > 0 ? `${selected.length} seleccionado${selected.length > 1 ? 's' : ''}` : 'Selecciona destinatarios'}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-300 rounded-xl border border-slate-600/60 hover:bg-slate-700/50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleForward}
                            disabled={selected.length === 0}
                            className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 ${
                                selected.length === 0
                                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30'
                            }`}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                            </svg>
                            Reenviar{selected.length > 0 ? ` (${selected.length})` : ''}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ForwardMessageModal;
