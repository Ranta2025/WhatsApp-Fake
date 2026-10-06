import type { JSX } from 'react';
import type { ReactionSummary } from '../../../../types/api';

interface ReactionChipsProps {
    reactions: ReactionSummary[] | undefined;
    /** Toggle my reaction to this emoji (same emoji removes it). */
    onToggle: (emoji: string) => void;
    /** Open the "Reacciones" who-reacted modal. */
    onShowWho: () => void;
    /** Horizontal alignment under the bubble. */
    align?: 'start' | 'end';
}

/**
 * Reaction chips under a message bubble (1:1 and group): `emoji count`, mine
 * highlighted, tap to toggle. A separate "Ver reacciones" control lists who.
 */
export default function ReactionChips({ reactions, onToggle, onShowWho, align = 'start' }: ReactionChipsProps): JSX.Element | null {
    if (!reactions || reactions.length === 0) return null;
    return (
        <div className={`flex flex-wrap items-center gap-1 -mt-1 relative z-10 ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
            {reactions.map(({ Emoji, Count, Mine }) => (
                <button
                    key={Emoji}
                    type="button"
                    aria-pressed={Mine}
                    aria-label={Mine ? `${Emoji} ${Count}, reaccionaste` : `${Emoji} ${Count}`}
                    onClick={() => onToggle(Emoji)}
                    className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs shadow-sm transition-colors
                        ${Mine ? 'border-indigo-400 bg-indigo-500/30 text-fg' : 'border-fg/10 bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
                >
                    <span aria-hidden="true">{Emoji}</span>
                    <span aria-hidden="true">{Count}</span>
                </button>
            ))}
            <button
                type="button"
                aria-label="Ver reacciones"
                onClick={onShowWho}
                className="rounded-full px-1.5 py-0.5 text-[11px] text-slate-400 hover:text-fg hover:bg-fg/10"
            >
                Ver
            </button>
        </div>
    );
}
