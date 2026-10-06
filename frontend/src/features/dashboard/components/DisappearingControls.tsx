import { useState, type ChangeEvent } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { canEditInfo } from '../lib/groupPermissions';
import {
    DISAPPEAR_OPTIONS, disappearOptionLabel, formatDisappearDuration, formatDisappearShort, parseExpiresAt,
} from '../lib/disappearing';

/**
 * Disappearing-messages UI: selector (1:1 info panel and group info panel),
 * header chip and the bubble clock. The server enforces who can change the
 * timer; the group gating here mirrors `requireCanEditInfo` for convenience.
 */

const CLOCK_PATH = 'M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z';

const ClockGlyph = ({ className }: { className: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d={CLOCK_PATH} />
    </svg>
);

interface SelectorProps {
    value: number;
    /** Absent = read-only text. Resolves false when saving failed. */
    onChange?: (seconds: number) => Promise<boolean>;
    readOnlyHint?: string;
}

const NOTE = 'Los mensajes nuevos desaparecerán del chat después del tiempo elegido. '
    + 'Las copias fuera del chat (capturas, reenvíos, notificaciones) no se eliminan.';

const DisappearingSelector = ({ value, onChange, readOnlyHint }: SelectorProps) => {
    const [pending, setPending] = useState(false);

    const handle = async (e: ChangeEvent<HTMLSelectElement>) => {
        if (!onChange) return;
        const next = Number(e.target.value);
        setPending(true);
        try {
            await onChange(next);
        } catch (err) {
            // The context setters toast and resolve false; a rejection is unexpected.
            console.error('Error changing disappearing messages:', err);
        } finally {
            setPending(false);
        }
    };

    return (
        <div className="bg-fg/5 rounded-xl p-4 border border-fg/5 w-full" data-testid="disappearing-section">
            <div className="text-xs text-indigo-300/70 mb-3 uppercase tracking-wider font-semibold">Mensajes temporales</div>
            {onChange ? (
                <div className="flex items-center gap-2">
                    <select
                        aria-label="Mensajes temporales"
                        value={String(value)}
                        onChange={e => { void handle(e); }}
                        disabled={pending}
                        className="flex-1 bg-slate-800 text-fg text-sm rounded-lg border border-fg/10 px-3 py-2 disabled:opacity-60"
                    >
                        {DISAPPEAR_OPTIONS.map(s => (
                            <option key={s} value={String(s)}>{disappearOptionLabel(s)}</option>
                        ))}
                    </select>
                    {pending && (
                        <span data-testid="disappearing-pending" role="status" className="text-xs text-indigo-300">Guardando…</span>
                    )}
                </div>
            ) : (
                <>
                    <div className="text-sm text-fg font-medium" data-testid="disappearing-readonly">{disappearOptionLabel(value)}</div>
                    {readOnlyHint && <p className="text-xs text-amber-200/80 mt-2">{readOnlyHint}</p>}
                </>
            )}
            <p className="text-xs text-slate-400 mt-3">{NOTE}</p>
        </div>
    );
};

/** 1:1 contact info panel section. */
export const ChatDisappearingSection = () => {
    const { selected, selectedDisappearSeconds, setChatDisappearing } = useDashboard();
    if (!selected) return null;
    return (
        <DisappearingSelector
            key={selected.Number}
            value={selectedDisappearSeconds}
            onChange={seconds => setChatDisappearing(selected.Number, seconds)}
        />
    );
};

/** Group info panel section: editable when the user can edit the group info. */
export const GroupDisappearingSection = () => {
    const { selectedGroup, selectedDisappearSeconds, setGroupDisappearing } = useDashboard();
    if (!selectedGroup) return null;
    const editable = canEditInfo(selectedGroup.UserRole, selectedGroup);
    return (
        <div className="px-5 py-4">
            <DisappearingSelector
                key={selectedGroup.ID}
                value={selectedDisappearSeconds}
                onChange={editable ? seconds => setGroupDisappearing(selectedGroup.ID, seconds) : undefined}
                readOnlyHint={selectedGroup.UserRole === 'left' ? undefined : 'Solo los administradores pueden cambiar esta opción'}
            />
        </div>
    );
};

/** Header chip, rendered only while a timer is active. */
export const DisappearingChip = ({ seconds }: { seconds: number }) => {
    if (!(seconds > 0)) return null;
    return (
        <span
            data-testid="disappearing-chip"
            aria-label={`Mensajes temporales activados: ${formatDisappearDuration(seconds)}`}
            className="inline-flex items-center gap-1 flex-shrink-0 rounded-full bg-indigo-500/15 text-indigo-200 text-[11px] font-medium px-2 py-0.5"
        >
            <ClockGlyph className="w-3 h-3" />
            {`Mensajes temporales: ${formatDisappearShort(seconds)}`}
        </span>
    );
};

/** Small clock next to the bubble time; only for a valid `ExpiresAt`. */
export const ExpiryClock = ({ expiresAt }: { expiresAt: string | undefined }) => {
    if (parseExpiresAt(expiresAt) === undefined) return null;
    return (
        <svg
            data-testid="expiry-clock"
            role="img"
            aria-label="Mensaje temporal"
            className="w-3 h-3 flex-shrink-0 opacity-70"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
            <title>Mensaje temporal</title>
            <path strokeLinecap="round" strokeLinejoin="round" d={CLOCK_PATH} />
        </svg>
    );
};
