// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useGlobalMessageSearch, type GlobalMessageSearch } from './useGlobalMessageSearch';
import type { GlobalSearchOptions } from '../api/searchApi';
import type { GlobalSearchChat, GlobalSearchResponse } from '../../../types/api';

// message-search (MS6): debounced (300 ms) global message search that aborts stale requests.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const chat = (key: string): GlobalSearchChat => ({
    kind: 'direct', key, name: key, avatarUrl: '', total: 1,
    results: [{ messageID: 1, time: '', snippet: 'hola', highlights: [[0, 4]] }],
});

describe('useGlobalMessageSearch', () => {
    let host: HTMLDivElement;
    let root: Root;
    let out: GlobalMessageSearch;
    const search = vi.fn<(q: string, opts: GlobalSearchOptions) => Promise<GlobalSearchResponse>>();

    function Harness({ term, enabled, onOut }: { term: string; enabled: boolean; onOut: (o: GlobalMessageSearch) => void }) {
        onOut(useGlobalMessageSearch({ term, enabled, search, debounceMs: 300 }));
        return null;
    }
    const capture = (o: GlobalMessageSearch) => { out = o; };
    const mount = (term: string, enabled = true) => act(() => { root.render(<Harness term={term} enabled={enabled} onOut={capture} />); });
    const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

    beforeEach(() => {
        vi.useFakeTimers();
        search.mockReset();
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    });
    afterEach(() => {
        act(() => root.unmount());
        host.remove();
        vi.useRealTimers();
    });

    it('is idle without a term or when disabled, and never calls the API', async () => {
        mount('');
        await wait(500);
        expect(out).toMatchObject({ status: 'idle', chats: [] });
        mount('hola', false);
        await wait(500);
        expect(out.status).toBe('idle');
        expect(search).not.toHaveBeenCalled();
    });

    it('ignores terms shorter than 2 characters after trimming', async () => {
        mount(' a ');
        await wait(500);
        expect(search).not.toHaveBeenCalled();
        expect(out.status).toBe('idle');
    });

    it('debounces by 300 ms, sends the trimmed term with chat/per-chat caps and exposes the results', async () => {
        search.mockResolvedValue({ chats: [chat('+2')] });
        mount('  hola ');
        expect(out.status).toBe('loading');
        await wait(299);
        expect(search).not.toHaveBeenCalled();
        await wait(2);
        expect(search).toHaveBeenCalledWith('hola', expect.objectContaining({ limit: 20, perChat: 3, signal: expect.any(AbortSignal) }));
        expect(out.status).toBe('ready');
        expect(out.chats.map(c => c.key)).toEqual(['+2']);
    });

    it('typing again within the debounce window issues a single request', async () => {
        search.mockResolvedValue({ chats: [] });
        mount('ho');
        await wait(200);
        mount('hol');
        await wait(200);
        mount('hola');
        await wait(310);
        expect(search).toHaveBeenCalledTimes(1);
        expect(search).toHaveBeenCalledWith('hola', expect.anything());
    });

    it('aborts the in-flight request when the term changes and ignores its late answer', async () => {
        let resolveFirst: (r: GlobalSearchResponse) => void = () => {};
        let firstSignal: AbortSignal | undefined;
        search.mockImplementationOnce((_q, opts) => { firstSignal = opts.signal; return new Promise(r => { resolveFirst = r; }); });
        search.mockResolvedValueOnce({ chats: [chat('+9')] });
        mount('primero');
        await wait(310);
        mount('segundo');
        expect(firstSignal?.aborted).toBe(true);
        expect(out.status).toBe('loading');
        await wait(310);
        await act(async () => { resolveFirst({ chats: [chat('+1')] }); });
        expect(out.chats.map(c => c.key)).toEqual(['+9']);
    });

    it('does not show results of an older term while the new one is pending', async () => {
        search.mockResolvedValue({ chats: [chat('+2')] });
        mount('hola');
        await wait(310);
        expect(out.chats).toHaveLength(1);
        mount('holaa');
        expect(out).toMatchObject({ status: 'loading', chats: [] });
    });

    it('reports errors and clears them with the next term; clearing the term returns to idle', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        search.mockRejectedValueOnce(new Error('boom'));
        mount('hola');
        await wait(310);
        expect(out.status).toBe('error');

        search.mockResolvedValueOnce({ chats: [] });
        mount('hola!');
        await wait(310);
        expect(out).toMatchObject({ status: 'ready', chats: [] });

        mount('');
        expect(out).toMatchObject({ status: 'idle', chats: [] });
    });

    it('aborts on unmount', async () => {
        let signal: AbortSignal | undefined;
        search.mockImplementation((_q, opts) => { signal = opts.signal; return new Promise(() => {}); });
        mount('hola');
        await wait(310);
        act(() => root.unmount());
        expect(signal?.aborted).toBe(true);
        root = createRoot(host);
    });
});
