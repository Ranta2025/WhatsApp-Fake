// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import GroupChatWindow from './GroupChatWindow';
import { useDashboard, type DashboardContextValue, type SelectedGroup } from '../context/DashboardContext';
import { useGroupMessaging, type UseGroupMessagingResult } from '../hooks/useGroupMessaging';

// disappearing-messages (DE6): header chip and selector in the group info panel.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../hooks/useGroupMessaging', () => ({
    GroupMessagingProvider: ({ children }: { children: unknown }) => children,
    useGroupMessaging: vi.fn(),
}));
vi.mock('./GroupMessageInput', () => ({ default: () => null }));
vi.mock('./AddContactModal', () => ({ default: () => null }));
vi.mock('./GroupSettingsSection', () => ({ default: () => null }));
vi.mock('../api/searchApi', () => ({ searchGroup: vi.fn() }));
vi.mock('../../../api/groupApi', () => ({
    changeGroupMemberRole: vi.fn(), removeGroupMember: vi.fn(), updateGroupInfo: vi.fn(),
    leaveGroup: vi.fn(), updateGroupAvatar: vi.fn(), addGroupMembers: vi.fn(),
}));

const mockUseDashboard = vi.mocked(useDashboard);
const mockUseGroupMessaging = vi.mocked(useGroupMessaging);

const group = (over: Partial<SelectedGroup> = {}): SelectedGroup => ({
    id: 5, name: 'Equipo', creatorTelephon: '111', memberCount: 2, userRole: 'admin', createdAt: '2026-01-01T00:00:00Z',
    onlyAdminsCanSend: false, onlyAdminsCanEditInfo: false, onlyAdminsCanAddMembers: false,
    members: [{ telephon: '111', username: 'ana', role: 'admin' }, { telephon: '222', username: 'luis', role: 'member' }],
    ...over,
});

describe('GroupChatWindow disappearing messages', () => {
    let container: HTMLDivElement;
    let root: Root;
    const setGroupDisappearing = vi.fn();

    const render = (over: Partial<SelectedGroup> = {}, seconds = 0) => {
        mockUseDashboard.mockReturnValue({
            selectedGroup: group(over),
            setSelectedGroup: vi.fn(), setGroups: vi.fn(), addToast: vi.fn(),
            groupMessages: { 5: [] }, setGroupMessages: vi.fn(),
            fetchGroupMessages: vi.fn(), fetchGroupDetail: vi.fn(), groupPaging: {}, loadOlderGroupMessages: vi.fn(),
            typingUsers: new Set(), profile: { telephon: '111' }, contacts: [], setSelected: vi.fn(),
            avatarMap: {}, myAvatar: '', globalWallpaper: null, groupReceipts: {}, focusedGroup: {},
            openMessageAt: vi.fn(), returnToLatest: vi.fn(), loadOlderFocused: vi.fn(), loadNewerFocused: vi.fn(),
            selectedDisappearSeconds: seconds, setGroupDisappearing,
        } as unknown as DashboardContextValue);
        act(() => { root.render(<GroupChatWindow />); });
    };
    const openPanel = () => {
        const header = Array.from(container.querySelectorAll('div')).find(d =>
            typeof d.className === 'string' && d.className.includes('cursor-pointer') && (d.textContent || '').includes('Equipo'));
        act(() => { header?.click(); });
    };
    const select = () => container.querySelector<HTMLSelectElement>('select[aria-label="Mensajes temporales"]');

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
        setGroupDisappearing.mockResolvedValue(true);
        mockUseGroupMessaging.mockReturnValue({ messageMenuOpen: null, setMessageMenuOpen: vi.fn() } as unknown as UseGroupMessagingResult);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    });

    it('header chip only when the timer is on', () => {
        render({}, 0);
        expect(container.querySelector('[data-testid="disappearing-chip"]')).toBeNull();
        render({}, 604800);
        const chip = container.querySelector('[data-testid="disappearing-chip"]');
        expect(chip?.textContent).toBe('Mensajes temporales: 7 d');
        expect(chip?.getAttribute('aria-label')).toBe('Mensajes temporales activados: 7 días');
    });

    it('the info panel has the selector, editable for an admin', () => {
        render({}, 86400);
        expect(select()).toBeNull();
        openPanel();
        expect(select()?.value).toBe('86400');
        expect(select()?.disabled).toBe(false);
    });

    it('the info panel is read-only for a member when only admins edit info', () => {
        render({ userRole: 'member', onlyAdminsCanEditInfo: true }, 86400);
        openPanel();
        expect(select()).toBeNull();
        expect(container.textContent).toContain('Solo los administradores pueden cambiar esta opción');
    });
});
