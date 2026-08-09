import React from 'react';

const ChatList = ({
    debouncedSearchQuery,
    contacts,
    messagesByChat,
    allChatGroups,
    selected,
    setSelected,
    avatarMap,
    isContactOnline,
    getUnreadCount,
    formatLastMessage,
}) => {
    return (
        <>
            <div className="text-slate-600 text-xs font-medium uppercase tracking-wider mb-3 px-2">
                {debouncedSearchQuery ? 'Resultados' : 'Chats'}
            </div>
            <div className="space-y-0.5">
                {(() => {
                    const shownNumbers = new Set();
                    const acceptedContacts = contacts.filter(c => c.Status === 'accepted').map(c => c.Number);
                    const allNumbers = Array.from(new Set([
                        ...acceptedContacts,
                        ...Object.keys(messagesByChat)
                    ]));

                    const filteredNumbers = allNumbers.filter(contactNumber => {
                        if (!debouncedSearchQuery) return true;
                        const contact = contacts.find(c => c.Number === contactNumber);
                        const group = allChatGroups[contactNumber];
                        const displayName = contact?.ContactName || group?.ContactName || group?.ContactUsername || '';
                        return displayName.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) || contactNumber.includes(debouncedSearchQuery);
                    });

                    if (filteredNumbers.length === 0 && debouncedSearchQuery) {
                        return <div className="text-center text-slate-600 py-10 text-sm">No se encontraron chats</div>;
                    }

                    return filteredNumbers.map((contactNumber) => {
                        if (shownNumbers.has(contactNumber)) return null;
                        shownNumbers.add(contactNumber);

                        const messages = messagesByChat[contactNumber] || [];
                        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
                        const contact = contacts.find(c => c.Number === contactNumber);
                        const group = allChatGroups[contactNumber];
                        const displayName = contact?.ContactName || group?.ContactName || group?.ContactUsername || contactNumber;
                        const isUnknown = group && !group.IsContact;
                        const unread = getUnreadCount(contact || { Number: contactNumber });

                        return (
                            <button
                                key={contactNumber}
                                onClick={() => {
                                    const contactToSelect = contact || {
                                        Number: contactNumber,
                                        Username: group?.ContactUsername || contactNumber,
                                        ContactName: group?.ContactName || null,
                                        Status: 'unknown'
                                    };
                                    setSelected(contactToSelect);
                                }}
                                className={`relative w-full text-left rounded-xl px-3 py-2.5 transition-all flex items-center gap-3 ${
                                    selected?.Number === contactNumber 
                                        ? 'bg-white/[0.05]' 
                                        : 'hover:bg-white/[0.03]'
                                }`}
                            >
                                {selected?.Number === contactNumber && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-r-full bg-sky-500" />
                                )}
                                <div className="relative w-11 h-11 rounded-full flex items-center justify-center text-base font-medium text-white overflow-hidden flex-shrink-0 bg-gradient-to-br from-slate-700 to-slate-600">
                                    {avatarMap[contactNumber] ? (
                                        <img src={avatarMap[contactNumber]} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        displayName?.charAt(0)?.toUpperCase()
                                    )}
                                    {isContactOnline(contactNumber) && (
                                        <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-[#0B1120]" />
                                    )}
                                </div>
                                <div className="flex-1 overflow-hidden min-w-0">
                                    <div className="flex justify-between items-baseline mb-0.5">
                                        <div className="text-sm font-medium text-slate-200 truncate flex items-center gap-1.5">
                                            {displayName}
                                            {isUnknown && (
                                                <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded-full font-medium border border-amber-500/10">
                                                    nuevo
                                                </span>
                                            )}
                                        </div>
                                        {lastMessage?.Time && (
                                            <div className="text-[10px] text-slate-600 flex-shrink-0 ml-2">
                                                {new Date(lastMessage.Time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-xs text-slate-500 truncate pr-6">
                                        {formatLastMessage(lastMessage)}
                                    </div>
                                </div>
                                {unread > 0 && (
                                    <span className="absolute top-1/2 -translate-y-1/2 right-3 min-w-[18px] h-[18px] rounded-full bg-sky-500 text-white text-[10px] font-semibold flex items-center justify-center px-1 shadow-lg shadow-sky-500/20">
                                        {unread}
                                    </span>
                                )}
                            </button>
                        );
                    });
                })()}
            </div>
        </>
    );
};

export default React.memo(ChatList);
