// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GroupMessageBubble } from './GroupChatWindow';
import type { GroupMessageResponse, MessageStatus } from '../../../types/api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));

const msg: GroupMessageResponse = {
    messageID: 9, groupID: 5, senderTelephon: '111', senderUsername: 'ana', message: 'hola',
    time: '2026-01-01T10:00:00Z', edited: false,
};

describe('GroupMessageBubble receipts (ticks + Info)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const onInfo = vi.fn();
    const setMenuOpen = vi.fn();

    const renderBubble = (over: { isMine?: boolean; status?: MessageStatus; withInfo?: boolean; menuOpen?: number | null } = {}) => {
        act(() => {
            root.render(
                <GroupMessageBubble
                    msg={msg}
                    isMine={over.isMine ?? true}
                    replySender=""
                    onEdit={vi.fn()}
                    onDelete={vi.fn()}
                    onReply={vi.fn()}
                    onDeleteForMe={vi.fn()}
                    menuOpen={over.menuOpen ?? null}
                    setMenuOpen={setMenuOpen}
                    status={over.status}
                    onInfo={over.withInfo === false ? undefined : onInfo}
                />,
            );
        });
    };
    const tickLabel = () => container.querySelector('svg[role="img"]')?.getAttribute('aria-label') ?? null;
    const menuButtons = () => Array.from(document.body.querySelectorAll('button')).map(b => b.textContent?.trim());

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('draws the derived tick on my messages', () => {
        renderBubble({ status: 'enviado' });
        expect(tickLabel()).toBe('Enviado');
        renderBubble({ status: 'entregado' });
        expect(tickLabel()).toBe('Entregado');
        renderBubble({ status: 'visto' });
        expect(tickLabel()).toBe('Visto');
    });

    it('draws no tick on other people\'s messages', () => {
        renderBubble({ isMine: false, status: 'visto' });
        expect(tickLabel()).toBeNull();
    });

    it('offers "Info" only on my messages and reports the message when clicked', () => {
        renderBubble({ menuOpen: 9 });
        expect(menuButtons()).toContain('Info');

        act(() => {
            Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Info')?.click();
        });
        expect(onInfo).toHaveBeenCalledWith(msg);
        expect(setMenuOpen).toHaveBeenCalledWith(null);
    });

    it('has no "Info" entry for other people\'s messages', () => {
        renderBubble({ isMine: false, menuOpen: 9 });
        expect(menuButtons()).not.toContain('Info');
    });
});
