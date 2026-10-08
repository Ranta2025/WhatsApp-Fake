// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ToastContainer from './ToastContainer';
import { useDashboard, type DashboardContextValue, type Toast } from '../context/DashboardContext';
import type { SelectedChatTarget } from '../lib/chatSelection';
import type { ContactChat } from '../../../types/api';

// R3 (M6): `ToastContainer`'s `handleOpen` had the same fallback-shape bug
// fixed in M4's `resolveChatTarget` (features/dashboard/lib/chatSelection.ts)
// — falling back directly to an `allChatGroups` entry, which has
// `ContactTelephon` but no `Number` field, silently breaking every later
// `selected.Number` comparison. Fixed by delegating to `resolveChatTarget`.
// M6b item 4: the M6 refactor dropped the original
// `ContactName: notif.senderName` from the last-resort fallback; now passed
// through as `resolveChatTarget`'s fallbackName.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({
    useDashboard: vi.fn(),
}));

const mockUseDashboard = vi.mocked(useDashboard);

type TestToast = Toast & { telephon?: string; senderName?: string };

const makeToast = (overrides: Partial<TestToast> = {}): TestToast => ({
    id: 1,
    type: 'info',
    message: 'hola',
    createdAt: Date.now(),
    ...overrides,
});

const makeContact = (overrides: Partial<ContactChat> = {}): ContactChat => ({
    username: 'bob',
    telephon: '555',
    status: 'accepted',
    contactName: 'Contact Bob',
    lastSeen: null,
    avatarUrl: '',
    wallpaperUrl: '',
    ...overrides,
});

describe('ToastContainer handleOpen', () => {
    let container: HTMLDivElement;
    let root: Root;
    const setSelected = vi.fn();
    const setSidebarOpen = vi.fn();
    const dismissToast = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    const renderWith = async (props: Partial<DashboardContextValue>) => {
        mockUseDashboard.mockReturnValue({
            dismissToast,
            setSelected,
            setSidebarOpen,
            contacts: [],
            allChatGroups: {},
            ...props,
        } as unknown as DashboardContextValue);

        await act(async () => {
            root.render(<ToastContainer />);
        });

        const card = container.querySelector('.pointer-events-auto');
        expect(card).not.toBeNull();
        await act(async () => {
            card!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
    };

    const selectedTarget = () => setSelected.mock.calls[0]?.[0] as SelectedChatTarget;

    it('selects the matching contact when the telephon is a known contact', async () => {
        const contact = makeContact({ telephon: '555', contactName: 'Contact Bob' });
        await renderWith({ toasts: [makeToast({ telephon: '555', senderName: 'Bob' })], contacts: [contact] });

        expect(selectedTarget()).toBe(contact);
        expect(setSidebarOpen).toHaveBeenCalledWith(false);
        expect(dismissToast).toHaveBeenCalledTimes(1);
    });

    it('selects a telephon-bearing target from allChatGroups when there is no contact match', async () => {
        await renderWith({
            toasts: [makeToast({ telephon: '555', senderName: 'Bob' })],
            allChatGroups: {
                '555': { ContactTelephon: '555', ContactUsername: 'bob', ContactName: 'Bob', IsContact: true },
            },
        });

        expect(selectedTarget().telephon).toBe('555');
        expect(selectedTarget().contactName).toBe('Bob');
        expect(setSidebarOpen).toHaveBeenCalledWith(false);
    });

    it('restores senderName as contactName when neither contact nor chat group match', async () => {
        await renderWith({ toasts: [makeToast({ telephon: '777', senderName: 'Unknown Sender' })] });

        expect(selectedTarget().telephon).toBe('777');
        expect(selectedTarget().contactName).toBe('Unknown Sender');
        expect(setSidebarOpen).toHaveBeenCalledWith(false);
    });

    it('still names the target when the toast has no telephon', async () => {
        await renderWith({ toasts: [makeToast({ senderName: 'Unknown Sender' })] });

        expect(selectedTarget().telephon).toBe('');
        expect(selectedTarget().contactName).toBe('Unknown Sender');
        expect(setSidebarOpen).toHaveBeenCalledWith(false);
        expect(dismissToast).toHaveBeenCalledWith(1);
    });
});
