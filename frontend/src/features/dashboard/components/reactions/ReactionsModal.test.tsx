// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ReactionsModal from './ReactionsModal';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockGetReactions = vi.fn();
vi.mock('../../../../api/reactionApi', () => ({
    getReactions: (...args: unknown[]) => mockGetReactions(...args),
}));

describe('ReactionsModal', () => {
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

    const render = async (target: { kind: 'direct' | 'group'; messageID: number; groupID?: number } = { kind: 'direct', messageID: 5 }) => {
        await act(async () => { root.render(<ReactionsModal target={target} myTelephon="111" onClose={onClose} />); });
    };
    const text = () => container.textContent ?? '';

    it('shows loading, then everyone grouped with "Tú" for me', async () => {
        let resolve!: (v: unknown) => void;
        mockGetReactions.mockReturnValue(new Promise(r => { resolve = r; }));
        await render({ kind: 'group', messageID: 5, groupID: 9 });
        expect(mockGetReactions).toHaveBeenCalledWith('group', 5, 9);
        expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Reacciones');
        expect(text()).toContain('Cargando');

        await act(async () => {
            resolve({ reactions: [
                { emoji: '👍', users: [{ telephon: '111', username: 'ana', avatarUrl: '' }, { telephon: '222', username: 'luis', avatarUrl: '' }] },
                { emoji: '❤️', users: [{ telephon: '333', username: 'marta', avatarUrl: '' }] },
            ] });
        });
        expect(text()).not.toContain('Cargando');
        expect(text()).toContain('Tú');
        expect(text()).toContain('luis');
        expect(text()).toContain('marta');
        expect(text()).not.toContain('ana');
    });

    it('filters by emoji tab and goes back to all', async () => {
        mockGetReactions.mockResolvedValue({ reactions: [
            { emoji: '👍', users: [{ telephon: '222', username: 'luis', avatarUrl: '' }] },
            { emoji: '❤️', users: [{ telephon: '333', username: 'marta', avatarUrl: '' }] },
        ] });
        await render();
        const tab = (label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b => b.getAttribute('aria-label') === label) ?? null;
        await act(async () => { tab('Ver solo ❤️')?.click(); });
        expect(text()).toContain('marta');
        expect(text()).not.toContain('luis');
        expect(tab('Ver solo ❤️')?.getAttribute('aria-pressed')).toBe('true');
        await act(async () => { tab('Ver todas')?.click(); });
        expect(text()).toContain('luis');
        expect(text()).toContain('marta');
    });

    it('shows an error when loading fails', async () => {
        mockGetReactions.mockRejectedValue(new Error('boom'));
        await render();
        expect(container.querySelector('[role="alert"]')).not.toBeNull();
    });

    it('shows an empty message when nobody reacted any more', async () => {
        mockGetReactions.mockResolvedValue({ reactions: [] });
        await render();
        expect(text()).toContain('Nadie ha reaccionado');
    });

    it('closes with the close button', async () => {
        mockGetReactions.mockResolvedValue({ reactions: [] });
        await render();
        act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="Cerrar"]')?.click(); });
        expect(onClose).toHaveBeenCalled();
    });
});
