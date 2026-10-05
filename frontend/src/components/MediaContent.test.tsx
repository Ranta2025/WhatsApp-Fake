// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import MediaContent from './MediaContent';
import type { MediaMessageFields } from '../lib/mediaMessage';

// SB3: sticker rendering. A built-in sticker is a bare 150x150 <img> (no
// wrapper, no new tab on click); an unknown URL still renders with a generic alt.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('MediaContent sticker rendering', () => {
    let container: HTMLDivElement;
    let root: Root;

    const render = (message: MediaMessageFields, isMine = false) => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => { root.render(<MediaContent message={message} isMine={isMine} />); });
    };

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('sticker: <img> 150x150 con el alt del pack y sin abrir en otra pestaña', () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);
        render({ MediaType: 'sticker', MediaUrl: '/stickers/basic/hola.webp' });

        const img = container.querySelector('img');
        expect(img?.getAttribute('src')).toBe('/stickers/basic/hola.webp');
        expect(img?.getAttribute('alt')).toBe('Sticker con la palabra Hola');
        expect(img?.getAttribute('width')).toBe('150');
        expect(img?.getAttribute('height')).toBe('150');
        expect(img?.getAttribute('loading')).toBe('lazy');
        expect(img?.getAttribute('draggable')).toBe('false');

        act(() => { img?.click(); });
        expect(open).not.toHaveBeenCalled();
        open.mockRestore();
    });

    it('sticker fuera del pack: alt genérico "Sticker"', () => {
        render({ MediaType: 'sticker', MediaUrl: '/stickers/basic/desconocido.webp' });
        expect(container.querySelector('img')?.getAttribute('alt')).toBe('Sticker');
    });
});
