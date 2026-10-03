import { useEffect, useState, type JSX } from 'react';
import { getReactions } from '../../../../api/reactionApi';
import Avatar from '../../../../components/ui/Avatar';
import { useEscapeToClose } from '../../../../hooks/useEscapeToClose';
import { getResponseError } from '../../../../lib/errors';
import type { ReactionUsersEntry } from '../../../../types/api';

export interface ReactionsModalTarget {
    kind: 'direct' | 'group';
    messageID: number;
    groupID?: number;
}

interface ReactionsModalProps {
    target: ReactionsModalTarget;
    /** Telephon of the viewer, shown as "Tú". */
    myTelephon: string | undefined;
    onClose: () => void;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; reactions: ReactionUsersEntry[] };

/** Who reacted to a message, with an "all" view and a filter per emoji. */
export default function ReactionsModal({ target, myTelephon, onClose }: ReactionsModalProps): JSX.Element {
    const [state, setState] = useState<LoadState>({ status: 'loading' });
    const [filter, setFilter] = useState<string | null>(null);
    const { kind, messageID, groupID } = target;

    useEscapeToClose(onClose, true);

    useEffect(() => {
        let cancelled = false;
        getReactions(kind, messageID, groupID)
            .then(({ reactions }) => {
                if (!cancelled) setState({ status: 'ready', reactions });
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                console.error('Error loading reactions:', err);
                setState({ status: 'error', message: getResponseError(err) ?? 'No se pudieron cargar las reacciones' });
            });
        return () => { cancelled = true; };
    }, [kind, messageID, groupID]);

    const entries = state.status === 'ready' ? state.reactions : [];
    const visible = filter === null ? entries : entries.filter(e => e.emoji === filter);
    const rows = visible.flatMap(e => e.users.map(user => ({ emoji: e.emoji, user })));
    const total = entries.reduce((sum, e) => sum + e.users.length, 0);
    const tabClass = (active: boolean) =>
        `shrink-0 rounded-full px-2.5 py-1 text-xs ${active ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`;

    return (
        <div className="fixed inset-0 z-modal bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div role="dialog" aria-label="Reacciones"
                 className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-white/5">
                    <h2 className="font-semibold text-white">Reacciones</h2>
                    <button onClick={onClose} aria-label="Cerrar"
                            className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                {state.status === 'ready' && entries.length > 0 && (
                    <div className="flex gap-1.5 overflow-x-auto px-4 py-2 border-b border-white/5">
                        <button type="button" aria-label="Ver todas" aria-pressed={filter === null}
                                onClick={() => setFilter(null)} className={tabClass(filter === null)}>
                            Todas {total}
                        </button>
                        {entries.map(e => (
                            <button key={e.emoji} type="button" aria-label={`Ver solo ${e.emoji}`} aria-pressed={filter === e.emoji}
                                    onClick={() => setFilter(e.emoji)} className={tabClass(filter === e.emoji)}>
                                {e.emoji} {e.users.length}
                            </button>
                        ))}
                    </div>
                )}
                <div className="flex-1 overflow-y-auto">
                    {state.status === 'loading' && (
                        <p role="status" className="p-4 text-sm text-slate-400">Cargando…</p>
                    )}
                    {state.status === 'error' && (
                        <p role="alert" className="p-4 text-sm text-red-400">{state.message}</p>
                    )}
                    {state.status === 'ready' && rows.length === 0 && (
                        <p className="p-4 text-sm text-slate-500">Nadie ha reaccionado</p>
                    )}
                    {state.status === 'ready' && rows.length > 0 && (
                        <ul className="px-4 py-2">
                            {rows.map(({ emoji, user }) => (
                                <li key={`${emoji}:${user.telephon}`} className="flex items-center gap-3 py-1.5">
                                    <Avatar src={user.avatarUrl} name={user.username} size="sm" />
                                    <span className="flex-1 text-sm text-slate-100 truncate">
                                        {user.telephon === myTelephon ? 'Tú' : user.username}
                                    </span>
                                    <span className="text-lg" aria-hidden="true">{emoji}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
