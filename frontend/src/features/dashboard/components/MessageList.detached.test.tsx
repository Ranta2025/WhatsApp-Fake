// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import MessageList from './MessageList';
import { useDashboard, type DashboardContextValue } from '../context/DashboardContext';
import { useMessaging } from '../hooks/useMessaging';
import { createFocusedWindow } from '../lib/focusedWindow';
import type { Message } from '../../../types/api';

// message-search (MS5): 1:1 list rendering a detached window (search -> jump to message).

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../hooks/useMessaging', () => ({ useMessaging: vi.fn() }));

const mockUseDashboard = vi.mocked(useDashboard);
const mockUseMessaging = vi.mocked(useMessaging);

const msg = (id: number, text = `m${id}`): Message => ({
    messageID: id, senderTelephon: '222', receptor: '111', message: text, status: 'visto',
    time: `2026-01-01T10:00:${String(id % 60).padStart(2, '0')}Z`, edited: false,
});

describe('MessageList detached window (1:1)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const loadOlderMessages = vi.fn();
    const loadOlderFocused = vi.fn();
    const loadNewerFocused = vi.fn();

    const focused = (ids: number[], over: { older?: boolean; newer?: boolean; target?: number; loadingOlder?: boolean } = {}) => {
        const win = createFocusedWindow<Message>(
            ids.map(id => msg(id)),
            { hasMoreOlder: over.older ?? true, hasMoreNewer: over.newer ?? true },
            over.target ?? ids[0] ?? 0, 1,
        );
        return { ...win, loadingOlder: over.loadingOlder ?? false };
    };

    const renderWith = (opts: { focusedChat?: ReturnType<typeof focused>; live?: Message[]; searchQuery?: string } = {}) => {
        mockUseDashboard.mockReturnValue({
            selected: { telephon: '222' },
            messagesByChat: { '222': opts.live ?? [msg(100), msg(101)] },
            chatPaging: { '222': { hasMore: true, loadingOlder: false, olderLoaded: false } },
            focusedChat: opts.focusedChat ? { '222': opts.focusedChat } : {},
            loadOlderMessages, loadOlderFocused, loadNewerFocused,
            profile: { telephon: '111' },
            globalWallpaper: null,
        } as unknown as DashboardContextValue);
        act(() => { root.render(<MessageList searchQuery={opts.searchQuery} />); });
    };

    const scroller = () => container.firstElementChild as HTMLDivElement;
    const renderedIds = () => Array.from(container.querySelectorAll('[data-message-id]')).map(n => Number(n.getAttribute('data-message-id')));
    const scrollTo = (top: number) => {
        scroller().scrollTop = top;
        act(() => { scroller().dispatchEvent(new Event('scroll')); });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
        mockUseMessaging.mockReturnValue({
            editingMessageId: null, editingMessageText: '', messageMenuOpen: null, setMessageMenuOpen: vi.fn(),
        } as unknown as ReturnType<typeof useMessaging>);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    });

    it('renders the detached window instead of the latest messages', () => {
        renderWith({ focusedChat: focused([10, 11, 12]) });
        expect(renderedIds()).toEqual([10, 11, 12]);
    });

    it('renders the normal list when there is no detached window', () => {
        renderWith();
        expect(renderedIds()).toEqual([100, 101]);
    });

    it('scrolling to the top asks the detached window for older messages, not the normal list', () => {
        renderWith({ focusedChat: focused([10, 11, 12], { older: true }) });
        scrollTo(0);
        expect(loadOlderFocused).toHaveBeenCalledWith({ kind: 'chat', key: '222' });
        expect(loadOlderMessages).not.toHaveBeenCalled();
    });

    it('does not ask for older messages when the window has no more', () => {
        renderWith({ focusedChat: focused([10, 11, 12], { older: false }) });
        scrollTo(0);
        expect(loadOlderFocused).not.toHaveBeenCalled();
    });

    it('reaching the bottom asks for newer messages while the window has more', () => {
        renderWith({ focusedChat: focused([10, 11, 12], { newer: true }) });
        const el = scroller();
        Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 1000 });
        Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 400 });
        scrollTo(590);
        expect(loadNewerFocused).toHaveBeenCalledWith({ kind: 'chat', key: '222' });
    });

    it('once the window reaches the server tail, live messages after it are appended', () => {
        renderWith({ focusedChat: focused([10, 11, 12], { newer: false }), live: [msg(11), msg(12), msg(13)] });
        expect(renderedIds()).toEqual([10, 11, 12, 13]);
    });

    it('highlights the searched term inside the message text (accent-insensitive)', () => {
        const win = createFocusedWindow<Message>([msg(10, 'Qué CANCIÓN tan buena')], { hasMoreOlder: false, hasMoreNewer: false }, 10, 1);
        renderWith({ focusedChat: win, searchQuery: 'cancion' });
        expect(Array.from(container.querySelectorAll('mark')).map(m => m.textContent)).toEqual(['CANCIÓN']);
        expect(container.textContent).toContain('Qué CANCIÓN tan buena');
    });

    it('shows no <mark> without a search term', () => {
        renderWith({ focusedChat: focused([10]) });
        expect(container.querySelector('mark')).toBeNull();
    });
});
