import { useEffect, useRef, useState, type JSX } from 'react';
import { useEscapeToClose } from '../../../../hooks/useEscapeToClose';

interface FullEmojiPickerProps {
    onSelect: (emoji: string) => void;
    onClose: () => void;
}

/**
 * Full emoji picker dialog (`emoji-picker-element`). The web component and its
 * Spanish i18n are fetched with a dynamic import the first time this opens, so
 * they stay out of the main bundle; the emoji data comes from our own origin.
 */
export default function FullEmojiPicker({ onSelect, onClose }: FullEmojiPickerProps): JSX.Element {
    const hostRef = useRef<HTMLDivElement>(null);
    const [failed, setFailed] = useState(false);
    const onSelectRef = useRef(onSelect);
    useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

    useEscapeToClose(onClose, true);

    useEffect(() => {
        let cancelled = false;
        let cleanup = () => {};
        import('./emojiPickerLoader')
            .then(({ createEmojiPicker }) => {
                const host = hostRef.current;
                if (cancelled || !host) return;
                const picker = createEmojiPicker();
                picker.style.width = '100%';
                picker.style.height = '360px';
                const onEmojiClick = (event: Event) => {
                    const detail = (event as CustomEvent<{ unicode?: string }>).detail;
                    if (detail?.unicode) onSelectRef.current(detail.unicode);
                };
                picker.addEventListener('emoji-click', onEmojiClick);
                host.appendChild(picker);
                cleanup = () => {
                    picker.removeEventListener('emoji-click', onEmojiClick);
                    picker.remove();
                };
            })
            .catch((err: unknown) => {
                console.error('Error loading emoji picker:', err);
                if (!cancelled) setFailed(true);
            });
        return () => { cancelled = true; cleanup(); };
    }, []);

    return (
        <div className="fixed inset-0 z-modal bg-scrim backdrop-blur-sm flex items-center justify-center p-4"
             onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div role="dialog" aria-label="Elegir emoji"
                 className="bg-slate-900 border border-fg/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-fg/5">
                    <h2 className="font-semibold text-fg">Elegir emoji</h2>
                    <button onClick={onClose} aria-label="Cerrar"
                            className="text-slate-400 hover:text-fg p-1 rounded-full hover:bg-fg/10">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                {failed && <p role="alert" className="p-4 text-sm text-red-400">No se pudo cargar el selector de emojis</p>}
                <div ref={hostRef} />
            </div>
        </div>
    );
}
