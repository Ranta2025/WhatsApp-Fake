// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GroupMessageList } from './GroupChatWindow';
import { useDashboard, type DashboardContextValue, type GroupMessageEntry } from '../context/DashboardContext';
import { useGroupMessaging, type UseGroupMessagingResult } from '../hooks/useGroupMessaging';
import type { GroupMessageResponse } from '../../../types/api';

// message-pagination (MP5): scroll infinito hacia arriba en la lista del grupo.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../hooks/useGroupMessaging', () => ({
    GroupMessagingProvider: ({ children }: { children: unknown }) => children,
    useGroupMessaging: vi.fn(),
}));

const mockUseDashboard = vi.mocked(useDashboard);
const mockUseGroupMessaging = vi.mocked(useGroupMessaging);

const msg = (id: number): GroupMessageResponse => ({
    MessageID: id, GroupID: 5, SenderTelephon: '222', SenderUsername: 'bob', Message: `g${id}`,
    Time: '2026-01-01T10:00:00Z', Edited: false,
});

describe('GroupMessageList infinite scroll up', () => {
    let container: HTMLDivElement;
    let root: Root;
    const onLoadOlder = vi.fn();

    const renderList = (over: { messages?: GroupMessageEntry[]; hasMore?: boolean; loadingOlder?: boolean } = {}) => {
        act(() => {
            root.render(
                <GroupMessageList
                    messages={over.messages ?? [msg(5), msg(6)]}
                    myTelephon="111"
                    activeWallpaper={null}
                    groupID={5}
                    hasMore={over.hasMore ?? true}
                    loadingOlder={over.loadingOlder ?? false}
                    onLoadOlder={onLoadOlder}
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

    it('pide mensajes anteriores al llegar al tope con hasMore', () => {
        renderList();
        scrollTo(0);
        expect(onLoadOlder).toHaveBeenCalledTimes(1);
    });

    it('no pide más sin hasMore ni mientras carga', () => {
        renderList({ hasMore: false });
        scrollTo(0);
        renderList({ hasMore: true, loadingOlder: true });
        scrollTo(0);
        expect(onLoadOlder).not.toHaveBeenCalled();
    });

    it('muestra el indicador solo mientras carga', () => {
        renderList();
        expect(container.querySelector('[role="status"]')).toBeNull();
        renderList({ loadingOlder: true });
        expect(container.querySelector('[role="status"]')?.textContent).toContain('Cargando mensajes anteriores');
    });

    it('cada burbuja real lleva data-message-id; las entradas del sistema no', () => {
        const system: GroupMessageEntry = { MessageID: 'system_1', GroupID: 5, IsSystem: true, Message: 'Ana salió del grupo', Time: '2026-01-01T09:00:00Z' };
        renderList({ messages: [system, msg(5), msg(6)] });
        const marked = Array.from(container.querySelectorAll('[data-message-id]')).map(n => n.getAttribute('data-message-id'));
        expect(marked).toEqual(['5', '6']);
    });

    it('desactiva el scroll anchoring nativo del contenedor', () => {
        renderList();
        expect(scroller().style.overflowAnchor).toBe('none');
    });

    it('la primera entrada sintética no rompe el render (el cursor real lo calcula el contexto)', () => {
        const system: GroupMessageEntry = { MessageID: 'system_1', GroupID: 5, IsSystem: true, Message: 'Ana salió del grupo', Time: '2026-01-01T09:00:00Z' };
        renderList({ messages: [system, msg(5)] });
        expect(container.textContent).toContain('Ana salió del grupo');
        scrollTo(0);
        expect(onLoadOlder).toHaveBeenCalledTimes(1);
    });
});
