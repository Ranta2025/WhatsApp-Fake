// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import GroupChatWindow from './GroupChatWindow';
import { useDashboard, type DashboardContextValue, type SelectedGroup } from '../context/DashboardContext';
import { useGroupMessaging, type UseGroupMessagingResult } from '../hooks/useGroupMessaging';
import { changeGroupMemberRole, removeGroupMember } from '../../../api/groupApi';

// group-admin (GA7): member popover admin actions and the controls hidden by
// the permission matrix (Añadir, Cambiar foto, editar info).

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
    changeGroupMemberRole: vi.fn(),
    removeGroupMember: vi.fn(),
    updateGroupInfo: vi.fn(),
    leaveGroup: vi.fn(),
    updateGroupAvatar: vi.fn(),
    addGroupMembers: vi.fn(),
}));

const mockUseDashboard = vi.mocked(useDashboard);
const mockUseGroupMessaging = vi.mocked(useGroupMessaging);
const mockChangeRole = vi.mocked(changeGroupMemberRole);
const mockRemoveMember = vi.mocked(removeGroupMember);

const group = (over: Partial<SelectedGroup> = {}): SelectedGroup => ({
    id: 5, name: 'Equipo', creatorTelephon: '111', memberCount: 3, userRole: 'admin', createdAt: '2026-01-01T00:00:00Z',
    onlyAdminsCanSend: false, onlyAdminsCanEditInfo: false, onlyAdminsCanAddMembers: false,
    members: [
        { telephon: '111', username: 'ana', role: 'admin' },
        { telephon: '222', username: 'luis', role: 'member' },
    ],
    ...over,
});

describe('GroupChatWindow admin controls', () => {
    let container: HTMLDivElement;
    let root: Root;
    const setSelectedGroup = vi.fn();
    const setGroups = vi.fn();
    const addToast = vi.fn();

    const render = (over: Partial<SelectedGroup> = {}) => {
        mockUseDashboard.mockReturnValue({
            selectedGroup: group(over),
            setSelectedGroup, setGroups, addToast,
            groupMessages: { 5: [] }, setGroupMessages: vi.fn(),
            fetchGroupMessages: vi.fn(), fetchGroupDetail: vi.fn(), groupPaging: {}, loadOlderGroupMessages: vi.fn(),
            typingUsers: new Set(), profile: { telephon: '111' }, contacts: [], setSelected: vi.fn(),
            avatarMap: {}, myAvatar: '', globalWallpaper: null, groupReceipts: {}, focusedGroup: {},
            openMessageAt: vi.fn(), returnToLatest: vi.fn(), loadOlderFocused: vi.fn(), loadNewerFocused: vi.fn(),
        } as unknown as DashboardContextValue);
        act(() => { root.render(<GroupChatWindow />); });
    };

    const openPanel = () => {
        const header = Array.from(container.querySelectorAll('div')).find(d =>
            typeof d.className === 'string' && d.className.includes('cursor-pointer') && (d.textContent || '').includes('Equipo'));
        act(() => { header?.click(); });
    };
    const openMemberMenu = (username: string) => {
        const row = Array.from(container.querySelectorAll('div')).find(d =>
            typeof d.className === 'string' && d.className.includes('cursor-pointer') && (d.textContent || '').includes(username));
        act(() => { row?.click(); });
    };
    const portalButton = (text: string) =>
        Array.from(document.body.querySelectorAll('button')).find(b => b.textContent === text);
    const portalLabel = (text: string) =>
        Array.from(document.body.querySelectorAll('label')).find(l => (l.textContent || '').includes(text));

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
        mockChangeRole.mockResolvedValue({ data: { groupID: 5, telephon: '222', role: 'admin' } } as never);
        mockRemoveMember.mockResolvedValue({ data: { groupID: 5, telephon: '222' } } as never);
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

    it('admin sees Designar/Eliminar on a member and promote calls the API', async () => {
        render();
        openPanel();
        openMemberMenu('luis');

        expect(portalButton('Designar como admin')).toBeDefined();
        expect(portalButton('Eliminar')).toBeDefined();

        await act(async () => { portalButton('Designar como admin')?.click(); await Promise.resolve(); });
        expect(mockChangeRole).toHaveBeenCalledWith(5, '222', 'admin');
        expect(setSelectedGroup).toHaveBeenCalled();
    });

    it('admin sees "Descartar como admin" on an admin', () => {
        render({ members: [
            { telephon: '111', username: 'ana', role: 'admin' },
            { telephon: '222', username: 'luis', role: 'admin' },
        ] });
        openPanel();
        openMemberMenu('luis');
        expect(portalButton('Descartar como admin')).toBeDefined();
        expect(portalButton('Designar como admin')).toBeUndefined();
    });

    it('admin removing a member asks for confirmation', async () => {
        render();
        openPanel();
        openMemberMenu('luis');
        act(() => { portalButton('Eliminar')?.click(); });

        expect(container.textContent).toContain('¿Eliminar a luis?');
        const confirm = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Eliminar');
        await act(async () => { confirm?.click(); await Promise.resolve(); });
        expect(mockRemoveMember).toHaveBeenCalledWith(5, '222');
    });

    it('a plain member gets no admin actions', () => {
        render({ userRole: 'member' });
        openPanel();
        openMemberMenu('luis');
        expect(portalButton('Designar como admin')).toBeUndefined();
        expect(portalButton('Eliminar')).toBeUndefined();
    });

    it('"Añadir" is hidden when the group restricts adding to admins', () => {
        render({ userRole: 'member', onlyAdminsCanAddMembers: true });
        openPanel();
        expect(Array.from(container.querySelectorAll('button')).some(b => b.textContent === 'Añadir')).toBe(false);
    });

    it('"Añadir" is visible when open to everyone', () => {
        render({ userRole: 'member', onlyAdminsCanAddMembers: false });
        openPanel();
        expect(Array.from(container.querySelectorAll('button')).some(b => b.textContent === 'Añadir')).toBe(true);
    });

    it('"Cambiar foto" is hidden when info editing is restricted to admins', () => {
        render({ userRole: 'member', onlyAdminsCanEditInfo: true, avatarUrl: '/storage/g.png' });
        openPanel();
        act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="Foto del grupo"]')?.click(); });
        expect(portalLabel('Cambiar foto')).toBeUndefined();
        expect(portalButton('Ver foto')).toBeDefined();
    });

    it('"Cambiar foto" is visible to a member who may edit info', () => {
        render({ userRole: 'member', onlyAdminsCanEditInfo: false, avatarUrl: '/storage/g.png' });
        openPanel();
        act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="Foto del grupo"]')?.click(); });
        expect(portalLabel('Cambiar foto')).toBeDefined();
    });

    it('the info edit affordance follows canEditInfo', () => {
        render({ userRole: 'member', onlyAdminsCanEditInfo: true });
        openPanel();
        expect(container.querySelector('button[aria-label="Editar info del grupo"]')).toBeNull();

        act(() => { root.unmount(); });
        container.remove();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        render({ userRole: 'member', onlyAdminsCanEditInfo: false });
        openPanel();
        expect(container.querySelector('button[aria-label="Editar info del grupo"]')).not.toBeNull();
    });
});
