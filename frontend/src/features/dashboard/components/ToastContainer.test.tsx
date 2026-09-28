// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ToastContainer from './ToastContainer';
import { useDashboard, type DashboardContextValue } from '../context/DashboardContext';
import type { SelectedChatTarget } from '../lib/chatSelection';

// R3 (M6): `ToastContainer`'s `handleOpen` had the same fallback-shape bug
// fixed in M4's `resolveChatTarget` (features/dashboard/lib/chatSelection.ts)
// — falling back directly to an `allChatGroups` entry, which has
// `ContactTelephon` but no `Number` field, silently breaking every later
// `selected.Number` comparison. Fixed by delegating to `resolveChatTarget`.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({
    useDashboard: vi.fn(),
}));

const mockUseDashboard = vi.mocked(useDashboard);

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

    it('selects a target with Number set when falling back to an allChatGroups entry (no matching contact)', async () => {
        // `telephon` on the toast is dead today per M4's notes (no `addToast`
        // call site ever sets it) — synthesized here to exercise the wiring
        // as if a future caller did populate it.
        mockUseDashboard.mockReturnValue({
            toasts: [{ id: 1, type: 'info', message: 'hola', createdAt: Date.now(), telephon: '555', senderName: 'Bob' }],
            dismissToast,
            setSelected,
            setSidebarOpen,
            contacts: [],
            allChatGroups: {
                '555': { ContactTelephon: '555', ContactUsername: 'bob', ContactName: 'Bob', IsContact: true },
            },
            // Solo los campos que ToastContainer realmente lee — el resto de
            // DashboardContextValue no importa para este test.
        } as unknown as DashboardContextValue);

        await act(async () => {
            root.render(<ToastContainer />);
        });

        const card = container.querySelector('.pointer-events-auto');
        expect(card).not.toBeNull();
        await act(async () => {
            card!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(setSelected).toHaveBeenCalledTimes(1);
        const target = setSelected.mock.calls[0]?.[0] as SelectedChatTarget;
        expect(target.Number).toBe('555');
    });
});
