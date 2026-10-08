// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ReactionChips from './ReactionChips';
import type { ReactionSummary } from '../../../../types/api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ReactionChips', () => {
    let container: HTMLDivElement;
    let root: Root;
    const onToggle = vi.fn();
    const onShowWho = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const render = (reactions?: ReactionSummary[]) => act(() => {
        root.render(<ReactionChips reactions={reactions} onToggle={onToggle} onShowWho={onShowWho} />);
    });
    const chips = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'));

    it('renders nothing without reactions', () => {
        render(undefined);
        expect(container.innerHTML).toBe('');
        render([]);
        expect(container.innerHTML).toBe('');
    });

    it('draws one chip per entry with emoji and count, highlighting mine', () => {
        render([{ emoji: '👍', count: 2, mine: true }, { emoji: '❤️', count: 1, mine: false }]);
        expect(chips().map(c => c.textContent)).toEqual(['👍2', '❤️1']);
        expect(chips().map(c => c.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
        expect(chips().map(c => c.getAttribute('aria-label'))).toEqual(['👍 2, reaccionaste', '❤️ 1']);
    });

    it('tapping a chip toggles my reaction to that emoji', () => {
        render([{ emoji: '👍', count: 2, mine: true }, { emoji: '❤️', count: 1, mine: false }]);
        act(() => { chips()[1]?.click(); });
        expect(onToggle).toHaveBeenCalledExactlyOnceWith('❤️');
        expect(onShowWho).not.toHaveBeenCalled();
    });

    it('a separate control opens the who-reacted list', () => {
        render([{ emoji: '👍', count: 2, mine: false }]);
        act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="Ver reacciones"]')?.click(); });
        expect(onShowWho).toHaveBeenCalledTimes(1);
        expect(onToggle).not.toHaveBeenCalled();
    });
});
