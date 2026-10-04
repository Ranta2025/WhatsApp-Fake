// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ChatSearchBar from './ChatSearchBar';
import type { ChatSearchState } from '../hooks/useChatSearch';
import type { SearchResult } from '../../../types/api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const hit = (id: number): SearchResult => ({ messageID: id, time: '', snippet: 'x', highlights: [] });

const makeState = (over: Partial<ChatSearchState> = {}): ChatSearchState => ({
    isOpen: true, open: vi.fn(), close: vi.fn(), query: '', setQuery: vi.fn(), status: 'idle', results: [], index: 0,
    hasMore: false, loadingMore: false, activeQuery: '', goOlder: vi.fn(), goNewer: vi.fn(), ...over,
});

describe('ChatSearchBar', () => {
    let host: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    });
    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    const render = (state: ChatSearchState) => act(() => { root.render(<ChatSearchBar search={state} />); });
    const input = () => host.querySelector('input') as HTMLInputElement;
    const button = (label: string) => host.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
    const status = () => host.querySelector('[role="status"]')?.textContent ?? '';

    it('focuses the input on open and shows the placeholder "Buscar"', () => {
        render(makeState());
        expect(document.activeElement).toBe(input());
        expect(input().placeholder).toBe('Buscar');
    });

    it('forwards typing to setQuery', () => {
        const state = makeState();
        render(state);
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        act(() => {
            setter?.call(input(), 'hola');
            input().dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(state.setQuery).toHaveBeenCalledWith('hola');
    });

    it('shows "n de N" (with a "+" while more results can be loaded) for the current hit', () => {
        render(makeState({ status: 'ready', query: 'hola', results: [hit(9), hit(8), hit(7)], index: 1 }));
        expect(status()).toBe('2 de 3');
        render(makeState({ status: 'ready', query: 'hola', results: [hit(9), hit(8), hit(7)], index: 0, hasMore: true }));
        expect(status()).toBe('1 de 3+');
    });

    it('shows a message for each non-ready status', () => {
        render(makeState({ status: 'empty', query: 'zzz' }));
        expect(status()).toBe('Sin resultados');
        render(makeState({ status: 'short', query: 'a' }));
        expect(status()).toBe('Escribe al menos 2 caracteres');
        render(makeState({ status: 'loading', query: 'hola' }));
        expect(status()).toBe('Buscando…');
        render(makeState({ status: 'error', query: 'hola' }));
        expect(status()).toBe('No se pudo buscar');
        render(makeState({ status: 'idle' }));
        expect(status()).toBe('');
    });

    it('up goes to the older hit, down to the newer one, and each is disabled at its end', () => {
        const state = makeState({ status: 'ready', query: 'hola', results: [hit(9), hit(8)], index: 0 });
        render(state);
        expect(button('Coincidencia siguiente').disabled).toBe(true);
        expect(button('Coincidencia anterior').disabled).toBe(false);
        act(() => { button('Coincidencia anterior').click(); });
        expect(state.goOlder).toHaveBeenCalledTimes(1);

        const atOldest = makeState({ status: 'ready', query: 'hola', results: [hit(9), hit(8)], index: 1 });
        render(atOldest);
        expect(button('Coincidencia anterior').disabled).toBe(true);
        act(() => { button('Coincidencia siguiente').click(); });
        expect(atOldest.goNewer).toHaveBeenCalledTimes(1);
    });

    it('"anterior" stays enabled at the last loaded hit while more can be loaded', () => {
        render(makeState({ status: 'ready', query: 'hola', results: [hit(9)], index: 0, hasMore: true }));
        expect(button('Coincidencia anterior').disabled).toBe(false);
    });

    it('Enter goes to the older hit and Shift+Enter to the newer one', () => {
        const state = makeState({ status: 'ready', query: 'hola', results: [hit(9), hit(8)], index: 0 });
        render(state);
        act(() => { input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
        expect(state.goOlder).toHaveBeenCalledTimes(1);
        act(() => { input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })); });
        expect(state.goNewer).toHaveBeenCalledTimes(1);
    });

    it('the close button and Escape (through the escape stack) close the search', () => {
        const state = makeState();
        render(state);
        act(() => { button('Cerrar búsqueda').click(); });
        expect(state.close).toHaveBeenCalledTimes(1);

        act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
        expect(state.close).toHaveBeenCalledTimes(2);
    });
});
