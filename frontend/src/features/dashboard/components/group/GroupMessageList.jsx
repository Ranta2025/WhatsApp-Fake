import React, { useEffect } from 'react';
import GroupMessageBubble from './GroupMessageBubble';
import { useGroupMessaging } from '../../hooks/useGroupMessaging';
import { useScrollToBottom } from '../../../../hooks/useScrollToBottom';

const GroupMessageList = React.memo(function GroupMessageList({ groupID, messages, myTelephon, activeWallpaper }) {
    const {
        containerRef,
        bottomRef,
        showJump: showJumpToBottom,
        onScroll: handleScroll,
        jump,
        handleNewItems,
    } = useScrollToBottom([groupID]);

    const {
        handleEditMessage, handleDeleteMessage, handleDeleteMessageForMe,
        handleReplyToMessage, messageMenuOpen, setMessageMenuOpen,
    } = useGroupMessaging();

    useEffect(() => {
        handleNewItems(messages?.length || 0);
    }, [messages?.length, handleNewItems]);

    const containerStyle = activeWallpaper
        ? { backgroundImage: `url(${activeWallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
        : { backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23334155' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` };

    if (!messages || messages.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm" style={containerStyle}>
                No hay mensajes aún. ¡Sé el primero en escribir!
            </div>
        );
    }

    return (
        <div className="relative flex-1 min-h-0">
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="h-full overflow-y-auto py-3 space-y-0.5"
                style={containerStyle}
            >
                {messages.map((msg) => {
                    if (msg.IsSystem) {
                        return (
                            <div key={msg.MessageID} className="flex justify-center py-1 px-4">
                                <span className="bg-black/40 backdrop-blur-sm text-slate-300 text-xs px-3 py-1 rounded-full">
                                    {msg.Message}
                                </span>
                            </div>
                        );
                    }
                    return (
                        <GroupMessageBubble
                            key={msg.MessageID}
                            msg={msg}
                            isMine={msg.SenderTelephon === myTelephon}
                            onEdit={handleEditMessage}
                            onDelete={handleDeleteMessage}
                            onReply={handleReplyToMessage}
                            onDeleteForMe={handleDeleteMessageForMe}
                            menuOpen={messageMenuOpen}
                            setMenuOpen={setMessageMenuOpen}
                        />
                    );
                })}
                <div ref={bottomRef} />
            </div>

            {showJumpToBottom && (
                <button
                    type="button"
                    onClick={jump}
                    className="absolute bottom-4 right-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#1a2235] text-slate-300 shadow-lg border border-white/[0.06] transition-all hover:scale-105 hover:bg-[#232d42]"
                    aria-label="Ir al final del chat"
                    title="Ir al final"
                >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                </button>
            )}
        </div>
    );
});

export default GroupMessageList;
