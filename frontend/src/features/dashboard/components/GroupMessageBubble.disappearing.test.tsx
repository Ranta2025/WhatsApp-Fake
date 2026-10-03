// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GroupMessageBubble } from './GroupChatWindow';
import type { GroupMessageResponse } from '../../../types/api';

// disappearing-messages (DE6): clock icon on group bubbles with a valid ExpiresAt.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));

const base: GroupMessageResponse = {
    MessageID: 9, GroupID: 5, SenderTelephon: '111', SenderUsername: 'ana', Message: 'hola',
    Time: '2026-01-01T10:00:00Z', Edited: false,
};

describe('GroupMessageBubble expiry clock', () => {
    let container: HTMLDivElement;
    let root: Root;
    const render = (msg: GroupMessageResponse) => {
        act(() => {
            root.render(
                <GroupMessageBubble msg={msg} isMine={false} replySender="" onEdit={vi.fn()} onDelete={vi.fn()}
                    onReply={vi.fn()} onDeleteForMe={vi.fn()} menuOpen={null} setMenuOpen={vi.fn()} />,
            );
        });
    };
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('shows the clock only with a valid ExpiresAt', () => {
        render(base);
        expect(container.querySelector('[data-testid="expiry-clock"]')).toBeNull();
        render({ ...base, ExpiresAt: 'garbage' });
        expect(container.querySelector('[data-testid="expiry-clock"]')).toBeNull();
        render({ ...base, ExpiresAt: '2026-01-02T10:00:00Z' });
        expect(container.querySelector('[aria-label="Mensaje temporal"]')).not.toBeNull();
    });
});
