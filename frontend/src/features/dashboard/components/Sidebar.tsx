import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { useAuth } from '../../../context/AuthContext';
import { useStatus } from '../../status/context/StatusContext';
import CallHistory from '../../../components/CallHistory';
import Avatar from '../../../components/ui/Avatar';
import StatusList from '../../status/components/StatusList';
import { formatChatTimestamp, formatLastSeen, previewMessage } from '../../../utils/format';
import type { ContactChat, Message } from '../../../types/api';
import type { LocalGroup } from '../context/DashboardContext';
import type { SidebarView } from '../context/DashboardContext';
import type { DashboardChatGroupEntry } from '../lib/chatSelection';

interface Tab {
    id: SidebarView;
    label: string;
    placeholder: string;
}

const TABS: Tab[] = [
    { id: 'chats', label: 'Chats', placeholder: 'Buscar chats' },
    { id: 'groups', label: 'Grupos', placeholder: 'Buscar grupos' },
    { id: 'contacts', label: 'Contactos', placeholder: 'Buscar contactos' },
    { id: 'estados', label: 'Estados', placeholder: 'Buscar estados' },
    { id: 'calls', label: 'Llamadas', placeholder: 'Buscar llamadas' },
];

const Icon = {
    settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
    logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
    search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    close: 'M6 18L18 6M6 6l12 12',
    userPlus: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
    groupPlus: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    chat: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
};

interface SvgProps {
    d: string;
    className?: string;
}

const Svg = ({ d, className = 'h-5 w-5' }: SvgProps) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
);

interface EmptyStateProps {
    icon: string;
    title: string;
    action?: string | null;
    onAction?: () => void;
}

const EmptyState = ({ icon, title, action, onAction }: EmptyStateProps) => (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 animate-fade-in">
        <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-slate-500 mb-4">
            <Svg d={icon} className="h-7 w-7" />
        </div>
        <p className="text-sm text-slate-400">{title}</p>
        {action && (
            <button onClick={onAction} className="mt-4 text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
                {action}
            </button>
        )}
    </div>
);

interface ListItemProps {
    active: boolean;
    onClick: () => void;
    avatar: ReactNode;
    title: ReactNode;
    badge?: ReactNode;
    subtitle?: ReactNode;
    meta?: ReactNode;
    unread?: number;
}

