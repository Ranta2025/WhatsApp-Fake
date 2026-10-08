// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import MessageList from './MessageList';
import { useDashboard, type DashboardContextValue, type PagingState } from '../context/DashboardContext';
import { useMessaging } from '../hooks/useMessaging';
import type { Message } from '../../../types/api';

// message-pagination (MP4): scroll infinito hacia arriba en el chat 1:1.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../hooks/useMessaging', () => ({ useMessaging: vi.fn() }));

const mockUseDashboard = vi.mocked(useDashboard);
const mockUseMessaging = vi.mocked(useMessaging);

const msg = (id: number): Message => ({
    messageID: id, senderTelephon: '222', receptor: '111', message: `m${id}`, status: 'enviado',
    time: '2026-01-01T10:00:00Z', edited: false,
});

describe('MessageList infinite scroll up (1:1)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const loadOlderMessages = vi.fn();

    const renderWith = (paging: PagingState | undefined, messages: Message[] = [msg(5), msg(6)]) => {
        mockUseDashboard.mockReturnValue({
            selected: { telephon: '222' },
            focusedChat: {},
            messagesByChat: { '222': messages },
            chatPaging: paging ? { '222': paging } : {},
            loadOlderMessages,
            profile: { telephon: '111' },
            globalWallpaper: null,
        } as unknown as DashboardContextValue);
        act(() => { root.render(<MessageList />); });
    };

    const scroller = () => container.firstElementChild as HTMLDivElement;
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

    it('pide mensajes anteriores del chat abierto al llegar al tope con hasMore', () => {
        renderWith({ hasMore: true, loadingOlder: false, olderLoaded: false });
        scrollTo(0);
        expect(loadOlderMessages).toHaveBeenCalledWith('222');
    });

    it('no pide más cuando hasMore es false', () => {
        renderWith({ hasMore: false, loadingOlder: false, olderLoaded: true });
        scrollTo(0);
        expect(loadOlderMessages).not.toHaveBeenCalled();
    });

    it('muestra el indicador de carga solo mientras carga, sin desplazar el contenido', () => {
        renderWith({ hasMore: true, loadingOlder: false, olderLoaded: false });
        expect(container.querySelector('[role="status"]')).toBeNull();

        renderWith({ hasMore: true, loadingOlder: true, olderLoaded: false });
        const status = container.querySelector('[role="status"]');
        expect(status?.textContent).toContain('Cargando mensajes anteriores');
        // absoluto y sin margen de space-y: no añade altura ni desplaza a sus hermanos
        expect(status?.parentElement?.className).toContain('absolute');
        expect(status?.parentElement?.className).toContain('mt-0!');
    });

    it('cada burbuja lleva data-message-id (destino del salto desde una búsqueda)', () => {
        renderWith(undefined, [msg(5), msg(6)]);
        const marked = Array.from(container.querySelectorAll('[data-message-id]')).map(n => n.getAttribute('data-message-id'));
        expect(marked).toEqual(['5', '6']);
    });

    it('desactiva el scroll anchoring nativo del navegador en el contenedor', () => {
        renderWith(undefined);
        expect(scroller().style.overflowAnchor).toBe('none');
    });
});
