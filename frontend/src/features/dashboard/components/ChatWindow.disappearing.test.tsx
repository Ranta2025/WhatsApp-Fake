// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ChatWindow from './ChatWindow';
import { useDashboard, type DashboardContextValue } from '../context/DashboardContext';

// disappearing-messages (DE6): header chip in the 1:1 window.

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

describe('ChatWindow disappearing chip', () => {
    let container: HTMLDivElement;
    let root: Root;

    const renderChat = (seconds: number) => {
        mockUseDashboard.mockReturnValue({
            selected: { Number: '222', ContactName: 'Luis', Username: 'luis' },
            setSelected: vi.fn(), isConnected: true, avatarMap: {}, onlineUsers: new Set(), typingUsers: new Set(),
            lastSeenMap: {}, setMessagesByChat: vi.fn(), contacts: [{ Number: '222' }], addToast: vi.fn(),
            messagesByChat: { '222': [] }, fetchChatMessages: vi.fn(), profile: { Telephon: '111' },
            allChatGroups: {}, markAsRead: vi.fn(), focusedChat: {}, openMessageAt: vi.fn(), returnToLatest: vi.fn(),
            selectedDisappearSeconds: seconds,
        } as unknown as DashboardContextValue);
        act(() => { root.render(<ChatWindow onShowContactDetails={vi.fn()} />); });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('shows the chip in the header only when the timer is on', () => {
        renderChat(0);
        expect(container.querySelector('[data-testid="disappearing-chip"]')).toBeNull();
        renderChat(86400);
        const chip = container.querySelector('header [data-testid="disappearing-chip"]');
        expect(chip?.textContent).toBe('Mensajes temporales: 24 h');
        expect(chip?.getAttribute('aria-label')).toBe('Mensajes temporales activados: 24 horas');
    });
});
