// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Sidebar from './Sidebar';
import { useDashboard, type DashboardContextValue, type MuteTarget, type SidebarView } from '../context/DashboardContext';
import type { Message } from '../../../types/api';

// Per-chat mute (WP9): muted chats/groups carry a 🔇 (aria-label "Silenciado"); unread still counts.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { username: 'ana' } }) }));
vi.mock('../../status/context/StatusContext', () => ({ useStatus: () => ({ hasUnseen: false }) }));
vi.mock('../../status/components/StatusList', () => ({ default: () => null }));
vi.mock('../../../components/CallHistory', () => ({ default: () => null }));
vi.mock('../api/searchApi', () => ({ searchAll: vi.fn() }));

const mockUseDashboard = vi.mocked(useDashboard);

const msg = (id: number, from: string): Message => ({
    MessageID: id, SenderTelephon: from, Receptor: '111', Message: `hola ${id}`, Status: 'entregado',
    Time: `2026-01-01T10:0${id}:00Z`, Edited: false,
});
const groupRow = (id: number, name: string) => ({
    ID: id, Name: name, CreatorTelephon: '111', MemberCount: 2, UserRole: 'member', CreatedAt: '2026-01-01T00:00:00Z',
});

describe('Sidebar muted icon', () => {
    let container: HTMLDivElement;
    let root: Root;

    const renderView = (view: SidebarView) => {
        mockUseDashboard.mockReturnValue({
            contacts: [
                { Number: '222', ContactName: 'Luis', Username: 'luis', Status: 'accepted' },
                { Number: '333', ContactName: 'Marta', Username: 'marta', Status: 'accepted' },
            ],
            onlineUsers: new Set(), selected: null, setSelected: vi.fn(),
            sidebarView: view, setSidebarView: vi.fn(), setSidebarOpen: vi.fn(),
            lastSeenMap: {}, avatarMap: {}, isConnected: true, myAvatar: '', profile: { Telephon: '111' },
            messagesByChat: { '222': [msg(1, '222'), msg(2, '222')], '333': [msg(3, '333')] }, allChatGroups: {}, logout: vi.fn(),
            groups: [groupRow(9, 'Equipo'), groupRow(10, 'Familia')], selectedGroup: null, setSelectedGroup: vi.fn(),
            openMessageAt: vi.fn(), addToast: vi.fn(),
            isMuted: (t: MuteTarget) => (t.kind === 'direct' ? t.key === '222' : t.id === 9),
        } as unknown as DashboardContextValue);
        act(() => { root.render(<Sidebar onOpenProfile={vi.fn()} onAddContact={vi.fn()} onCreateGroup={vi.fn()} />); });
    };
    const row = (name: string) => Array.from(container.querySelectorAll('button'))
        .find(b => b.querySelector('span.font-semibold')?.textContent?.startsWith(name));

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('marks only the muted chat, whose unread badge still counts', () => {
        renderView('chats');
        const luis = row('Luis');
        const marta = row('Marta');
        const icon = luis?.querySelector('[aria-label="Silenciado"]');
        expect(icon?.textContent).toBe('🔇');
        expect(marta?.querySelector('[aria-label="Silenciado"]')).toBeNull();
        expect(luis?.querySelector('[aria-label="2 mensajes no leídos"]')?.textContent).toBe('2');
        expect(marta?.querySelector('[aria-label="1 mensaje no leído"]')?.textContent).toBe('1');
    });

    it('marks only the muted group', () => {
        renderView('groups');
        expect(row('Equipo')?.querySelector('[aria-label="Silenciado"]')).not.toBeNull();
        expect(row('Familia')?.querySelector('[aria-label="Silenciado"]')).toBeNull();
    });
});
