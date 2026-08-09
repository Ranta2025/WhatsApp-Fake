import React from 'react';
import { useAuth } from '../../../../context/AuthContext';

const StatusList = ({
    debouncedSearchQuery,
    statusFeed,
    selectedStatusOwner,
    setSelectedStatusOwner,
    setSidebarView,
    myAvatar,
    onCreateStatus,
}) => {
    const { user } = useAuth();
    const myThread = statusFeed?.myStatuses || null;
    const contactThreads = Array.isArray(statusFeed?.contacts) ? statusFeed.contacts : [];
    const filteredThreads = contactThreads.filter((thread) => {
        if (!debouncedSearchQuery) return true;
        const query = debouncedSearchQuery.toLowerCase();
        return (thread.ownerName || '').toLowerCase().includes(query)
            || (thread.ownerUsername || '').toLowerCase().includes(query)
            || thread.ownerTelephon.includes(query);
    });

    return (
        <>
            <div className="flex justify-between items-center mb-3 px-2">
                <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider">
                    {debouncedSearchQuery ? 'Resultados de busqueda' : 'Estados activos'}
                </div>
                <button
                    onClick={onCreateStatus}
                    className="text-xs bg-sky-500 hover:bg-sky-400 text-slate-950 px-3 py-1.5 rounded-lg transition-colors font-semibold"
                >
                    + Publicar
                </button>
            </div>
            <div className="space-y-0.5">
                <button
                    onClick={() => {
                        if (myThread?.ownerTelephon) {
                            setSelectedStatusOwner(myThread.ownerTelephon);
                        }
                        setSidebarView('statuses');
                    }}
                    className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors flex items-center gap-3 ${selectedStatusOwner === myThread?.ownerTelephon ? 'bg-white/[0.06] border-l-2 border-sky-500' : 'hover:bg-white/[0.04]'}`}
                >
                    <div className={`relative w-11 h-11 rounded-full p-[2px] ${myThread?.statuses?.length ? 'bg-gradient-to-br from-sky-400 via-cyan-400 to-indigo-500' : 'bg-white/10'}`}>
                                <div className="w-full h-full rounded-full overflow-hidden bg-[#0B1120]">
                            {myAvatar ? (
                                <img src={myAvatar} alt="Mi avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-base font-medium text-white bg-gradient-to-br from-slate-700 to-slate-600">
                                    {user?.username?.charAt(0)?.toUpperCase()}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-100 truncate">Mi estado</div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
                            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${myThread?.statuses?.length ? 'bg-sky-400 shadow-[0_0_0_4px_rgba(56,189,248,0.12)]' : 'bg-slate-600'}`} />
                            <span className="truncate">{myThread?.statuses?.length ? `${myThread.statuses.length} publicacion${myThread.statuses.length === 1 ? '' : 'es'} activas` : 'Publica un texto, una foto o un video'}</span>
                        </div>
                    </div>
                </button>

                {filteredThreads.length === 0 ? (
                    <div className="text-center text-slate-600 py-10">No hay estados disponibles</div>
                ) : (
                    filteredThreads.map((thread) => (
                        <button
                            key={thread.ownerTelephon}
                            onClick={() => {
                                setSelectedStatusOwner(thread.ownerTelephon);
                                setSidebarView('statuses');
                            }}
                            className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors flex items-center gap-3 ${selectedStatusOwner === thread.ownerTelephon ? 'bg-white/[0.06] border-l-2 border-sky-500' : 'hover:bg-white/[0.04]'}`}
                        >
                            <div className={`relative w-11 h-11 rounded-full p-[2px] ${thread.hasUnviewed ? 'bg-gradient-to-br from-emerald-400 via-sky-400 to-indigo-500' : 'bg-white/10'}`}>
                        <div className="w-full h-full rounded-full overflow-hidden bg-[#0B1120]">
                                    {thread.ownerAvatar ? (
                                        <img src={thread.ownerAvatar} alt="avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-base font-medium text-white bg-gradient-to-br from-slate-700 to-slate-600">
                                            {(thread.ownerName || thread.ownerUsername || thread.ownerTelephon)?.charAt(0)?.toUpperCase()}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-slate-100 truncate">{thread.ownerName}</div>
                                <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
                                    <span className={`inline-flex h-2.5 w-2.5 rounded-full ${thread.hasUnviewed ? 'bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]' : 'bg-slate-600'}`} />
                                    <span className="truncate">{thread.hasUnviewed ? 'Tiene novedades sin ver' : 'Ya viste sus estados'}</span>
                                </div>
                            </div>
                            <span className="text-[10px] text-slate-600">{thread.statuses.length}</span>
                        </button>
                    ))
                )}
            </div>
        </>
    );
};

export default React.memo(StatusList);
