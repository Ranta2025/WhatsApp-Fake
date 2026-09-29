// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Sidebar from './Sidebar';
import { useDashboard, type DashboardContextValue } from '../context/DashboardContext';
import { searchAll } from '../api/searchApi';
import type { GlobalSearchResponse } from '../../../types/api';

// message-search (MS6): global message results in the sidebar ("Mensajes" section).

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { username: 'ana' } }) }));
vi.mock('../../status/context/StatusContext', () => ({ useStatus: () => ({ hasUnseen: false }) }));
vi.mock('../../status/components/StatusList', () => ({ default: () => null }));
vi.mock('../../../components/CallHistory', () => ({ default: () => null }));
vi.mock('../api/searchApi', () => ({ searchAll: vi.fn() }));

const mockUseDashboard = vi.mocked(useDashboard);
const mockSearchAll = vi.mocked(searchAll);

const response: GlobalSearchResponse = {
    chats: [
        {
            kind: 'direct', key: '222', name: 'Luis Alias', avatarUrl: '', total: 2,
            results: [{ messageID: 11, time: '2026-01-02T10:00:00Z', snippet: 'Qué CANCIÓN', highlights: [[4, 11]] }],
        },
        {
            kind: 'group', key: '9', name: 'Equipo demo', avatarUrl: '', total: 1,
            results: [{ messageID: 30, time: '2026-01-03T10:00:00Z', snippet: 'una canción', highlights: [[4, 11]] }],
        },
    ],
};

describe('Sidebar global message search', () => {
    let container: HTMLDivElement;
    let root: Root;
    const setSelected = vi.fn();
    const setSelectedGroup = vi.fn();
    const setSidebarOpen = vi.fn();
    const openMessageAt = vi.fn();
    const addToast = vi.fn();
    const luis = { Number: '222', ContactName: 'Luis Alias', Username: 'luis', Status: 'accepted' };
    const groupEquipo = { ID: 9, Name: 'Equipo demo', MemberCount: 3, UserRole: 'member' };

    const renderSidebar = (over: Record<string, unknown> = {}) => {
        mockUseDashboard.mockReturnValue({
            contacts: [luis], onlineUsers: new Set(), selected: null, setSelected,
            sidebarView: 'chats', setSidebarView: vi.fn(), setSidebarOpen,
            lastSeenMap: {}, avatarMap: {}, isConnected: true, myAvatar: '', profile: { Telephon: '111' },
            messagesByChat: {}, allChatGroups: {}, logout: vi.fn(),
            groups: [groupEquipo], selectedGroup: null, setSelectedGroup,
            openMessageAt, addToast,
            ...over,
        } as unknown as DashboardContextValue);
        act(() => { root.render(<Sidebar onOpenProfile={vi.fn()} onAddContact={vi.fn()} onCreateGroup={vi.fn()} />); });
    };

    const input = () => container.querySelector('input[type="text"]') as HTMLInputElement;
    const type = async (q: string, wait = 300) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        act(() => {
            setter?.call(input(), q);
            input().dispatchEvent(new Event('input', { bubbles: true }));
        });
        await act(async () => { await vi.advanceTimersByTimeAsync(wait); });
    };
    const section = () => container.querySelector('section[aria-label="Mensajes"]');

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        openMessageAt.mockResolvedValue(true);
        mockSearchAll.mockResolvedValue(response);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.useRealTimers();
    });

    it('shows no message section until something is typed', () => {
        renderSidebar();
        expect(section()).toBeNull();
        expect(mockSearchAll).not.toHaveBeenCalled();
    });

    it('searches messages 300 ms after typing and lists them grouped by chat under the name matches', async () => {
        renderSidebar();
        await type('cancion');
        expect(mockSearchAll).toHaveBeenCalledWith('cancion', expect.objectContaining({ limit: 20, perChat: 3 }));
        expect(section()?.textContent).toContain('Luis Alias');
        expect(section()?.textContent).toContain('Equipo demo');
        expect(Array.from(section()?.querySelectorAll('mark') ?? []).map(m => m.textContent)).toEqual(['CANCIÓN', 'canción']);
    });

    it('keeps the name filter working (a chat whose name matches is listed above the "Mensajes" section)', async () => {
        renderSidebar({ messagesByChat: { '222': [] } });
        await type('luis', 210);
        // el filtro por nombre responde a los 200 ms; la búsqueda de mensajes aún está en debounce
        expect(container.textContent).toContain('Luis Alias');
        expect(mockSearchAll).not.toHaveBeenCalled();
        await act(async () => { await vi.advanceTimersByTimeAsync(100); });
        expect(mockSearchAll).toHaveBeenCalledTimes(1);
    });

    it('does not search below 2 characters', async () => {
        renderSidebar();
        await type('c', 400);
        expect(mockSearchAll).not.toHaveBeenCalled();
        expect(section()).toBeNull();
    });

    it('only searches messages on the Chats tab', async () => {
        renderSidebar({ sidebarView: 'contacts' });
        await type('cancion', 400);
        expect(mockSearchAll).not.toHaveBeenCalled();
        expect(section()).toBeNull();
    });

    it('opening a 1:1 result selects the chat and jumps to the message', async () => {
        renderSidebar();
        await type('cancion');
        const hit = container.querySelector('button[data-message-id="11"]') as HTMLButtonElement;
        act(() => { hit.click(); });
        expect(setSelected).toHaveBeenCalledWith(luis);
        expect(openMessageAt).toHaveBeenCalledWith({ kind: 'chat', key: '222' }, 11);
    });

    it('opening a chat that is not in the contact list selects a placeholder entry', async () => {
        renderSidebar({ contacts: [] });
        await type('cancion');
        act(() => { (container.querySelector('button[data-message-id="11"]') as HTMLButtonElement).click(); });
        expect(setSelected).toHaveBeenCalledWith(expect.objectContaining({ Number: '222', Status: 'unknown' }));
        expect(openMessageAt).toHaveBeenCalledWith({ kind: 'chat', key: '222' }, 11);
    });

    it('opening a group result selects the group, closes the sidebar and jumps to the message', async () => {
        renderSidebar();
        await type('cancion');
        act(() => { (container.querySelector('button[data-message-id="30"]') as HTMLButtonElement).click(); });
        expect(setSelectedGroup).toHaveBeenCalledWith(groupEquipo);
        expect(setSidebarOpen).toHaveBeenCalledWith(false);
        expect(openMessageAt).toHaveBeenCalledWith({ kind: 'group', id: 9 }, 30);
    });

    it('a group result whose group is no longer in the list toasts instead of opening', async () => {
        renderSidebar({ groups: [] });
        await type('cancion');
        act(() => { (container.querySelector('button[data-message-id="30"]') as HTMLButtonElement).click(); });
        expect(setSelectedGroup).not.toHaveBeenCalled();
        expect(openMessageAt).not.toHaveBeenCalled();
        expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    });

    it('shows "Sin resultados" when nothing matches, and clearing the search removes the section', async () => {
        mockSearchAll.mockResolvedValue({ chats: [] });
        renderSidebar();
        await type('zzzz');
        expect(section()?.textContent).toContain('Sin resultados');

        act(() => { (container.querySelector('button[aria-label="Limpiar búsqueda"]') as HTMLButtonElement).click(); });
        expect(section()).toBeNull();
    });
});
