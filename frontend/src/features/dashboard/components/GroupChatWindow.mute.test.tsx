// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import GroupChatWindow from './GroupChatWindow';
import { useDashboard, type DashboardContextValue, type MuteTarget, type SelectedGroup } from '../context/DashboardContext';
import { useGroupMessaging, type UseGroupMessagingResult } from '../hooks/useGroupMessaging';

// Per-chat mute (WP9): the group header's "Más opciones" menu.

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
    id: 5, name: 'Equipo', creatorTelephon: '111', memberCount: 2, userRole: 'member', createdAt: '2026-01-01T00:00:00Z',
    onlyAdminsCanSend: false, onlyAdminsCanEditInfo: false, onlyAdminsCanAddMembers: false,
    members: [{ telephon: '111', username: 'ana', role: 'member' }, { telephon: '222', username: 'luis', role: 'admin' }],
    ...over,
});

describe('GroupChatWindow mute menu', () => {
    let container: HTMLDivElement;
    let root: Root;
    const setMute = vi.fn();
    const clearMute = vi.fn();

    const render = (muted: boolean, over: Partial<SelectedGroup> = {}) => {
        mockUseDashboard.mockReturnValue({
            selectedGroup: group(over),
            setSelectedGroup: vi.fn(), setGroups: vi.fn(), addToast: vi.fn(),
            groupMessages: { 5: [] }, setGroupMessages: vi.fn(),
            fetchGroupMessages: vi.fn(), fetchGroupDetail: vi.fn(), groupPaging: {}, loadOlderGroupMessages: vi.fn(),
            typingUsers: new Set(), profile: { telephon: '111' }, contacts: [], setSelected: vi.fn(),
            avatarMap: {}, myAvatar: '', globalWallpaper: null, groupReceipts: {}, focusedGroup: {},
            openMessageAt: vi.fn(), returnToLatest: vi.fn(), loadOlderFocused: vi.fn(), loadNewerFocused: vi.fn(),
            selectedDisappearSeconds: 0,
            isMuted: (t: MuteTarget) => muted && t.kind === 'group' && t.id === 5,
            setMute, clearMute,
        } as unknown as DashboardContextValue);
        act(() => { root.render(<GroupChatWindow />); });
    };
    const menuItem = (name: string) => Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
        .find(el => el.textContent?.trim() === name);
    const openMenu = () => {
        act(() => { document.body.querySelector<HTMLButtonElement>('button[aria-label="Más opciones"]')?.click(); });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
        setMute.mockResolvedValue(true);
        clearMute.mockResolvedValue(true);
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

    it('mutes the group for the chosen duration and closes the menu', async () => {
        render(false);
        openMenu();
        act(() => { menuItem('Silenciar notificaciones')?.click(); });
        expect(menuItem('8 horas')).toBeDefined();
        expect(menuItem('Siempre')).toBeDefined();
        await act(async () => { menuItem('1 semana')?.click(); });
        expect(setMute).toHaveBeenCalledWith({ kind: 'group', id: 5 }, '1w');
        expect(menuItem('Silenciar notificaciones')).toBeUndefined();
    });

    it('a muted group offers "Activar notificaciones"', async () => {
        render(true);
        openMenu();
        expect(menuItem('Silenciar notificaciones')).toBeUndefined();
        await act(async () => { menuItem('Activar notificaciones')?.click(); });
        expect(clearMute).toHaveBeenCalledWith({ kind: 'group', id: 5 });
    });

    it('no mute option after leaving the group', () => {
        render(false, { userRole: 'left' });
        openMenu();
        expect(menuItem('Silenciar notificaciones')).toBeUndefined();
        expect(menuItem('Activar notificaciones')).toBeUndefined();
    });

    describe('keyboard / a11y', () => {
        const trigger = () => document.body.querySelector<HTMLButtonElement>('button[aria-label="Más opciones"]');
        const press = (key: string) => {
            act(() => { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
        };

        it('every action is a menuitem; focus lands on the first and the arrows rove', () => {
            render(false);
            openMenu();
            const names = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]'))
                .map(el => el.textContent?.trim());
            expect(names).toEqual(['Silenciar notificaciones', 'Salir del grupo', 'Eliminar de mi lista', 'Vaciar chat']);
            expect(document.activeElement).toBe(menuItem('Silenciar notificaciones'));
            press('ArrowDown');
            expect(document.activeElement).toBe(menuItem('Salir del grupo'));
            press('End');
            expect(document.activeElement).toBe(menuItem('Vaciar chat'));
            press('ArrowDown');
            expect(document.activeElement).toBe(menuItem('Silenciar notificaciones'));
            press('ArrowUp');
            expect(document.activeElement).toBe(menuItem('Vaciar chat'));
            press('Home');
            expect(document.activeElement).toBe(menuItem('Silenciar notificaciones'));
        });

        it('Escape closes the menu and returns focus to "Más opciones"', () => {
            render(false);
            openMenu();
            expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
            press('Escape');
            expect(document.body.querySelector('[role="menu"]')).toBeNull();
            expect(document.activeElement).toBe(trigger());
        });

        it('after leaving, the first remaining item gets focus', () => {
            render(false, { userRole: 'left' });
            openMenu();
            expect(document.activeElement).toBe(menuItem('Eliminar de mi lista'));
        });
    });
});
