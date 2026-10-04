// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import HighlightedText from './HighlightedText';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('HighlightedText', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const render = (text: string, query?: string) => act(() => { root.render(<div><HighlightedText text={text} query={query} /></div>); });
    const marks = () => Array.from(container.querySelectorAll('mark')).map(m => m.textContent);

    it('wraps accent/case-insensitive matches in <mark> keeping the original characters', () => {
        render('Qué CANCIÓN tan buena, otra canción', 'cancion');
        expect(marks()).toEqual(['CANCIÓN', 'canción']);
        expect(container.textContent).toBe('Qué CANCIÓN tan buena, otra canción');
    });

    it('renders plain text (no <mark>) without a query, with a blank query or without matches', () => {
        for (const q of [undefined, '', '   ', 'zzz']) {
            render('hola mundo', q);
            expect(container.querySelector('mark')).toBeNull();
            expect(container.textContent).toBe('hola mundo');
        }
    });

    it('never injects markup from the message text', () => {
        render('<img src=x onerror=alert(1)> hola', 'hola');
        expect(container.querySelector('img')).toBeNull();
        expect(marks()).toEqual(['hola']);
        expect(container.textContent).toBe('<img src=x onerror=alert(1)> hola');
    });
});
