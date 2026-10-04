// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ChatWindow from './ChatWindow';
import { useDashboard, type DashboardContextValue, type MuteTarget } from '../context/DashboardContext';

// Per-chat mute (WP9): "Más opciones" in the 1:1 header offers "Silenciar notificaciones"
// (8 horas / 1 semana / Siempre) or, when muted, "Activar notificaciones".

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../hooks/useMessaging', () => ({
    MessagingProvider: ({ children }: { children: unknown }) => children,
    useMessaging: () => ({ forwardingMessage: null, setForwardingMessage: vi.fn(), executeForward: vi.fn() }),
}));
vi.mock('./MessageList', () => ({ default: () => null }));
vi.mock('./MessageInput', () => ({ default: () => null }));
vi.mock('./AddContactModal', () => ({ default: () => null }));
vi.mock('./ForwardMessageModal', () => ({ default: () => null }));

const mockUseDashboard = vi.mocked(useDashboard);

describe('ChatWindow mute menu', () => {
    let container: HTMLDivElement;
    let root: Root;
    const setMute = vi.fn();
    const clearMute = vi.fn();

    const renderChat = (muted: boolean) => {
        mockUseDashboard.mockReturnValue({
            selected: { Number: '222', ContactName: 'Luis', Username: 'luis' },
            setSelected: vi.fn(), isConnected: true, avatarMap: {}, onlineUsers: new Set(), typingUsers: new Set(),
            lastSeenMap: {}, setMessagesByChat: vi.fn(), contacts: [{ Number: '222' }], addToast: vi.fn(),
            messagesByChat: { '222': [] }, fetchChatMessages: vi.fn(), profile: { Telephon: '111' },
            allChatGroups: {}, markAsRead: vi.fn(), focusedChat: {}, openMessageAt: vi.fn(), returnToLatest: vi.fn(),
            selectedDisappearSeconds: 0,
            isMuted: (t: MuteTarget) => muted && t.kind === 'direct' && t.key === '222',
            setMute, clearMute,
        } as unknown as DashboardContextValue);
        act(() => { root.render(<ChatWindow onShowContactDetails={vi.fn()} />); });
    };
    const byLabel = (label: string) => document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    const menuItem = (name: string) => Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
        .find(el => el.textContent?.trim() === name);
    const openMenu = () => { act(() => { byLabel('Más opciones')?.click(); }); };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
        setMute.mockResolvedValue(true);
        clearMute.mockResolvedValue(true);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    });

    it('"Silenciar notificaciones" opens the three durations and mutes the chat with the chosen one', async () => {
        renderChat(false);
        expect(document.body.querySelector('[role="menu"]')).toBeNull();
        openMenu();
        expect(menuItem('Activar notificaciones')).toBeUndefined();
        expect(menuItem('8 horas')).toBeUndefined();
        act(() => { menuItem('Silenciar notificaciones')?.click(); });
        expect(['8 horas', '1 semana', 'Siempre'].map(n => menuItem(n) !== undefined)).toEqual([true, true, true]);

        await act(async () => { menuItem('8 horas')?.click(); });
        expect(setMute).toHaveBeenCalledWith({ kind: 'direct', key: '222' }, '8h');
        expect(document.body.querySelector('[role="menu"]')).toBeNull();

        openMenu();
        act(() => { menuItem('Silenciar notificaciones')?.click(); });
        await act(async () => { menuItem('Siempre')?.click(); });
        expect(setMute).toHaveBeenLastCalledWith({ kind: 'direct', key: '222' }, 'always');
    });

    it('a muted chat shows "Activar notificaciones" instead, which unmutes it', async () => {
        renderChat(true);
        openMenu();
        expect(menuItem('Silenciar notificaciones')).toBeUndefined();
        await act(async () => { menuItem('Activar notificaciones')?.click(); });
        expect(clearMute).toHaveBeenCalledWith({ kind: 'direct', key: '222' });
        expect(setMute).not.toHaveBeenCalled();
    });
});
