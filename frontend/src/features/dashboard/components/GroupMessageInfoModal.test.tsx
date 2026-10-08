// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import GroupMessageInfoModal from './GroupMessageInfoModal';
import type { GroupMessageResponse } from '../../../types/api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockGetReceipts = vi.fn();
vi.mock('../../../api/groupApi', () => ({
    getGroupMessageReceipts: (...args: unknown[]) => mockGetReceipts(...args),
}));

const message: GroupMessageResponse = {
    messageID: 42, groupID: 7, senderTelephon: '111', senderUsername: 'ana', message: 'hola equipo',
    time: '2026-01-01T10:00:00Z', edited: false,
};

describe('GroupMessageInfoModal', () => {
    let container: HTMLDivElement;
    let root: Root;
    const onClose = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.restoreAllMocks();
    });

    const render = async () => {
        await act(async () => { root.render(<GroupMessageInfoModal message={message} onClose={onClose} />); });
    };
    const text = () => container.textContent ?? '';

    it('shows a loading state, then "Leído por" and "Entregado a" with the members', async () => {
        let resolve!: (v: unknown) => void;
        mockGetReceipts.mockReturnValue(new Promise(r => { resolve = r; }));
        await render();
        expect(mockGetReceipts).toHaveBeenCalledWith(7, 42);
        expect(text()).toContain('Cargando');

        await act(async () => {
            resolve({ data: {
                readBy: [{ telephon: '222', username: 'luis' }],
                deliveredTo: [{ telephon: '333', username: 'marta' }],
                pending: [{ telephon: '444', username: 'pepe' }],
            } });
        });

        expect(text()).toContain('hola equipo');
        expect(text()).toContain('Leído por');
        expect(text()).toContain('Entregado a');
        expect(text()).toContain('luis');
        expect(text()).toContain('marta');
        expect(text()).toContain('Sin entregar');
        expect(text()).toContain('pepe');
        const headings = Array.from(container.querySelectorAll('h3')).map(h => h.textContent);
        expect(headings).toEqual(['Leído por', 'Entregado a', 'Sin entregar']);
    });

    it('says nobody yet for empty lists and hides the pending section', async () => {
        mockGetReceipts.mockResolvedValue({ data: { readBy: [], deliveredTo: [], pending: [] } });
        await render();

        expect(text().match(/Nadie todavía/g)).toHaveLength(2);
        expect(text()).not.toContain('Sin entregar');
    });

    it('tolerates a malformed body', async () => {
        mockGetReceipts.mockResolvedValue({ data: null });
        await render();
        expect(text().match(/Nadie todavía/g)).toHaveLength(2);
    });

    it('shows the server error message when the request fails', async () => {
        mockGetReceipts.mockRejectedValue({ response: { data: { error: 'solo el autor del mensaje puede ver sus acuses' } } });
        await render();
        expect(container.querySelector('[role="alert"]')?.textContent).toContain('solo el autor');
    });

    it('falls back to a generic error', async () => {
        mockGetReceipts.mockRejectedValue(new Error('network'));
        await render();
        expect(container.querySelector('[role="alert"]')?.textContent).toContain('No se pudo cargar');
    });

    it('closes from the close button and by clicking the backdrop', async () => {
        mockGetReceipts.mockResolvedValue({ data: { readBy: [], deliveredTo: [], pending: [] } });
        await render();

        act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="Cerrar"]')?.click(); });
        expect(onClose).toHaveBeenCalledTimes(1);

        act(() => { container.firstElementChild?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('ignores a response that arrives after unmount', async () => {
        let resolve!: (v: unknown) => void;
        mockGetReceipts.mockReturnValue(new Promise(r => { resolve = r; }));
        await render();
        act(() => root.unmount());
        await expect(act(async () => { resolve({ data: { readBy: [], deliveredTo: [], pending: [] } }); })).resolves.not.toThrow();
        root = createRoot(container);
    });
});
