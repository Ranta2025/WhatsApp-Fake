import { useState } from 'react';
import { useDashboard, type MuteTarget } from '../context/DashboardContext';
import { MUTE_OPTIONS } from '../lib/mute';
import type { MuteDuration } from '../../../types/api';

/**
 * Menu items to mute / unmute one chat or group (WhatsApp style), shared by the 1:1
 * and group header menus. Muted: "Activar notificaciones". Otherwise "Silenciar
 * notificaciones" expands in place to "8 horas" / "1 semana" / "Siempre". `onDone`
 * closes the host menu as soon as a choice is made; the context toasts on failure.
 */

const BELL_OFF = 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9M3 3l18 18';
const BELL = 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9';

const ITEM = 'w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-fg/10 flex items-center gap-2';

const Glyph = ({ d }: { d: string }) => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
);

interface MuteMenuItemsProps {
    target: MuteTarget;
    onDone: () => void;
}

const MuteMenuItems = ({ target, onDone }: MuteMenuItemsProps) => {
    const { isMuted, setMute, clearMute } = useDashboard();
    const [choosing, setChoosing] = useState(false);

    if (isMuted(target)) {
        return (
            <button type="button" role="menuitem" className={ITEM}
                    onClick={() => { onDone(); void clearMute(target); }}>
                <Glyph d={BELL} />
                Activar notificaciones
            </button>
        );
    }

    const choose = (duration: MuteDuration) => {
        setChoosing(false);
        onDone();
        void setMute(target, duration);
    };

    return (
        <>
            <button type="button" role="menuitem" className={ITEM} aria-haspopup="true" aria-expanded={choosing}
                    onClick={() => setChoosing(v => !v)}>
                <Glyph d={BELL_OFF} />
                Silenciar notificaciones
            </button>
            {choosing && (
                <div role="group" aria-label="Silenciar durante" className="bg-quote">
                    {MUTE_OPTIONS.map(opt => (
                        <button key={opt.duration} type="button" role="menuitem"
                                className="w-full text-left pl-10 pr-4 py-2 text-sm text-slate-300 hover:bg-fg/10"
                                onClick={() => choose(opt.duration)}>
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </>
    );
};

export default MuteMenuItems;
