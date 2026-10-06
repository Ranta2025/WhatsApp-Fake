import type { JSX } from 'react';

/** Quick-reaction defaults (the backend accepts any single emoji; "+" opens the full picker). */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

interface ReactionPickerProps {
    /** My current reaction to the message, marked as pressed. */
    currentEmoji?: string;
    /** Tapped emoji; the same as the current one toggles it off (see `reactToMessage`). */
    onSelect: (emoji: string) => void;
    /** "+" button: the owner opens the lazy-loaded full picker. */
    onMore: () => void;
}

/** Quick row of reactions shown at the top of the message menu. */
export default function ReactionPicker({ currentEmoji, onSelect, onMore }: ReactionPickerProps): JSX.Element {
    return (
        <div className="flex items-center justify-between gap-0.5 px-1 py-1" role="group" aria-label="Reacciones rápidas">
            {QUICK_REACTIONS.map(emoji => {
                const pressed = emoji === currentEmoji;
                return (
                    <button
                        key={emoji}
                        type="button"
                        aria-label={`Reaccionar con ${emoji}`}
                        aria-pressed={pressed}
                        onClick={() => onSelect(emoji)}
                        className={`h-8 w-8 rounded-full text-lg leading-none transition-transform hover:scale-125 ${pressed ? 'bg-indigo-500/40 ring-1 ring-indigo-300' : 'hover:bg-fg/10'}`}
                    >
                        {emoji}
                    </button>
                );
            })}
            <button
                type="button"
                aria-label="Más emojis"
                onClick={onMore}
                className="h-8 w-8 rounded-full bg-fg/10 text-slate-200 hover:bg-fg/20 flex items-center justify-center"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" />
                </svg>
            </button>
        </div>
    );
}
