import React from 'react';

const placeholders = {
    chats: 'Buscar chats...',
    calls: 'Buscar llamadas...',
    statuses: 'Buscar estados...',
    groups: 'Buscar grupos...',
    contacts: 'Buscar contactos...',
};

const ariaLabels = {
    chats: 'Buscar en tus chats activos',
    calls: 'Buscar en tu historial de llamadas',
    statuses: 'Buscar entre estados activos',
    groups: 'Buscar en tus grupos',
    contacts: 'Buscar en tu lista de contactos',
};

const SidebarSearch = ({ searchQuery, setSearchQuery, sidebarView }) => {
    return (
        <div className="p-3 bg-transparent">
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="block w-full pl-9 pr-9 py-2.5 border border-white/[0.05] rounded-xl leading-5 bg-white/[0.02] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500/20 focus:ring-1 focus:ring-sky-500/10 sm:text-sm transition-all"
                    placeholder={placeholders[sidebarView] || placeholders.contacts}
                    aria-label={ariaLabels[sidebarView] || ariaLabels.contacts}
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery('')}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                        aria-label="Limpiar busqueda"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
};

export default React.memo(SidebarSearch);
