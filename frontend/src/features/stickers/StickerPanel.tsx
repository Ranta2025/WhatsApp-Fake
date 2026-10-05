import type { RefObject } from 'react';
import Popover from '../../components/ui/Popover';
import { BUILTIN_PACKS } from './builtinPack';

interface StickerPanelProps {
    anchorRef: RefObject<HTMLElement | null>;
    /** Sends the picked sticker; the composer decides the media type. */
    onSelect: (url: string) => void;
    onClose: () => void;
}

const BASIC_PACK_ID = 'basic';

/**
 * Picker for the built-in sticker pack. Reuses the shared Popover for
 * positioning, outside-click and Escape handling (same pattern as
 * MediaUploadMenu). The grid is four columns of 64px thumbnails; every cell is
 * a native button labelled with the sticker's alt text, so it is reachable and
 * activatable by keyboard. Picking one sends immediately and closes the panel.
 */
export default function StickerPanel({ anchorRef, onSelect, onClose }: StickerPanelProps) {
    const stickers = BUILTIN_PACKS.find((pack) => pack.id === BASIC_PACK_ID)?.stickers ?? [];

    return (
        <Popover
            open
            onClose={onClose}
            anchorRef={anchorRef}
            className="bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-2 animate-slide-up origin-bottom-left"
        >
            <div className="grid grid-cols-4 gap-1">
                {stickers.map((sticker) => (
                    <button
                        key={sticker.id}
                        type="button"
                        aria-label={sticker.alt}
                        onClick={() => {
                            onSelect(sticker.url);
                            onClose();
                        }}
                        className="w-16 h-16 rounded-xl flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all"
                    >
                        <img
                            src={sticker.url}
                            alt=""
                            width={64}
                            height={64}
                            loading="lazy"
                            draggable={false}
                            className="w-16 h-16 object-contain"
                        />
                    </button>
                ))}
            </div>
        </Popover>
    );
}
