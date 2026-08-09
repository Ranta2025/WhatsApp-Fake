import React from 'react';
import { useAuth } from '../../../../context/AuthContext';

const SidebarHeader = ({ profile, myAvatar, isConnected, onOpenProfile, logout }) => {
    const { user } = useAuth();

    return (
        <div className="p-4 flex items-center justify-between border-b border-white/[0.04]">
            <div className="flex items-center gap-3">
                <div
                    className="relative w-9 h-9 rounded-full cursor-pointer flex-shrink-0 overflow-hidden"
                    title="Ver perfil"
                    onClick={onOpenProfile}
                >
                    {myAvatar ? (
                        <img src={myAvatar} alt="avatar" className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                        <div className="w-9 h-9 bg-gradient-to-tr from-sky-500 to-indigo-600 rounded-full flex items-center justify-center font-bold text-white text-sm">
                            {user?.username?.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#0B1120] ${isConnected ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                </div>
                <div className="overflow-hidden">
                    <div className="text-sm font-semibold text-white truncate">{user?.username}</div>
                    <div className="text-xs text-slate-500 truncate">{profile?.Telephon || 'Cargando...'}</div>
                </div>
            </div>
            <div className="flex gap-0.5">
                <button
                    onClick={onOpenProfile}
                    className="p-2 text-slate-500 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors"
                    title="Ajustes"
                    aria-label="Abrir ajustes de perfil"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>
                <button
                    onClick={logout}
                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-white/[0.04] rounded-lg transition-colors"
                    title="Cerrar Sesion"
                    aria-label="Cerrar sesion"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default React.memo(SidebarHeader);
