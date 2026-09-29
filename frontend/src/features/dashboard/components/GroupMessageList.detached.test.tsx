// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GroupMessageList } from './GroupChatWindow';
import { useDashboard, type DashboardContextValue } from '../context/DashboardContext';
import { useGroupMessaging, type UseGroupMessagingResult } from '../hooks/useGroupMessaging';
import type { GroupMessageResponse } from '../../../types/api';

// message-search (MS5): group list in detached mode (search -> jump to message).

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../hooks/useGroupMessaging', () => ({
    GroupMessagingProvider: ({ children }: { children: unknown }) => children,
    useGroupMessaging: vi.fn(),
}));

const mockUseDashboard = vi.mocked(useDashboard);
const mockUseGroupMessaging = vi.mocked(useGroupMessaging);

const msg = (id: number, text = `g${id}`): GroupMessageResponse => ({
    MessageID: id, GroupID: 5, SenderTelephon: '222', SenderUsername: 'bob', Message: text,
    Time: '2026-01-01T10:00:00Z', Edited: false,
});

describe('GroupMessageList detached mode', () => {
    let container: HTMLDivElement;
    let root: Root;
    const onLoadOlder = vi.fn();
    const onLoadNewer = vi.fn();

    const renderList = (over: Partial<Parameters<typeof GroupMessageList>[0]> = {}) => {
        act(() => {
            root.render(
                <GroupMessageList
                    messages={[msg(10), msg(11)]}
                    myTelephon="111"
                    activeWallpaper={null}
                    groupID={5}
                    hasMore={false}
                    loadingOlder={false}
                    onLoadOlder={onLoadOlder}
                    detached
                    hasMoreNewer
                    loadingNewer={false}
                    onLoadNewer={onLoadNewer}
                    scrollTarget={{ id: 10, seq: 1 }}
                    {...over}
                />,
            );
        });
    };

    const scroller = () => container.firstElementChild as HTMLDivElement;
    const scrollTo = (top: number) => {
        scroller().scrollTop = top;
        act(() => { scroller().dispatchEvent(new Event('scroll')); });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
        mockUseDashboard.mockReturnValue({ selectedGroup: { ID: 5, Members: [] } } as unknown as DashboardContextValue);
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
        vi.unstubAllGlobals();
    });

    it('asks for newer messages when the scroll reaches the bottom of the detached window', () => {
        renderList();
        const el = scroller();
        Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 1000 });
        Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 400 });
        scrollTo(590);
        expect(onLoadNewer).toHaveBeenCalledTimes(1);
    });

    it('does not ask for newer messages when not detached or when there are none', () => {
        const el = () => scroller();
        renderList({ detached: false, scrollTarget: null });
        Object.defineProperty(el(), 'scrollHeight', { configurable: true, get: () => 1000 });
        Object.defineProperty(el(), 'clientHeight', { configurable: true, get: () => 400 });
        scrollTo(600);
        renderList({ hasMoreNewer: false });
        scrollTo(600);
        expect(onLoadNewer).not.toHaveBeenCalled();
    });

    it('highlights the searched term in the bubble text', () => {
        renderList({ messages: [msg(10, 'Reunión de equipo')], searchQuery: 'reunion' });
        expect(Array.from(container.querySelectorAll('mark')).map(m => m.textContent)).toEqual(['Reunión']);
    });

    it('keeps the bubble text plain without a search term', () => {
        renderList({ messages: [msg(10, 'Reunión de equipo')] });
        expect(container.querySelector('mark')).toBeNull();
        expect(container.textContent).toContain('Reunión de equipo');
    });
});
