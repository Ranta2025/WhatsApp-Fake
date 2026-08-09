import React from 'react';

const ContactList = ({
    debouncedSearchQuery,
    contacts,
    selected,
    setSelected,
    avatarMap,
    isContactOnline,
    lastSeenMap,
    onAddContact,
}) => {
    const filteredContacts = contacts.filter(c => {
        if (c.Status !== 'accepted') return false;
        if (!debouncedSearchQuery) return true;
        const query = debouncedSearchQuery.toLowerCase();
        return (c.ContactName || '').toLowerCase().includes(query) ||
               (c.Username || '').toLowerCase().includes(query) ||
               c.Number.includes(query);
    });

    return (
        <>
            <div className="flex justify-between items-center mb-3 px-2">
                <div className="text-slate-600 text-xs font-medium uppercase tracking-wider">
                    {debouncedSearchQuery ? 'Resultados' : 'Contactos'}
                </div>
                <button
                    onClick={onAddContact}
                    className="text-xs bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 px-3 py-1.5 rounded-lg transition-colors font-medium border border-sky-500/10"
                >
                    + Agregar
                </button>
            </div>
            <div className="space-y-0.5">
                {filteredContacts.length === 0 ? (
                    <div className="text-center text-slate-600 py-10 text-sm">No se encontraron contactos</div>
                ) : (
                    filteredContacts.map((c) => (
                        <button
                            key={c.Number}
                            onClick={() => setSelected(c)}
                            className={`relative w-full text-left rounded-xl px-3 py-2.5 transition-all flex items-center gap-3 ${
                                selected?.Number === c.Number 
                                    ? 'bg-white/[0.05]' 
                                    : 'hover:bg-white/[0.03]'
                            }`}
                        >
                            {selected?.Number === c.Number && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-r-full bg-sky-500" />
                            )}
                            <div className="relative w-11 h-11 rounded-full flex items-center justify-center text-base font-medium text-white overflow-hidden flex-shrink-0 bg-gradient-to-br from-slate-700 to-slate-600">
                                {avatarMap[c.Number] ? (
                                    <img src={avatarMap[c.Number]} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    (c.ContactName || c.Username)?.charAt(0)?.toUpperCase()
                                )}
                                {isContactOnline(c.Number) && (
                                    <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-[#0B1120]" />
                                )}
                            </div>
                            <div className="flex-1 overflow-hidden min-w-0">
                                <div className="text-sm font-medium text-slate-200 truncate">{c.ContactName || c.Username}</div>
                                <div className="text-xs text-slate-500 truncate">
                                    {isContactOnline(c.Number) 
                                        ? 'En linea' 
                                        : (lastSeenMap[c.Number] 
                                            ? `Ult. vez: ${new Date(lastSeenMap[c.Number]).toLocaleTimeString()}` 
                                            : c.Number)
                                    }
                                </div>
                            </div>
                        </button>
                    ))
                )}
            </div>
        </>
    );
};

export default React.memo(ContactList);
