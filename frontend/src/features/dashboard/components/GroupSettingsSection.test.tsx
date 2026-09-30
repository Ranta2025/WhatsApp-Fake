// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import GroupSettingsSection from './GroupSettingsSection';
import { useDashboard, type DashboardContextValue, type SelectedGroup } from '../context/DashboardContext';
import { updateGroupSettings } from '../../../api/groupApi';

// group-admin (GA7): "Configuración del grupo" — admins toggle the three
// permission settings; non-admins see the current values read-only.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../../../api/groupApi', () => ({ updateGroupSettings: vi.fn() }));

const mockUseDashboard = vi.mocked(useDashboard);
const mockUpdateGroupSettings = vi.mocked(updateGroupSettings);

const group = (over: Partial<SelectedGroup> = {}): SelectedGroup => ({
    ID: 5, Name: 'Equipo', CreatorTelephon: '111', MemberCount: 3, UserRole: 'admin', CreatedAt: '2026-01-01T00:00:00Z',
    OnlyAdminsCanSend: false, OnlyAdminsCanEditInfo: false, OnlyAdminsCanAddMembers: false,
    ...over,
});

describe('GroupSettingsSection', () => {
    let container: HTMLDivElement;
    let root: Root;
    const setSelectedGroup = vi.fn();
    const setGroups = vi.fn();
    const addToast = vi.fn();

    const render = (over: Partial<SelectedGroup> = {}) => {
        mockUseDashboard.mockReturnValue({
            selectedGroup: group(over),
            setSelectedGroup,
            setGroups,
            addToast,
        } as unknown as DashboardContextValue);
        act(() => { root.render(<GroupSettingsSection />); });
    };

    const row = (testId: string) => container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    const clickButton = (el: Element | null, text: string) => {
        const btn = Array.from(el?.querySelectorAll('button') ?? []).find(b => b.textContent === text);
        act(() => { btn?.click(); });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockUpdateGroupSettings.mockResolvedValue({ data: { groupID: 5 } } as never);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('admin: toggling "Enviar mensajes" persists only that setting', async () => {
        render();
        expect(row('group-setting-send')?.textContent).toContain('Enviar mensajes');
        await act(async () => { clickButton(row('group-setting-send'), 'Solo admins'); });

        expect(mockUpdateGroupSettings).toHaveBeenCalledWith(5, { onlyAdminsCanSend: true });
        expect(setSelectedGroup).toHaveBeenCalledTimes(1);
        expect(setGroups).toHaveBeenCalledTimes(1);
        expect(addToast).toHaveBeenCalledWith({ type: 'success', message: 'Configuración actualizada' });
    });

    it('admin: each setting toggles independently', async () => {
        render();
        await act(async () => { clickButton(row('group-setting-edit'), 'Solo admins'); });
        await act(async () => { clickButton(row('group-setting-add'), 'Solo admins'); });
        expect(mockUpdateGroupSettings).toHaveBeenNthCalledWith(1, 5, { onlyAdminsCanEditInfo: true });
        expect(mockUpdateGroupSettings).toHaveBeenNthCalledWith(2, 5, { onlyAdminsCanAddMembers: true });
    });

    it('non-admin: read-only values, no toggles', () => {
        render({ UserRole: 'member', OnlyAdminsCanSend: true, OnlyAdminsCanEditInfo: false });
        expect(row('group-setting-send')?.querySelectorAll('button').length).toBe(0);
        expect(row('group-setting-send')?.textContent).toContain('Solo admins');
        expect(row('group-setting-edit')?.textContent).toContain('Todos');
        expect(mockUpdateGroupSettings).not.toHaveBeenCalled();
    });

    it('shows an error toast and keeps state if the PATCH fails', async () => {
        mockUpdateGroupSettings.mockRejectedValue({ response: { data: { error: 'nope' } } });
        render();
        await act(async () => { clickButton(row('group-setting-send'), 'Solo admins'); });
        expect(addToast).toHaveBeenCalledWith({ type: 'error', message: 'nope' });
        expect(setSelectedGroup).not.toHaveBeenCalled();
    });
});
