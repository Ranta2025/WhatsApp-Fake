import { describe, it, expect } from 'vitest';
import { normalizeSearchPage, normalizeGlobalSearch } from './normalizeSearch';

const result = (over: Record<string, unknown> = {}) => ({
    messageID: 4, time: '2026-01-01T00:00:00Z', snippet: 'hola mundo', highlights: [[0, 4]], ...over,
});

describe('normalizeSearchPage', () => {
    it('passes a well-formed page through', () => {
        expect(normalizeSearchPage({ results: [result()], hasMore: true })).toEqual({
            results: [{ messageID: 4, time: '2026-01-01T00:00:00Z', snippet: 'hola mundo', highlights: [[0, 4]] }],
            hasMore: true,
        });
    });

    it('degrades to an empty page for null / non-object / missing fields', () => {
        for (const bad of [null, undefined, 'x', 3, [], {}]) {
            expect(normalizeSearchPage(bad)).toEqual({ results: [], hasMore: false });
        }
        expect(normalizeSearchPage({ results: 'nope', hasMore: 'yes' })).toEqual({ results: [], hasMore: false });
    });

    it('drops results without a numeric messageID or string snippet', () => {
        const page = normalizeSearchPage({
            results: [result(), result({ messageID: '4' }), result({ messageID: null }), result({ snippet: 5 }), null, 'x', result({ messageID: 9 })],
            hasMore: false,
        });
        expect(page.results.map(r => r.messageID)).toEqual([4, 9]);
    });

    it('sanitizes highlights: invalid or out-of-bounds ranges are dropped, rune length is used', () => {
        const page = normalizeSearchPage({
            results: [result({
                snippet: '😀ab',
                highlights: [[1, 3], [2, 1], [-1, 2], [0, 99], ['a', 2], [1], null, [1, 3.5]],
            })],
        });
        expect(page.results[0]?.highlights).toEqual([[1, 3]]);
    });

    it('missing highlights/time degrade to [] / empty string', () => {
        const page = normalizeSearchPage({ results: [{ messageID: 1, snippet: 'x' }] });
        expect(page.results[0]).toEqual({ messageID: 1, time: '', snippet: 'x', highlights: [] });
    });
});

describe('normalizeGlobalSearch', () => {
    const chat = (over: Record<string, unknown> = {}) => ({
        kind: 'direct', key: '+2', name: 'Luis', avatarUrl: '/a.png', results: [result()], total: 5, ...over,
    });

    it('passes valid chats through', () => {
        const out = normalizeGlobalSearch({ chats: [chat(), chat({ kind: 'group', key: '7', name: 'Equipo' })] });
        expect(out.chats.map(c => [c.kind, c.key, c.name, c.total])).toEqual([['direct', '+2', 'Luis', 5], ['group', '7', 'Equipo', 5]]);
        expect(out.chats[0]?.results).toHaveLength(1);
    });

    it('drops chats with unknown kind or empty key and tolerates missing name/avatar/total', () => {
        const out = normalizeGlobalSearch({
            chats: [chat({ kind: 'channel' }), chat({ key: '' }), chat({ key: 5 }), { kind: 'group', key: '9', results: [result()] }],
        });
        expect(out.chats).toHaveLength(1);
        expect(out.chats[0]).toMatchObject({ kind: 'group', key: '9', name: '9', avatarUrl: '', total: 1 });
    });

    it('drops chats left without valid results', () => {
        const out = normalizeGlobalSearch({ chats: [chat({ results: [] }), chat({ results: [null] }), chat({ results: undefined })] });
        expect(out.chats).toEqual([]);
    });

    it('degrades to no chats for null / garbage bodies', () => {
        for (const bad of [null, undefined, 'x', [], {}, { chats: 'no' }]) {
            expect(normalizeGlobalSearch(bad)).toEqual({ chats: [] });
        }
    });
});
