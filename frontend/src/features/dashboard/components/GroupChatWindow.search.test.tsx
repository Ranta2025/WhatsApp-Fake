// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import GroupChatWindow from './GroupChatWindow';
import { useDashboard, type DashboardContextValue } from '../context/DashboardContext';
import { useGroupMessaging, type UseGroupMessagingResult } from '../hooks/useGroupMessaging';
import { searchGroup } from '../api/searchApi';
import { createFocusedWindow } from '../lib/focusedWindow';
import type { GroupMessageResponse, SearchPage } from '../../../types/api';

// message-search (MS5): in-chat search wired into the group header (beside the kebab).

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../hooks/useGroupMessaging', () => ({
    GroupMessagingProvider: ({ children }: { children: unknown }) => children,
    useGroupMessaging: vi.fn(),
}));
vi.mock('./GroupMessageInput', () => ({ default: () => null }));
vi.mock('./AddContactModal', () => ({ default: () => null }));
vi.mock('../api/searchApi', () => ({ searchGroup: vi.fn() }));

const mockUseDashboard = vi.mocked(useDashboard);
const mockUseGroupMessaging = vi.mocked(useGroupMessaging);
const mockSearchGroup = vi.mocked(searchGroup);

const hit = (id: number) => ({ messageID: id, time: '2026-01-01T00:00:00Z', snippet: `g${id}`, highlights: [] as [number, number][] });
const page = (ids: number[]): SearchPage => ({ results: ids.map(hit), hasMore: false });
const msg = (id: number, text = `g${id}`): GroupMessageResponse => ({
    MessageID: id, GroupID: 9, SenderTelephon: '222', SenderUsername: 'bob', Message: text, Time: '2026-01-01T10:00:00Z', Edited: false,
});

describe('GroupChatWindow in-chat search', () => {
    let container: HTMLDivElement;
    let root: Root;
    const openMessageAt = vi.fn();
    const returnToLatest = vi.fn();
    const loadOlderFocused = vi.fn();
    const loadNewerFocused = vi.fn();

    const renderGroup = (over: { role?: string; focusedGroup?: DashboardContextValue['focusedGroup'] } = {}) => {
        mockUseDashboard.mockReturnValue({
            selectedGroup: { ID: 9, Name: 'Equipo', MemberCount: 3, UserRole: over.role ?? 'member', Members: [] },
            setSelectedGroup: vi.fn(), groupMessages: { 9: [msg(100), msg(101)] }, setGroupMessages: vi.fn(),
            fetchGroupMessages: vi.fn(), fetchGroupDetail: vi.fn(), groupPaging: {}, loadOlderGroupMessages: vi.fn(),
            typingUsers: new Set(), profile: { telephon: '111' }, contacts: [], setSelected: vi.fn(),
            avatarMap: {}, myAvatar: '', setGroups: vi.fn(), addToast: vi.fn(), globalWallpaper: null,
            groupReceipts: {}, focusedGroup: over.focusedGroup ?? {},
            openMessageAt, returnToLatest, loadOlderFocused, loadNewerFocused,
        } as unknown as DashboardContextValue);
        act(() => { root.render(<GroupChatWindow />); });
    };

    const searchButton = () => container.querySelector('button[aria-label="Buscar en el chat"]') as HTMLButtonElement | null;
    const input = () => container.querySelector('input[placeholder="Buscar"]') as HTMLInputElement | null;
    const renderedIds = () => Array.from(container.querySelectorAll('[data-message-id]')).map(n => Number(n.getAttribute('data-message-id')));
    const typeQuery = async (q: string) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        act(() => {
            setter?.call(input(), q);
            input()?.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    };

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
        openMessageAt.mockResolvedValue(true);
        mockUseGroupMessaging.mockReturnValue({
            messageMenuOpen: null, setMessageMenuOpen: vi.fn(),
        } as unknown as UseGroupMessagingResult);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('adds a search button beside the kebab; the bar appears on click', () => {
        renderGroup();
        expect(input()).toBeNull();
        expect(searchButton()).not.toBeNull();
        act(() => { searchButton()?.click(); });
        expect(input()).not.toBeNull();
    });

    it('searches the group, jumps to the newest hit and highlights the term in the bubbles', async () => {
        mockSearchGroup.mockResolvedValue(page([101, 100]));
        renderGroup();
        act(() => { searchButton()?.click(); });
        await typeQuery('g10');

        expect(mockSearchGroup).toHaveBeenCalledWith(9, 'g10', expect.objectContaining({ limit: 30 }));
        expect(openMessageAt).toHaveBeenCalledWith({ kind: 'group', id: 9 }, 101);
        expect(container.textContent).toContain('1 de 2');
        expect(container.querySelectorAll('mark').length).toBeGreaterThan(0);
    });

    it('Escape closes the bar', async () => {
        mockSearchGroup.mockResolvedValue(page([101]));
        renderGroup();
        act(() => { searchButton()?.click(); });
        await typeQuery('g10');
        act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
        expect(input()).toBeNull();
        expect(container.querySelectorAll('mark').length).toBe(0);
    });

    it('a group the user left cannot be searched (the backend only allows members): no search button', () => {
        renderGroup({ role: 'left' });
        expect(searchButton()).toBeNull();
    });

    it('renders the detached window, offers "Ir a los mensajes recientes" and pages through the window', () => {
        const win = createFocusedWindow<GroupMessageResponse>([msg(10), msg(11)], { hasMoreOlder: true, hasMoreNewer: true }, 10, 1);
        renderGroup({ focusedGroup: { 9: win } });
        expect(renderedIds()).toEqual([10, 11]);

        const list = container.querySelector('.overflow-y-auto') as HTMLDivElement;
        list.scrollTop = 0;
        act(() => { list.dispatchEvent(new Event('scroll')); });
        expect(loadOlderFocused).toHaveBeenCalledWith({ kind: 'group', id: 9 });

        const back = container.querySelector('button[aria-label="Ir a los mensajes recientes"]') as HTMLButtonElement;
        expect(back).not.toBeNull();
        act(() => { back.click(); });
        expect(returnToLatest).toHaveBeenCalledWith({ kind: 'group', id: 9 });
    });

    it('without a detached window there is no "Ir a los mensajes recientes" and the latest messages show', () => {
        renderGroup();
        expect(container.querySelector('button[aria-label="Ir a los mensajes recientes"]')).toBeNull();
        expect(renderedIds()).toEqual([100, 101]);
    });
});
