import { useEffect, useState, type JSX } from 'react';
import { getGroupMessageReceipts } from '../../../api/groupApi';
import Avatar from '../../../components/ui/Avatar';
import { useEscapeToClose } from '../../../hooks/useEscapeToClose';
import { getResponseError } from '../../../lib/errors';
import { normalizeGroupReceipts } from '../lib/normalizeResponses';
import type { GroupMemberBrief, GroupMessageReceipts, GroupMessageResponse } from '../../../types/api';

interface GroupMessageInfoModalProps {
    message: GroupMessageResponse;
    onClose: () => void;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; receipts: GroupMessageReceipts };

const MemberRow = ({ member }: { member: GroupMemberBrief }): JSX.Element => (
    <li className="flex items-center gap-3 py-1.5">
        <Avatar src={member.avatarUrl} name={member.username} size="sm" />
        <span className="text-sm text-slate-100 truncate">{member.username}</span>
    </li>
);

const Section = ({ title, members, alwaysShow }: { title: string; members: GroupMemberBrief[]; alwaysShow: boolean }): JSX.Element | null => {
    if (members.length === 0 && !alwaysShow) return null;
    return (
        <section className="px-4 py-3 border-t border-fg/5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">{title}</h3>
            {members.length === 0
                ? <p className="text-sm text-slate-500 py-1">Nadie todavía</p>
                : <ul>{members.map(m => <MemberRow key={m.telephon} member={m} />)}</ul>}
        </section>
    );
};

/**
 * "Info" de un mensaje de grupo propio: quién lo leyó y a quién se entregó.
 * El backend solo responde al autor del mensaje (403 en otro caso).
 */
export default function GroupMessageInfoModal({ message, onClose }: GroupMessageInfoModalProps): JSX.Element {
    const [state, setState] = useState<LoadState>({ status: 'loading' });
    const { groupID, messageID } = message;

    useEscapeToClose(onClose, true);

    useEffect(() => {
        let cancelled = false;
        getGroupMessageReceipts(groupID, messageID)
            .then(({ data }) => {
                if (!cancelled) setState({ status: 'ready', receipts: normalizeGroupReceipts(data) });
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                console.error('Error loading group message receipts:', err);
                setState({ status: 'error', message: getResponseError(err) ?? 'No se pudo cargar la información del mensaje' });
            });
        return () => { cancelled = true; };
    }, [groupID, messageID]);

    return (
        <div className="fixed inset-0 z-modal bg-scrim backdrop-blur-sm flex items-center justify-center p-4"
             onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div role="dialog" aria-label="Info del mensaje"
                 className="bg-slate-900 border border-fg/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-fg/5">
                    <h2 className="font-semibold text-fg">Info del mensaje</h2>
                    <button onClick={onClose} aria-label="Cerrar"
                            className="text-slate-400 hover:text-fg p-1 rounded-full hover:bg-fg/10">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="px-4 py-3 text-sm text-slate-200 break-words bg-indigo-600/20">
                    {message.message || 'Mensaje multimedia'}
                </div>
                <div className="flex-1 overflow-y-auto">
                    {state.status === 'loading' && (
                        <p role="status" className="p-4 text-sm text-slate-400">Cargando…</p>
                    )}
                    {state.status === 'error' && (
                        <p role="alert" className="p-4 text-sm text-red-400">{state.message}</p>
                    )}
                    {state.status === 'ready' && (
                        <>
                            <Section title="Leído por" members={state.receipts.readBy} alwaysShow />
                            <Section title="Entregado a" members={state.receipts.deliveredTo} alwaysShow />
                            <Section title="Sin entregar" members={state.receipts.pending} alwaysShow={false} />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
