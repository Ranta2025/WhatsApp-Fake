// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GroupMessageList } from './GroupChatWindow';
import { useDashboard, type DashboardContextValue } from '../context/DashboardContext';
import { useGroupMessaging, type UseGroupMessagingResult } from '../hooks/useGroupMessaging';
import type { GroupMessageResponse } from '../../../types/api';

// group-read-receipts (RR5): ticks of my own group messages follow the members' marks
// and the "Info" entry opens the receipts modal.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../hooks/useGroupMessaging', () => ({
    GroupMessagingProvider: ({ children }: { children: unknown }) => children,
    useGroupMessaging: vi.fn(),
}));
const mockGetReceipts = vi.fn();
vi.mock('../../../api/groupApi', () => ({
    getGroupMessageReceipts: (...args: unknown[]) => mockGetReceipts(...args),
}));

const mockUseDashboard = vi.mocked(useDashboard);
const mockUseGroupMessaging = vi.mocked(useGroupMessaging);

const msg = (id: number, sender: string): GroupMessageResponse => ({
    MessageID: id, GroupID: 5, SenderTelephon: sender, SenderUsername: sender, Message: `g${id}`,
    Time: '2026-01-01T10:00:00Z', Edited: false,
});

describe('GroupMessageList receipts', () => {
    let container: HTMLDivElement;
    let root: Root;
    const setMessageMenuOpen = vi.fn();
    const noop = vi.fn();

    const mockContext = (groupReceipts: DashboardContextValue['groupReceipts'], messageMenuOpen: number | null = null) => {
        mockUseDashboard.mockReturnValue({ selectedGroup: { ID: 5, Members: [] }, groupReceipts } as unknown as DashboardContextValue);
        mockUseGroupMessaging.mockReturnValue({
            messageMenuOpen, setMessageMenuOpen, handleEditMessage: noop, handleDeleteMessage: noop,
            handleDeleteMessageForMe: noop, handleReplyToMessage: noop,
        } as unknown as UseGroupMessagingResult);
    };
    const renderList = (messages: GroupMessageResponse[] = [msg(10, '111'), msg(11, '222'), msg(12, '111')], groupID = 5) => act(() => {
        root.render(
            <GroupMessageList
                messages={messages}
                myTelephon="111"
                activeWallpaper={null}
                groupID={groupID}
                hasMore={false}
                loadingOlder={false}
                onLoadOlder={noop}
            />,
        );
    });
    const tickLabels = () => Array.from(container.querySelectorAll('svg[role="img"]')).map(s => s.getAttribute('aria-label'));

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
        mockGetReceipts.mockResolvedValue({ data: { readBy: [{ telephon: '222', username: 'luis' }], deliveredTo: [], pending: [] } });
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    });

    it('derives each own message tick from the members\' marks (none on others\' messages)', () => {
        mockContext({
            5: {
                '111': { joined: 0, delivered: 0, read: 0 },
                '222': { joined: 0, delivered: 12, read: 10 },
                '333': { joined: 0, delivered: 12, read: 11 },
            },
        });
        renderList();

        // msg 10: read by both -> Visto; msg 12: delivered to both, unread -> Entregado
        expect(tickLabels()).toEqual(['Visto', 'Entregado']);
    });

    it('shows "Enviado" while the receipts of the group are not loaded yet', () => {
        mockContext({});
        renderList();
        expect(tickLabels()).toEqual(['Enviado', 'Enviado']);
    });

    it('opens the Info modal for my message and loads its receipts', async () => {
        mockContext({}, 10);
        renderList();

        await act(async () => {
            Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Info')?.click();
        });

        expect(mockGetReceipts).toHaveBeenCalledWith(5, 10);
        expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Leído por');
        expect(document.body.textContent).toContain('luis');
    });

    const openInfo = async () => {
        await act(async () => {
            Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Info')?.click();
        });
    };

    it('closes the Info modal when the group changes', async () => {
        mockContext({}, 10);
        renderList();
        await openInfo();
        expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();

        renderList([msg(10, '111')], 6);
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();

        // going back must not resurrect the stale modal
        renderList([msg(10, '111')], 5);
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    });

    it('closes the Info modal when the inspected message disappears', async () => {
        mockContext({}, 10);
        renderList();
        await openInfo();
        expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();

        renderList([msg(11, '222'), msg(12, '111')]);
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    });
});
