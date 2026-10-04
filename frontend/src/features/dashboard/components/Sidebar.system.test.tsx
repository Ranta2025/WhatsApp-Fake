// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Sidebar from './Sidebar';
import { useDashboard, type DashboardContextValue } from '../context/DashboardContext';
import type { Message } from '../../../types/api';

// disappearing-messages (DE5): system messages are never the sidebar preview and never count as unread.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { username: 'ana' } }) }));
vi.mock('../../status/context/StatusContext', () => ({ useStatus: () => ({ hasUnseen: false }) }));
vi.mock('../../status/components/StatusList', () => ({ default: () => null }));
vi.mock('../../../components/CallHistory', () => ({ default: () => null }));
vi.mock('../api/searchApi', () => ({ searchAll: vi.fn() }));

const mockUseDashboard = vi.mocked(useDashboard);

const msg = (id: number, over: Partial<Message> = {}): Message => ({
    MessageID: id, SenderTelephon: '222', Receptor: '111', Message: `hola ${id}`, Status: 'visto',
    Time: `2026-01-01T10:0${id}:00Z`, Edited: false, ...over,
});
const sys = (id: number): Message => msg(id, { Kind: 'system', SystemEvent: 'disappearing_changed', Message: '86400', Status: 'enviado' });

describe('Sidebar system messages', () => {
    let container: HTMLDivElement;
    let root: Root;

    const renderWith = (messages: Message[]) => {
        mockUseDashboard.mockReturnValue({
            contacts: [{ Number: '222', ContactName: 'Luis', Username: 'luis', Status: 'accepted' }],
            onlineUsers: new Set(), selected: null, setSelected: vi.fn(),
            sidebarView: 'chats', setSidebarView: vi.fn(), setSidebarOpen: vi.fn(),
            lastSeenMap: {}, avatarMap: {}, isConnected: true, myAvatar: '', profile: { Telephon: '111' },
            messagesByChat: { '222': messages }, allChatGroups: {}, logout: vi.fn(),
            groups: [], selectedGroup: null, setSelectedGroup: vi.fn(),
            openMessageAt: vi.fn(), addToast: vi.fn(), isMuted: () => false,
        } as unknown as DashboardContextValue);
        act(() => { root.render(<Sidebar onOpenProfile={vi.fn()} onAddContact={vi.fn()} onCreateGroup={vi.fn()} />); });
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

    it('previews the latest real message, not the system notice after it', () => {
        renderWith([msg(1), sys(2)]);
        expect(container.textContent).toContain('hola 1');
        expect(container.textContent).not.toContain('86400');
    });

    it('shows the empty-chat copy when the only message is a system notice, and no unread badge', () => {
        renderWith([sys(2)]);
        expect(container.textContent).toContain('Toca para empezar a chatear');
        expect(container.querySelector('.bg-indigo-500.rounded-full, [aria-label*="no le"]')).toBeNull();
    });

    it('does not count the system notice in the unread badge but counts a real unseen message', () => {
        renderWith([msg(1, { Status: 'enviado' }), sys(2)]);
        const badges = Array.from(container.querySelectorAll('span')).filter(s => s.textContent === '1');
        expect(badges.length).toBeGreaterThan(0);
        expect(Array.from(container.querySelectorAll('span')).some(s => s.textContent === '2')).toBe(false);
    });
});
