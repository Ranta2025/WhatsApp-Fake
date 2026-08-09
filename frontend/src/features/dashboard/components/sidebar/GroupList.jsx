import React from 'react';

const GroupList = ({
    debouncedSearchQuery,
    groups,
    selectedGroup,
    setSelectedGroup,
    setSidebarOpen,
    onCreateGroup,
}) => {
    const filtered = (groups || []).filter(g => {
        if (!debouncedSearchQuery) return true;
        return (g.Name || '').toLowerCase().includes(debouncedSearchQuery.toLowerCase());
    });

    return (
        <>
            <div className="flex justify-between items-center mb-3 px-2">
                <div className="text-slate-600 text-xs font-medium uppercase tracking-wider">
                    {debouncedSearchQuery ? 'Resultados' : 'Grupos'}
                </div>
                <button
                    onClick={onCreateGroup}
                    className="text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 px-3 py-1.5 rounded-lg transition-colors font-medium border border-amber-500/10"
                >
                    + Nuevo
                </button>
            </div>
            <div className="space-y-0.5">
                {filtered.length === 0 ? (
                    <div className="text-center text-slate-600 py-10 text-sm">
                        {debouncedSearchQuery ? 'No se encontraron grupos' : 'No perteneces a ningun grupo'}
                        {!debouncedSearchQuery && (
                            <div className="mt-3">
                                <button
                                    onClick={onCreateGroup}
                                    className="text-amber-400 hover:text-amber-300 text-xs font-medium transition-colors"
                                >
                                    Crear tu primer grupo
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    filtered.map(g => (
                        <button
                            key={g.ID}
                            onClick={() => {
                                setSelectedGroup(g);
                                setSidebarOpen(false);
                            }}
                            className={`relative w-full text-left rounded-xl px-3 py-2.5 transition-all flex items-center gap-3 ${
                                selectedGroup?.ID === g.ID 
                                    ? 'bg-white/[0.05]' 
                                    : 'hover:bg-white/[0.03]'
                            }`}
                        >
                            {selectedGroup?.ID === g.ID && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-r-full bg-amber-500" />
                            )}
                            <div className="w-11 h-11 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-full flex items-center justify-center text-base font-bold text-white flex-shrink-0 overflow-hidden">
                                {g.AvatarUrl
                                    ? <img src={g.AvatarUrl} alt={g.Name} className="w-full h-full object-cover" />
                                    : g.Name?.charAt(0)?.toUpperCase()
                                }
                            </div>

                            <div className="flex-1 overflow-hidden min-w-0">
                                <div className="flex justify-between items-baseline mb-0.5">
                                    <div className="text-sm font-medium text-slate-200 truncate">{g.Name}</div>
                                    {g.UserRole === 'admin' && (
                                        <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded-full ml-2 flex-shrink-0 font-medium border border-amber-500/10">
                                            admin
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-slate-500 truncate">
                                    {g.MemberCount} miembros{g.Description ? ` · ${g.Description}` : ''}
                                </div>
                            </div>
                        </button>
                    ))
                )}
            </div>
        </>
    );
};

export default React.memo(GroupList);