const ListItem = ({ active, onClick, avatar, title, badge, subtitle, meta, unread = 0 }: ListItemProps) => (
    <button
        onClick={onClick}
        className={`group w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
            active ? 'bg-indigo-500/10 ring-1 ring-inset ring-indigo-500/20' : 'hover:bg-white/[0.04]'
        }`}
    >
        {avatar}
        <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-[15px] text-slate-100 truncate flex items-center gap-1.5">
                    {title}
                    {badge}
                </span>
                {meta && (
                    <span className={`text-[11px] flex-shrink-0 ${unread > 0 ? 'text-indigo-400 font-semibold' : 'text-slate-500'}`}>
                        {meta}
                    </span>
                )}
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="text-[13px] text-slate-400 truncate">{subtitle}</span>
                {unread > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-indigo-500 text-slate-950 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </div>
        </div>
    </button>
);

interface SidebarProps {
    onOpenProfile: () => void;
    onAddContact: () => void;
    onCreateGroup: () => void;
}

interface ChatEntry {
    number: string;
    contact: ContactChat | undefined;
    group: DashboardChatGroupEntry | undefined;
    last: Message | null;
    unread: number;
    name: string;
    lastTime: number;
}

const Sidebar = ({ onOpenProfile, onAddContact, onCreateGroup }: SidebarProps) => {
    const {
        contacts, onlineUsers, selected, setSelected,
        sidebarView, setSidebarView, setSidebarOpen,
        lastSeenMap, avatarMap, isConnected, myAvatar, profile,
        messagesByChat, allChatGroups, logout,
        groups, selectedGroup, setSelectedGroup,
    } = useDashboard();
    const { user } = useAuth();
    const { hasUnseen: hasUnseenStatuses } = useStatus();

    const [searchQuery, setSearchQuery] = useState('');
    const [query, setQuery] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setQuery(searchQuery.trim().toLowerCase()), 200);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const contactByNumber = useMemo(() => {
        const map = new Map<string, ContactChat>();
        contacts.forEach(c => map.set(c.Number, c));
        return map;
    }, [contacts]);

    // Conversaciones: contactos aceptados + cualquier chat con mensajes,
    // ordenadas por la actividad más reciente.
    const chats = useMemo((): ChatEntry[] => {
        const numbers = new Set([
            ...contacts.filter(c => c.Status === 'accepted').map(c => c.Number),
            ...Object.keys(messagesByChat),
        ]);
        return Array.from(numbers)
            .map((number): ChatEntry => {
                const contact = contactByNumber.get(number);
                const group = allChatGroups[number];
                const messages = messagesByChat[number] || [];
                const last = messages[messages.length - 1] || null;
                const unread = messages.filter(m => m?.SenderTelephon === number && m.Status !== 'visto').length;
                return {
                    number,
                    contact,
                    group,
                    last,
                    unread,
                    name: contact?.ContactName || group?.ContactName || group?.ContactUsername || number,
                    lastTime: last?.Time ? new Date(last.Time).getTime() : 0,
                };
            })
            .filter(chat => !query || chat.name.toLowerCase().includes(query) || chat.number.includes(query))
            .sort((a, b) => b.lastTime - a.lastTime);
    }, [contacts, contactByNumber, allChatGroups, messagesByChat, query]);

    const filteredContacts = useMemo(() => contacts
        .filter(c => c.Status === 'accepted')
        .filter(c => !query
            || (c.ContactName || '').toLowerCase().includes(query)
            || (c.Username || '').toLowerCase().includes(query)
            || c.Number.includes(query))
        .sort((a, b) => (a.ContactName || a.Username || '').localeCompare(b.ContactName || b.Username || '')),
    [contacts, query]);

    const filteredGroups = useMemo((): LocalGroup[] => (groups || [])
        .filter(g => !query || (g.Name || '').toLowerCase().includes(query)),
    [groups, query]);

    const totalUnread = chats.reduce((sum, c) => sum + c.unread, 0);
    const activeTab = TABS.find(t => t.id === sidebarView) || TABS[0]!;

    const openChat = (chat: ChatEntry) => {
        setSelected(chat.contact || {
            Number: chat.number,
            Username: chat.group?.ContactUsername || chat.number,
            ContactName: chat.group?.ContactName || null,
            Status: 'unknown',
        });
    };

    return (
        <aside className={`
            bg-slate-900 border-r border-white/[0.06] flex flex-col min-h-0
            ${(selected || selectedGroup) ? 'hidden lg:flex lg:w-[380px]' : 'w-full lg:w-[380px]'}
        `}>
            {/* Cabecera: perfil y acciones */}
            <header className="px-4 pt-4 pb-3 flex items-center justify-between gap-3">
                <button
                    onClick={onOpenProfile}
                    className="flex items-center gap-3 min-w-0 rounded-xl p-1 -m-1 hover:bg-white/[0.04] transition-colors text-left"
                    title="Ver perfil"
                >
                    <Avatar src={myAvatar} name={user?.username} size="md" online={isConnected} />
                    <div className="min-w-0">
                        <div className="font-semibold text-slate-100 truncate">{user?.username}</div>
                        <div className="text-xs text-slate-500 truncate flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-indigo-400' : 'bg-amber-400 animate-pulse'}`} />
                            {isConnected ? (profile?.Telephon || 'Conectado') : 'Conectando…'}
                        </div>
                    </div>
                </button>
                <div className="flex items-center gap-0.5">
                    <button onClick={onOpenProfile} className="icon-btn" title="Ajustes" aria-label="Abrir ajustes de perfil">
                        <Svg d={Icon.settings} />
                    </button>
                    <button onClick={logout} className="icon-btn hover:!text-rose-400" title="Cerrar sesión" aria-label="Cerrar sesión">
                        <Svg d={Icon.logout} />
                    </button>
                </div>
            </header>

            {/* Búsqueda */}
            <div className="px-4 pb-3">
                <div className="relative">
                    <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-slate-500">
                        <Svg d={Icon.search} className="h-4 w-4" />
                    </span>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-slate-800/70 border border-transparent text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/40 focus:bg-slate-800 transition-colors"
                        placeholder={`${activeTab.placeholder}…`}
                        aria-label={activeTab.placeholder}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute inset-y-0 right-2.5 flex items-center text-slate-500 hover:text-slate-300"
                            aria-label="Limpiar búsqueda"
                        >
                            <Svg d={Icon.close} className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Pestañas (control segmentado) */}
            <nav className="px-4 pb-2" role="tablist">
                <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-slate-950/60 border border-white/[0.04]">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            role="tab"
                            aria-selected={sidebarView === tab.id}
                            onClick={() => setSidebarView(tab.id)}
                            className={`relative py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                                sidebarView === tab.id
                                    ? 'bg-slate-800 text-slate-100 shadow-sm'
                                    : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            {tab.label}
                            {tab.id === 'chats' && totalUnread > 0 && (
                                <span className="absolute -top-1 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-indigo-500 text-slate-950 text-[10px] font-bold flex items-center justify-center">
                                    {totalUnread > 99 ? '99+' : totalUnread}
                                </span>
                            )}
                            {tab.id === 'estados' && hasUnseenStatuses && (
                                <span
                                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400"
                                    aria-label="Hay estados nuevos"
                                />
                            )}
                        </button>
                    ))}
                </div>
            </nav>

            <div className="flex-1 overflow-y-auto px-2 pb-4">
                {sidebarView === 'chats' && (
                    chats.length === 0 ? (
                        <EmptyState
                            icon={Icon.chat}
                            title={query ? 'No se encontraron chats' : 'Aún no tienes conversaciones'}
                            action={!query ? 'Agregar un contacto' : null}
                            onAction={onAddContact}
                        />
                    ) : (
                        <div className="space-y-0.5 pt-1">
                            {chats.map(chat => (
                                <ListItem
                                    key={chat.number}
                                    active={selected?.Number === chat.number}
                                    onClick={() => openChat(chat)}
                                    avatar={<Avatar src={avatarMap[chat.number]} name={chat.name} size="lg" online={onlineUsers.has(chat.number)} />}
                                    title={chat.name}
                                    badge={chat.group && !chat.group.IsContact && !chat.contact && (
                                        <span className="text-[10px] font-medium bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded-md">nuevo</span>
                                    )}
                                    subtitle={chat.last ? previewMessage(chat.last) : 'Toca para empezar a chatear'}
                                    meta={chat.last ? formatChatTimestamp(chat.last.Time) : ''}
                                    unread={chat.unread}
                                />
                            ))}
                        </div>
                    )
                )}

                {sidebarView === 'calls' && (
                    <CallHistory
                        contacts={contacts}
                        searchQuery={query}
                        onSelectContact={(contact) => setSelected(contact)}
                    />
                )}

                {sidebarView === 'contacts' && (
                    <>
                        <button
                            onClick={onAddContact}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors text-left mt-1"
                        >
                            <span className="w-12 h-12 rounded-full bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
                                <Svg d={Icon.userPlus} />
                            </span>
                            <span className="font-medium text-slate-100">Nuevo contacto</span>
                        </button>
                        {filteredContacts.length === 0 ? (
                            <EmptyState icon={Icon.userPlus} title={query ? 'No se encontraron contactos' : 'Todavía no tienes contactos'} />
                        ) : (
                            <div className="space-y-0.5">
                                <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                    {filteredContacts.length} contacto{filteredContacts.length !== 1 ? 's' : ''}
                                </div>
                                {filteredContacts.map(c => {
                                    const online = onlineUsers.has(c.Number);
                                    return (
                                        <ListItem
                                            key={c.Number}
                                            active={selected?.Number === c.Number}
                                            onClick={() => setSelected(c)}
                                            avatar={<Avatar src={avatarMap[c.Number]} name={c.ContactName || c.Username} size="lg" online={online} />}
                                            title={c.ContactName || c.Username}
                                            subtitle={online ? <span className="text-indigo-400">en línea</span> : (formatLastSeen(lastSeenMap[c.Number]) || c.Number)}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {sidebarView === 'estados' && <StatusList />}

                {sidebarView === 'groups' && (
                    <>
                        <button
                            onClick={onCreateGroup}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors text-left mt-1"
                        >
                            <span className="w-12 h-12 rounded-full bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
                                <Svg d={Icon.groupPlus} />
                            </span>
                            <span className="font-medium text-slate-100">Nuevo grupo</span>
                        </button>
                        {filteredGroups.length === 0 ? (
                            <EmptyState icon={Icon.groupPlus} title={query ? 'No se encontraron grupos' : 'No perteneces a ningún grupo'} />
                        ) : (
                            <div className="space-y-0.5 pt-1">
                                {filteredGroups.map(g => (
                                    <ListItem
                                        key={g.ID}
                                        active={selectedGroup?.ID === g.ID}
                                        onClick={() => { setSelectedGroup(g); setSidebarOpen(false); }}
                                        avatar={<Avatar src={g.AvatarUrl} name={g.Name} size="lg" />}
                                        title={g.Name}
                                        badge={g.UserRole === 'admin' && (
                                            <span className="text-[10px] font-medium bg-indigo-500/15 text-indigo-300 px-1.5 py-0.5 rounded-md">admin</span>
                                        )}
                                        subtitle={`${g.MemberCount} miembro${g.MemberCount !== 1 ? 's' : ''}${g.Description ? ` · ${g.Description}` : ''}`}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
