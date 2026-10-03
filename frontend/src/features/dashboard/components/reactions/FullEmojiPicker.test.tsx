// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import FullEmojiPicker from './FullEmojiPicker';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The real loader pulls in the web component and the emoji data: lazy chunk only.
const picker = vi.hoisted(() => ({ el: null as HTMLElement | null }));
vi.mock('./emojiPickerLoader', () => ({
    createEmojiPicker: () => {
        picker.el = document.createElement('div');
        picker.el.setAttribute('data-testid', 'fake-picker');
        return picker.el;
    },
}));

describe('FullEmojiPicker', () => {
    let container: HTMLDivElement;
    let root: Root;
    const onSelect = vi.fn();
    const onClose = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        picker.el = null;
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const render = async () => {
        await act(async () => { root.render(<FullEmojiPicker onSelect={onSelect} onClose={onClose} />); });
    };

    it('lazy-loads the picker element into a dialog', async () => {
        await render();
        expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Elegir emoji');
        expect(container.querySelector('[data-testid="fake-picker"]')).not.toBeNull();
    });

    it('reports the chosen emoji from the emoji-click event', async () => {
        await render();
        act(() => { picker.el?.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '🎉' } })); });
        expect(onSelect).toHaveBeenCalledExactlyOnceWith('🎉');
    });

    it('ignores an event without unicode (custom emoji)', async () => {
        await render();
        act(() => { picker.el?.dispatchEvent(new CustomEvent('emoji-click', { detail: {} })); });
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('closes from the close button', async () => {
        await render();
        act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="Cerrar"]')?.click(); });
        expect(onClose).toHaveBeenCalled();
    });
});
