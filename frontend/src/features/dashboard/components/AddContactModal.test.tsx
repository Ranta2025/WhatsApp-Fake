// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import AddContactModal from './AddContactModal';
import { useDashboard, type DashboardContextValue } from '../context/DashboardContext';
import api from '../../../api/axios';

// Item 6b: prove AddContactModal extracts the server error structurally, even
// when the rejection is a plain object (not a real AxiosError).

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../../../api/axios', () => ({
    default: { post: vi.fn(), put: vi.fn(), get: vi.fn() },
}));

const mockUseDashboard = vi.mocked(useDashboard);
const mockPost = vi.mocked(api.post);

describe('AddContactModal error extraction', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        mockUseDashboard.mockReturnValue({
            setContacts: vi.fn(),
            setSelected: vi.fn(),
            setAllChatGroups: vi.fn(),
            setSidebarView: vi.fn(),
            setSidebarOpen: vi.fn(),
            fetchContacts: vi.fn(),
        } as unknown as DashboardContextValue);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('shows response.data.message from a plain (non-Axios) rejection', async () => {
        mockPost.mockRejectedValue({ response: { data: { message: 'server says no' } } });

        await act(async () => {
            root.render(
                <AddContactModal isOpen onClose={vi.fn()} initialNumber="+5355555555" initialName="Ann" />
            );
        });

        const submit = Array.from(container.querySelectorAll('button')).find(b => (b.textContent || '').includes('Añadir'));
        expect(submit).toBeDefined();
        await act(async () => {
            submit!.click();
            await Promise.resolve();
        });

        expect(mockPost).toHaveBeenCalled();
        expect(container.textContent).toContain('server says no');
    });

    it('prefers response.data.message over response.data.error when a body carries both (original precedence)', async () => {
        mockPost.mockRejectedValue({ response: { data: { error: 'generic err', message: 'specific msg' } } });

        await act(async () => {
            root.render(
                <AddContactModal isOpen onClose={vi.fn()} initialNumber="+5355555555" initialName="Ann" />
            );
        });

        const submit = Array.from(container.querySelectorAll('button')).find(b => (b.textContent || '').includes('Añadir'));
        await act(async () => {
            submit!.click();
            await Promise.resolve();
        });

        expect(container.textContent).toContain('specific msg');
        expect(container.textContent).not.toContain('generic err');
    });

    it('falls to the generic copy (not err.message) when the rejection has no response body (original behavior)', async () => {
        mockPost.mockRejectedValue(new Error('Network Error'));

        await act(async () => {
            root.render(
                <AddContactModal isOpen onClose={vi.fn()} initialNumber="+5355555555" initialName="Ann" />
            );
        });

        const submit = Array.from(container.querySelectorAll('button')).find(b => (b.textContent || '').includes('Añadir'));
        await act(async () => {
            submit!.click();
            await Promise.resolve();
        });

        expect(container.textContent).toContain('Error al agregar');
        expect(container.textContent).not.toContain('Network Error');
    });
});
