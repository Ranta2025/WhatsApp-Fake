import { useRef, useState, type JSX } from 'react';
import Popover from '../../../../components/ui/Popover';
import ReactionPicker from './ReactionPicker';

interface ReactionTriggerProps {
    currentEmoji?: string;
    onSelect: (emoji: string) => void;
    onMore: () => void;
    align: 'left' | 'right';
}

/**
 * Hover smile button next to "Opciones": opens a popover with only the quick
 * reaction row (the full menu stays behind "Opciones" / long-press).
 */
export default function ReactionTrigger({ currentEmoji, onSelect, onMore, align }: ReactionTriggerProps): JSX.Element {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen(o => !o)}
                className="p-1.5 glass rounded-full text-slate-400 hover:text-fg transition-all shadow-lg"
                aria-label="Reaccionar"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </button>
            <Popover
                open={open}
                onClose={() => setOpen(false)}
                anchorRef={triggerRef}
                align={align}
                className="bg-slate-800 border border-fg/10 rounded-full shadow-2xl animate-fade-in"
            >
                <ReactionPicker
                    currentEmoji={currentEmoji}
                    onSelect={(emoji) => { setOpen(false); onSelect(emoji); }}
                    onMore={() => { setOpen(false); onMore(); }}
                />
            </Popover>
        </>
    );
}
