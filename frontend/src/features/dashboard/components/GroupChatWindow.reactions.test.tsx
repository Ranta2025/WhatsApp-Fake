// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GroupMessageList } from './GroupChatWindow';
import { useDashboard, type DashboardContextValue } from '../context/DashboardContext';
import { useGroupMessaging, type UseGroupMessagingResult } from '../hooks/useGroupMessaging';
import type { GroupMessageResponse } from '../../../types/api';

// reactions (RE5): quick row, chips, who modal and long-press in group bubbles; none on system notices.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../hooks/useGroupMessaging', () => ({
    GroupMessagingProvider: ({ children }: { children: unknown }) => children,
    useGroupMessaging: vi.fn(),
}));
const mockGetReactions = vi.fn();
vi.mock('../../../api/reactionApi', () => ({ getReactions: (...a: unknown[]) => mockGetReactions(...a) }));
const picker = vi.hoisted(() => ({ el: null as HTMLElement | null }));
vi.mock('./reactions/emojiPickerLoader', () => ({
    createEmojiPicker: () => { picker.el = document.createElement('div'); return picker.el; },
}));

const mockUseDashboard = vi.mocked(useDashboard);
const mockUseGroupMessaging = vi.mocked(useGroupMessaging);

const msg = (id: number, over: Partial<GroupMessageResponse> = {}): GroupMessageResponse => ({
    MessageID: id, GroupID: 5, SenderTelephon: '222', SenderUsername: 'luis', Message: `g${id}`,
    Time: '2026-01-01T10:00:00Z', Edited: false, ...over,
});

describe('GroupMessageList reactions', () => {
    let container: HTMLDivElement;
    let root: Root;
    const setMessageMenuOpen = vi.fn();
    const reactToMessage = vi.fn();
    const noop = vi.fn();

    const renderList = (messages: GroupMessageResponse[], messageMenuOpen: number | null = null) => {
        mockUseDashboard.mockReturnValue({
            selectedGroup: { ID: 5, Members: [] }, groupReceipts: {}, reactToMessage,
        } as unknown as DashboardContextValue);
        mockUseGroupMessaging.mockReturnValue({
            messageMenuOpen, setMessageMenuOpen, handleEditMessage: noop, handleDeleteMessage: noop,
            handleDeleteMessageForMe: noop, handleReplyToMessage: noop,
        } as unknown as UseGroupMessagingResult);
        act(() => {
            root.render(
                <GroupMessageList messages={messages} myTelephon="111" activeWallpaper={null} groupID={5}
                    hasMore={false} loadingOlder={false} onLoadOlder={noop} />,
            );
        });
    };
    const byLabel = (label: string, scope: ParentNode = document.body) =>
        Array.from(scope.querySelectorAll<HTMLElement>('button')).filter(b => b.getAttribute('aria-label') === label);
    const bubble = (id: number) => container.querySelector<HTMLElement>(`[data-message-id="${id}"]`) as HTMLElement;
    const reacted = [msg(10, { Reactions: [{ Emoji: '😂', Count: 3, Mine: false }] }), msg(11)];

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
        mockGetReactions.mockResolvedValue({ reactions: [{ emoji: '😂', users: [{ telephon: '222', username: 'luis', avatarUrl: '' }] }] });
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
    });

    it('renders chips under the bubble and toggles with the group target', () => {
        renderList(reacted);
        expect(byLabel('😂 3', bubble(10))).toHaveLength(1);
        expect(bubble(11).querySelector('button[aria-pressed]')).toBeNull();
        act(() => { byLabel('😂 3', bubble(10))[0]?.click(); });
        expect(reactToMessage).toHaveBeenCalledExactlyOnceWith({ kind: 'group', messageID: 10, groupID: 5 }, '😂');
    });

    it('opens the who-reacted modal with the group ids', async () => {
        renderList(reacted);
        await act(async () => { byLabel('Ver reacciones', bubble(10))[0]?.click(); });
        expect(mockGetReactions).toHaveBeenCalledWith('group', 10, 5);
        expect(document.body.querySelector('[role="dialog"][aria-label="Reacciones"]')).not.toBeNull();
    });

    it('shows the quick row in the open menu; tapping reacts and closes it', () => {
        renderList(reacted, 11);
        act(() => { byLabel('Reaccionar con ❤️')[0]?.click(); });
        expect(reactToMessage).toHaveBeenCalledExactlyOnceWith({ kind: 'group', messageID: 11, groupID: 5 }, '❤️');
        expect(setMessageMenuOpen).toHaveBeenCalledWith(null);
    });

    it('"+" opens the full picker and reacts with the chosen emoji', async () => {
        renderList(reacted, 11);
        await act(async () => { byLabel('Más emojis')[0]?.click(); });
        expect(setMessageMenuOpen).toHaveBeenCalledWith(null);
        await act(async () => { picker.el?.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '🎉' } })); });
        expect(reactToMessage).toHaveBeenCalledExactlyOnceWith({ kind: 'group', messageID: 11, groupID: 5 }, '🎉');
    });

    it('has no reaction UI on system notices', () => {
        const system = msg(12, { Kind: 'system', SenderTelephon: '', Message: '', Reactions: [{ Emoji: '👍', Count: 1, Mine: false }] });
        renderList([system]);
        expect(byLabel('Reaccionar')).toHaveLength(0);
        expect(byLabel('Ver reacciones')).toHaveLength(0);
        expect(container.querySelector('button[aria-pressed]')).toBeNull();
    });

    it('long-press on a bubble opens its menu', () => {
        vi.useFakeTimers();
        try {
            renderList(reacted);
            const ev = new Event('touchstart', { bubbles: true });
            Object.defineProperty(ev, 'touches', { value: [{ clientX: 1, clientY: 1 }] });
            act(() => { bubble(11).querySelector('.rounded-2xl')?.dispatchEvent(ev); });
            act(() => { vi.advanceTimersByTime(400); });
            expect(setMessageMenuOpen).toHaveBeenCalledExactlyOnceWith(11);
        } finally {
            vi.useRealTimers();
        }
    });
});
