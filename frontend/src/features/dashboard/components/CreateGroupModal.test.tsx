// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import CreateGroupModal from './CreateGroupModal';
import { useDashboard, type DashboardContextValue } from '../context/DashboardContext';
import { createGroup } from '../../../api/groupApi';
import type { ContactChat } from '../../../types/api';

// Item 6b: CreateGroupModal used `axios.isAxiosError`, so a plain-object
// rejection lost `response.data.error`. Now structural via lib/errors.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../../../api/groupApi', () => ({ createGroup: vi.fn() }));

const mockUseDashboard = vi.mocked(useDashboard);
const mockCreateGroup = vi.mocked(createGroup);

const makeContact = (): ContactChat => ({
    Username: 'member-one',
    Number: '123',
    Status: 'accepted',
    ContactName: 'Member One',
    last_seen: null,
    avatar_url: '',
    wallpaper_url: '',
});

const setInputValue = (el: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('CreateGroupModal error extraction', () => {
    let container: HTMLDivElement;
    let root: Root;
    const addToast = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        mockUseDashboard.mockReturnValue({
            contacts: [makeContact()],
            addToast,
            fetchUserGroups: vi.fn(),
        } as unknown as DashboardContextValue);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('shows response.data.error from a plain (non-Axios) rejection', async () => {
        mockCreateGroup.mockRejectedValue({ response: { data: { error: 'group boom' } } });

        await act(async () => {
            root.render(<CreateGroupModal isOpen onClose={vi.fn()} />);
        });

        const nameInput = container.querySelector('input[placeholder="Nombre del grupo"]') as HTMLInputElement;
        await act(async () => { setInputValue(nameInput, 'Squad'); });

        const memberBtn = Array.from(container.querySelectorAll('button')).find(b => (b.textContent || '').includes('Member One'));
        expect(memberBtn).toBeDefined();
        await act(async () => { memberBtn!.click(); });

        const submit = Array.from(container.querySelectorAll('button')).find(b => (b.textContent || '').includes('Crear grupo'));
        expect(submit).toBeDefined();
        await act(async () => {
            submit!.click();
            await Promise.resolve();
        });

        expect(addToast).toHaveBeenCalledWith({ type: 'error', message: 'group boom' });
    });
});

// group-admin (GA7 / CUSTOM Q4): the create flow exposes the three permission
// settings (default open) and forwards them to the create-group API.
describe('CreateGroupModal permission settings', () => {
    let container: HTMLDivElement;
    let root: Root;
    const addToast = vi.fn();
    const fetchUserGroups = vi.fn();

    const fillCreateForm = async () => {
        await act(async () => { root.render(<CreateGroupModal isOpen onClose={vi.fn()} />); });
        const nameInput = container.querySelector('input[placeholder="Nombre del grupo"]') as HTMLInputElement;
        await act(async () => { setInputValue(nameInput, 'Squad'); });
        const memberBtn = Array.from(container.querySelectorAll('button')).find(b => (b.textContent || '').includes('Member One'));
        await act(async () => { memberBtn!.click(); });
    };

    const rowButton = (testId: string, text: string) => {
        const row = container.querySelector(`[data-testid="${testId}"]`);
        return Array.from(row?.querySelectorAll('button') ?? []).find(b => b.textContent === text);
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockCreateGroup.mockResolvedValue(undefined as never);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        mockUseDashboard.mockReturnValue({
            contacts: [makeContact()],
            addToast,
            fetchUserGroups,
        } as unknown as DashboardContextValue);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('submits all three settings, defaulting to open', async () => {
        await fillCreateForm();
        await act(async () => { rowButton('create-setting-send', 'Solo admins')?.click(); });

        const submit = Array.from(container.querySelectorAll('button')).find(b => (b.textContent || '').includes('Crear grupo'));
        await act(async () => { submit!.click(); await Promise.resolve(); });

        expect(mockCreateGroup).toHaveBeenCalledWith('Squad', '', ['123'], {
            onlyAdminsCanSend: true,
            onlyAdminsCanEditInfo: false,
            onlyAdminsCanAddMembers: false,
        });
    });

    it('shows the three labelled settings rows', async () => {
        await fillCreateForm();
        expect(container.textContent).toContain('Enviar mensajes');
        expect(container.textContent).toContain('Editar info del grupo');
        expect(container.textContent).toContain('Agregar otros participantes');
    });
});

