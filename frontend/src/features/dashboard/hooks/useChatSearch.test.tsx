// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useChatSearch, type ChatSearchState } from './useChatSearch';
import type { FocusTarget } from '../context/DashboardContext';
import type { SearchPage, SearchResult } from '../../../types/api';
import type { SearchPageOptions } from '../api/searchApi';

// message-search (MS5): debounced in-chat search with newest-first results, "n de N"
// navigation (older = up, newer = down), lazy paging and jump-to-message.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const hit = (id: number): SearchResult => ({ messageID: id, time: '2026-01-01T00:00:00Z', snippet: `m${id}`, highlights: [[0, 1]] });
const page = (ids: number[], hasMore = false): SearchPage => ({ results: ids.map(hit), hasMore });

const chatA: FocusTarget = { kind: 'chat', key: 'A' };
const chatB: FocusTarget = { kind: 'chat', key: 'B' };

describe('useChatSearch', () => {
    let host: HTMLDivElement;
    let root: Root;
    let state: ChatSearchState;
    const search = vi.fn<(q: string, opts: SearchPageOptions) => Promise<SearchPage>>();
    const openMessageAt = vi.fn<(t: FocusTarget, id: number) => Promise<boolean>>();

    function Harness({ target, onState }: { target: FocusTarget | null; onState: (s: ChatSearchState) => void }) {
        onState(useChatSearch({ target, search, openMessageAt, debounceMs: 300, pageSize: 3 }));
        return null;
    }

    const capture = (s: ChatSearchState) => { state = s; };
    const mount = (target: FocusTarget | null = chatA) => act(() => { root.render(<Harness target={target} onState={capture} />); });
    const type = async (q: string) => {
        act(() => { state.setQuery(q); });
        await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    };
    const openBar = () => act(() => { state.open(); });

    beforeEach(() => {
        vi.useFakeTimers();
        search.mockReset();
        openMessageAt.mockReset();
        openMessageAt.mockResolvedValue(true);
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    });
    afterEach(() => {
        act(() => root.unmount());
        host.remove();
        vi.useRealTimers();
    });

    it('starts closed and idle; open/close toggle the bar and close clears everything', async () => {
        search.mockResolvedValue(page([9, 8]));
        mount();
        expect(state).toMatchObject({ isOpen: false, status: 'idle', query: '', results: [] });
        openBar();
        expect(state.isOpen).toBe(true);
        await type('hola');
        expect(state.results).toHaveLength(2);

        act(() => { state.close(); });
        expect(state).toMatchObject({ isOpen: false, status: 'idle', query: '', results: [], activeQuery: '' });
    });

    it('debounces typing: one request with the trimmed term after the pause', async () => {
        search.mockResolvedValue(page([9]));
        mount(); openBar();
        act(() => { state.setQuery('h'); });
        await act(async () => { await vi.advanceTimersByTimeAsync(100); });
        act(() => { state.setQuery('ho'); });
        await act(async () => { await vi.advanceTimersByTimeAsync(100); });
        act(() => { state.setQuery('  hol '); });
        await act(async () => { await vi.advanceTimersByTimeAsync(299); });
        expect(search).not.toHaveBeenCalled();
        await act(async () => { await vi.advanceTimersByTimeAsync(2); });
        expect(search).toHaveBeenCalledTimes(1);
        expect(search).toHaveBeenCalledWith('hol', expect.objectContaining({ limit: 3, signal: expect.any(AbortSignal) }));
        expect(state.activeQuery).toBe('hol');
    });

    it('a term shorter than 2 characters does not search ("short"), and clearing goes back to idle', async () => {
        mount(); openBar();
        await type('a');
        expect(search).not.toHaveBeenCalled();
        expect(state.status).toBe('short');
        expect(state.activeQuery).toBe('');
        await type('   ');
        expect(state.status).toBe('idle');
    });

    it('jumps to the newest hit first and reports position "1 de N"', async () => {
        search.mockResolvedValue(page([30, 20, 10]));
        mount(); openBar();
        await type('hola');
        expect(state).toMatchObject({ status: 'ready', index: 0, hasMore: false });
        expect(state.results.map(r => r.messageID)).toEqual([30, 20, 10]);
        expect(openMessageAt).toHaveBeenCalledWith(chatA, 30);
    });

    it('older / newer walk the results and open each message; they stop at the ends', async () => {
        search.mockResolvedValue(page([30, 20, 10]));
        mount(); openBar();
        await type('hola');
        openMessageAt.mockClear();

        await act(async () => { state.goOlder(); });
        expect(state.index).toBe(1);
        expect(openMessageAt).toHaveBeenLastCalledWith(chatA, 20);
        await act(async () => { state.goOlder(); });
        expect(state.index).toBe(2);
        await act(async () => { state.goOlder(); });
        expect(state.index).toBe(2);
        expect(openMessageAt).toHaveBeenCalledTimes(2);

        await act(async () => { state.goNewer(); });
        expect(state.index).toBe(1);
        expect(openMessageAt).toHaveBeenLastCalledWith(chatA, 20);
        await act(async () => { state.goNewer(); });
        await act(async () => { state.goNewer(); });
        expect(state.index).toBe(0);
    });

    it('no results -> "empty" and nothing is opened', async () => {
        search.mockResolvedValue(page([]));
        mount(); openBar();
        await type('zzz');
        expect(state.status).toBe('empty');
        expect(openMessageAt).not.toHaveBeenCalled();
    });

    it('loads the next page (before = oldest loaded id) when navigating past the last loaded hit', async () => {
        search.mockResolvedValueOnce(page([30, 20, 10], true));
        mount(); openBar();
        await type('hola');
        expect(state.hasMore).toBe(true);

        search.mockResolvedValueOnce(page([9, 8], false));
        await act(async () => { state.goOlder(); });
        await act(async () => { state.goOlder(); });
        expect(state.index).toBe(2);
        await act(async () => { state.goOlder(); });

        expect(search).toHaveBeenLastCalledWith('hola', expect.objectContaining({ before: 10, limit: 3 }));
        expect(state.results.map(r => r.messageID)).toEqual([30, 20, 10, 9, 8]);
        expect(state.hasMore).toBe(false);
        expect(state.index).toBe(3);
        expect(openMessageAt).toHaveBeenLastCalledWith(chatA, 9);
    });

    it('pressing "anterior" at the last loaded hit while the prefetch is in flight waits for it and then jumps', async () => {
        search.mockResolvedValueOnce(page([30, 20, 10], true));
        mount(); openBar();
        await type('hola');

        let resolveNext: (p: SearchPage) => void = () => {};
        search.mockImplementationOnce(() => new Promise<SearchPage>(r => { resolveNext = r; }));
        await act(async () => { state.goOlder(); }); // index 1 -> starts the prefetch
        await act(async () => { state.goOlder(); }); // index 2 = last loaded, prefetch still pending
        expect(state.index).toBe(2);
        expect(state.loadingMore).toBe(true);
        await act(async () => { state.goOlder(); }); // must not be a no-op

        expect(search).toHaveBeenCalledTimes(2); // initial + ONE shared prefetch
        await act(async () => { resolveNext(page([9, 8], false)); });

        expect(state.results.map(r => r.messageID)).toEqual([30, 20, 10, 9, 8]);
        expect(state.index).toBe(3);
        expect(openMessageAt).toHaveBeenLastCalledWith(chatA, 9);
    });

    it('nothing ahead loaded: fetches the next page and then jumps to its first hit', async () => {
        search.mockResolvedValueOnce(page([30], true));
        mount(); openBar();
        await type('hola');
        expect(state.index).toBe(0);

        search.mockResolvedValueOnce(page([20, 10], false));
        await act(async () => { state.goOlder(); });

        expect(search).toHaveBeenLastCalledWith('hola', expect.objectContaining({ before: 30, limit: 3 }));
        expect(state.results.map(r => r.messageID)).toEqual([30, 20, 10]);
        expect(state.index).toBe(1);
        expect(openMessageAt).toHaveBeenLastCalledWith(chatA, 20);
    });

    it('nothing ahead loaded and the fetch fails or comes back empty: stays put without jumping', async () => {
        search.mockResolvedValueOnce(page([30], true));
        mount(); openBar();
        await type('hola');
        openMessageAt.mockClear();
        vi.spyOn(console, 'error').mockImplementation(() => {});

        search.mockRejectedValueOnce(new Error('boom'));
        await act(async () => { state.goOlder(); });
        expect(state.index).toBe(0);
        expect(state.loadingMore).toBe(false);
        expect(openMessageAt).not.toHaveBeenCalled();

        search.mockResolvedValueOnce(page([], false));
        await act(async () => { state.goOlder(); });
        expect(state.index).toBe(0);
        expect(state.hasMore).toBe(false);
        expect(openMessageAt).not.toHaveBeenCalled();
    });

    it('a new term supersedes the previous request: its late answer is ignored and it is aborted', async () => {
        let resolveFirst: (p: SearchPage) => void = () => {};
        let firstSignal: AbortSignal | undefined;
        search.mockImplementationOnce((_q, opts) => { firstSignal = opts.signal; return new Promise(r => { resolveFirst = r; }); });
        search.mockResolvedValueOnce(page([5]));
        mount(); openBar();
        await type('primero');
        await type('segundo');

        expect(firstSignal?.aborted).toBe(true);
        await act(async () => { resolveFirst(page([99, 98])); });
        expect(state.results.map(r => r.messageID)).toEqual([5]);
        expect(state.activeQuery).toBe('segundo');
    });

    it('a failed search reports "error" and can be retried by typing again', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        search.mockRejectedValueOnce(new Error('boom'));
        mount(); openBar();
        await type('hola');
        expect(state.status).toBe('error');

        search.mockResolvedValueOnce(page([7]));
        await type('hola!');
        expect(state.status).toBe('ready');
    });

    it('switching chat closes the search and drops results', async () => {
        search.mockResolvedValue(page([9]));
        mount(chatA); openBar();
        await type('hola');
        mount(chatB);
        expect(state).toMatchObject({ isOpen: false, status: 'idle', results: [] });
    });

    it('a stale jump (older openMessageAt) does not break navigation state', async () => {
        search.mockResolvedValue(page([30, 20]));
        openMessageAt.mockResolvedValue(false);
        mount(); openBar();
        await type('hola');
        expect(state.index).toBe(0);
        await act(async () => { state.goOlder(); });
        expect(state.index).toBe(1);
    });
});
