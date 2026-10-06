import Avatar from '../../../components/ui/Avatar';
import StatusRing from './StatusRing';
import { useStatus } from '../context/StatusContext';
import { useDashboard } from '../../dashboard/context/DashboardContext';
import { formatStatusTimestamp } from '../../../utils/format';
import type { StatusContactGroup } from '../../../types/api';

const PlusIcon = ({ className = 'h-3.5 w-3.5' }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
);

interface ContactRowProps {
    group: StatusContactGroup;
    onOpen: (telephon: string) => void;
}

const ContactRow = ({ group, onOpen }: ContactRowProps) => {
    const name = group.ContactName || group.Username || group.Telephon;
    const segments = group.Statuses.map(s => s.Viewed);
    return (
        <button
            onClick={() => onOpen(group.Telephon)}
            className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-fg/[0.04] transition-colors"
        >
            <StatusRing segments={segments} size={52}>
                <Avatar src={group.AvatarUrl} name={name} size="lg" />
            </StatusRing>
            <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px] text-slate-100 truncate">{name}</div>
                <div className="text-[13px] text-slate-400 truncate">{formatStatusTimestamp(group.LastUpdated)}</div>
            </div>
        </button>
    );
};

/**
 * Panel de la pestaña "Estados": mi estado (crear/ver), estados recientes
 * (contactos con al menos un estado sin ver) y vistos (todos vistos).
 */
const StatusList = () => {
    const { feed, loading, openComposer, openMyViewer, openContactViewer } = useStatus();
    const { myAvatar, profile } = useDashboard();

    const mine = feed.Mine || [];
    const contacts = feed.Contacts || [];
    const recientes = contacts.filter(g => !g.AllViewed);
    const vistos = contacts.filter(g => g.AllViewed);

    const lastMine = mine.length > 0 ? mine[mine.length - 1] : null;
    const mineSegments = mine.map(() => true); // los propios no distinguen visto/no-visto para el dueño

    return (
        <div className="pt-1 pb-2">
            {/* Mi estado */}
            <div className="flex items-center gap-3 px-3 py-2.5">
                <div className="relative flex-shrink-0">
                    <button
                        onClick={mine.length > 0 ? openMyViewer : openComposer}
                        className="block"
                        aria-label={mine.length > 0 ? 'Ver mi estado' : 'Añadir estado'}
                    >
                        {mine.length > 0 ? (
                            <StatusRing segments={mineSegments} size={52} solid="#6366f1">
                                <Avatar src={myAvatar} name={profile?.Username} size="lg" />
                            </StatusRing>
                        ) : (
                            <Avatar src={myAvatar} name={profile?.Username} size="lg" />
                        )}
                    </button>
                    <button
                        onClick={openComposer}
                        aria-label="Añadir una actualización de estado"
                        className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-indigo-500 text-on-accent flex items-center justify-center ring-2 ring-slate-900 hover:bg-indigo-400 transition-colors"
                    >
                        <PlusIcon />
                    </button>
                </div>
                <button
                    onClick={mine.length > 0 ? openMyViewer : openComposer}
                    className="flex-1 min-w-0 text-left"
                >
                    <div className="font-semibold text-[15px] text-slate-100">Mi estado</div>
                    <div className="text-[13px] text-slate-400 truncate">
                        {lastMine ? formatStatusTimestamp(lastMine.CreatedAt) : 'Toca para añadir una actualización de estado'}
                    </div>
                </button>
            </div>

            {loading && contacts.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-slate-500">Cargando estados…</div>
            )}

            {recientes.length > 0 && (
                <div className="mt-2">
                    <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Recientes</div>
                    <div className="space-y-0.5">
                        {recientes.map(g => (
                            <ContactRow key={g.Telephon} group={g} onOpen={openContactViewer} />
                        ))}
                    </div>
                </div>
            )}

            {vistos.length > 0 && (
                <div className="mt-2">
                    <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Vistos</div>
                    <div className="space-y-0.5">
                        {vistos.map(g => (
                            <ContactRow key={g.Telephon} group={g} onOpen={openContactViewer} />
                        ))}
                    </div>
                </div>
            )}

            {!loading && contacts.length === 0 && (
                <div className="px-3 py-10 text-center text-sm text-slate-500">
                    Todavía no hay estados de tus contactos
                </div>
            )}
        </div>
    );
};

export default StatusList;
