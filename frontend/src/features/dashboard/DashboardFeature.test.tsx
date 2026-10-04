// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import DashboardFeature from './DashboardFeature';
import { useDashboard } from './context/DashboardContext';

// Regression: `ToastContainer` was never mounted anywhere in the app (only its
// own test imported it), so every `addToast(...)` call (attach errors, group
// operations, "Chat vaciado", ...) was invisible. This mounts the real
// `DashboardFeature` (real providers + real ToastContainer; network/WS mocked as
// in DashboardContext.fetchers.test.tsx, heavy siblings stubbed) and asserts a
// toast added through the context is rendered.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../api/axios', () => ({
    default: { get: vi.fn().mockResolvedValue({ data: null }) },
    SESSION_EXPIRED_EVENT: 'auth:session-expired',
}));

vi.mock('../../api/groupApi', () => ({
    getUserGroups: vi.fn().mockResolvedValue({ data: null }),
    getGroupMessages: vi.fn().mockResolvedValue({ data: null }),
    getGroupDetail: vi.fn().mockResolvedValue({ data: null }),
}));

// Stable identities (see the note in DashboardContext.fetchers.test.tsx).
const stableUser = { username: 'ana', telephon: '111', avatar: '' };
const stableLogout = vi.fn();
const stableWs = {
    isConnected: false,
    connectionState: 'disconnected' as const,
    on: vi.fn(),
    off: vi.fn(),
    sendMessage: vi.fn(),
    sendReadConfirmation: vi.fn(),
    sendTypingIndicator: vi.fn(),
    sendGroupMessage: vi.fn(),
    sendGroupTyping: vi.fn(),
    sendGroupEditMessage: vi.fn(),
    sendGroupDeleteMessage: vi.fn(),
    sendGroupJoin: vi.fn(),
};

vi.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ user: stableUser, logout: stableLogout }),
}));

vi.mock('../../hooks/useWebSocket', () => ({
    useWebSocket: () => stableWs,
}));

// The sidebar stub is the toast producer: it lives inside the providers.
vi.mock('./components/Sidebar', () => ({
    default: function SidebarStub() {
        const { addToast } = useDashboard();
        useEffect(() => {
            addToast({ type: 'error', message: 'toast visible in dashboard' });
        }, [addToast]);
        return null;
    },
}));

const stub = vi.hoisted(() => () => ({ default: () => null }));
vi.mock('./components/ChatWindow', stub);
vi.mock('./components/GroupChatWindow', stub);
vi.mock('./components/ProfileModal', stub);
vi.mock('./components/ContactDetails', stub);
vi.mock('./components/NotificationBanner', stub);
vi.mock('./components/AddContactModal', stub);
vi.mock('./components/CreateGroupModal', stub);
vi.mock('../status/components/StatusComposer', stub);
vi.mock('../status/components/StatusViewer', stub);
vi.mock('../../components/IncomingCall', stub);

describe('DashboardFeature toast layer', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('renders a toast added via addToast, on the toast z-layer', async () => {
        await act(async () => {
            root.render(<DashboardFeature />);
        });

        expect(container.textContent).toContain('toast visible in dashboard');
        expect(container.querySelector('.z-toast')).not.toBeNull();
    });
});
