// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ReactionPicker, { QUICK_REACTIONS } from './ReactionPicker';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ReactionPicker (quick row)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const onSelect = vi.fn();
    const onMore = vi.fn();

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

    const render = (current?: string) => act(() => {
        root.render(<ReactionPicker currentEmoji={current} onSelect={onSelect} onMore={onMore} />);
    });
    const btn = (label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b => b.getAttribute('aria-label') === label) ?? null;

    it('renders the six quick emojis in order, each with an accessible name', () => {
        render();
        expect(QUICK_REACTIONS).toEqual(['👍', '❤️', '😂', '😮', '😢', '🙏']);
        const labels = Array.from(container.querySelectorAll('button')).map(b => b.getAttribute('aria-label'));
        expect(labels).toEqual([
            'Reaccionar con 👍', 'Reaccionar con ❤️', 'Reaccionar con 😂',
            'Reaccionar con 😮', 'Reaccionar con 😢', 'Reaccionar con 🙏', 'Más emojis',
        ]);
    });

    it('calls onSelect with the tapped emoji', () => {
        render();
        act(() => { btn('Reaccionar con 😂')?.click(); });
        expect(onSelect).toHaveBeenCalledExactlyOnceWith('😂');
    });

    it('marks only my current reaction as pressed (and still lets me tap it to toggle off)', () => {
        render('❤️');
        const pressed = Array.from(container.querySelectorAll('button[aria-pressed="true"]')).map(b => b.getAttribute('aria-label'));
        expect(pressed).toEqual(['Reaccionar con ❤️']);
        expect(btn('Reaccionar con 👍')?.getAttribute('aria-pressed')).toBe('false');
        act(() => { btn('Reaccionar con ❤️')?.click(); });
        expect(onSelect).toHaveBeenCalledWith('❤️');
    });

    it('"+" asks for the full picker', () => {
        render();
        act(() => { btn('Más emojis')?.click(); });
        expect(onMore).toHaveBeenCalledTimes(1);
        expect(onSelect).not.toHaveBeenCalled();
    });
});
