import Avatar from '../../../components/ui/Avatar';
import { formatChatTimestamp } from '../../../utils/format';
import type { GlobalSearchChat } from '../../../types/api';
import type { GlobalSearchStatus } from '../hooks/useGlobalMessageSearch';
import { splitByRanges } from '../lib/searchHighlight';

interface MessageSearchResultsProps {
    status: GlobalSearchStatus;
    chats: GlobalSearchChat[];
    /** Abre el chat/grupo en el mensaje indicado. */
    onOpen: (chat: GlobalSearchChat, messageID: number) => void;
}

const note = (text: string) => (
    <div role="status" className="px-3 py-3 text-sm text-slate-500">{text}</div>
);

/** Sección "Mensajes" de la barra lateral: coincidencias agrupadas por chat con el fragmento resaltado. */
const MessageSearchResults = ({ status, chats, onOpen }: MessageSearchResultsProps) => {
    if (status === 'idle') return null;

    return (
        <section aria-label="Mensajes" className="pt-2">
            <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Mensajes</div>
            {status === 'loading' && note('Buscando mensajes…')}
            {status === 'error' && note('No se pudo buscar mensajes')}
            {status === 'ready' && chats.length === 0 && note('Sin resultados')}
            {status === 'ready' && chats.map(chat => {
                const newest = chat.results[0];
                const extra = chat.total - chat.results.length;
                return (
                    <div key={`${chat.kind}:${chat.key}`} data-chat-key={`${chat.kind}:${chat.key}`} className="mb-1">
                        <button
                            type="button"
                            data-chat-header
                            onClick={() => { if (newest) onOpen(chat, newest.messageID); }}
                            className="w-full text-left flex items-center gap-3 px-3 pt-2 pb-1 rounded-xl hover:bg-white/[0.04] transition-colors"
                        >
                            <Avatar src={chat.avatarUrl || undefined} name={chat.name} size="sm" />
                            <span className="font-semibold text-[14px] text-slate-100 truncate">{chat.name}</span>
                            {chat.kind === 'group' && (
                                <span className="text-[10px] font-medium bg-indigo-500/15 text-indigo-300 px-1.5 py-0.5 rounded-md">Grupo</span>
                            )}
                        </button>
                        <ul className="pl-6 pr-1">
                            {chat.results.map(result => (
                                <li key={result.messageID}>
                                    <button
                                        type="button"
                                        data-result-id={result.messageID}
                                        onClick={() => onOpen(chat, result.messageID)}
                                        className="w-full text-left flex items-baseline justify-between gap-2 px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
                                    >
                                        <span className="text-[13px] text-slate-300 truncate">
                                            {splitByRanges(result.snippet, result.highlights).map((seg, i) => (
                                                seg.match
                                                    ? <mark key={i} className="search-mark">{seg.text}</mark>
                                                    : <span key={i}>{seg.text}</span>
                                            ))}
                                        </span>
                                        <span className="text-[11px] text-slate-500 flex-shrink-0">{formatChatTimestamp(result.time)}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                        {extra > 0 && <div className="pl-9 pr-3 pb-1 text-[11px] text-slate-500">+{extra} más</div>}
                    </div>
                );
            })}
        </section>
    );
};

export default MessageSearchResults;
