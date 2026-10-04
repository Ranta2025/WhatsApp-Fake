// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import MessageSearchResults from './MessageSearchResults';
import type { GlobalSearchChat } from '../../../types/api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const direct: GlobalSearchChat = {
    kind: 'direct', key: '+2', name: 'Luis', avatarUrl: '/l.png', total: 5,
    results: [
        { messageID: 11, time: '2026-01-02T10:00:00Z', snippet: 'Qué CANCIÓN tan buena', highlights: [[4, 11]] },
        { messageID: 7, time: '2026-01-01T10:00:00Z', snippet: 'otra canción', highlights: [[5, 12]] },
    ],
};
const group: GlobalSearchChat = {
    kind: 'group', key: '9', name: 'Equipo demo', avatarUrl: '', total: 1,
    results: [{ messageID: 30, time: '2026-01-03T10:00:00Z', snippet: '…la canción del grupo', highlights: [[4, 11]] }],
};

describe('MessageSearchResults', () => {
    let host: HTMLDivElement;
    let root: Root;
    const onOpen = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    });
    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    const render = (status: 'idle' | 'loading' | 'ready' | 'error', chats: GlobalSearchChat[] = []) => act(() => {
        root.render(<MessageSearchResults status={status} chats={chats} onOpen={onOpen} />);
    });

    it('renders nothing while idle', () => {
        render('idle');
        expect(host.textContent).toBe('');
    });

    it('shows the "Mensajes" heading with a loading note while searching', () => {
        render('loading');
        expect(host.textContent).toContain('Mensajes');
        expect(host.querySelector('[role="status"]')?.textContent).toBe('Buscando mensajes…');
    });

    it('shows "Sin resultados" when the search finished empty', () => {
        render('ready', []);
        expect(host.textContent).toContain('Mensajes');
        expect(host.querySelector('[role="status"]')?.textContent).toBe('Sin resultados');
    });

    it('shows an error note when the search failed', () => {
        render('error');
        expect(host.querySelector('[role="status"]')?.textContent).toBe('No se pudo buscar mensajes');
    });

    it('groups results by chat: chat name, group tag, per-result snippet with highlights, and the number not shown', () => {
        render('ready', [direct, group]);
        const sections = host.querySelectorAll('[data-chat-key]');
        expect(Array.from(sections).map(s => s.getAttribute('data-chat-key'))).toEqual(['direct:+2', 'group:9']);
        expect(sections[0]?.textContent).toContain('Luis');
        expect(sections[1]?.textContent).toContain('Equipo demo');
        expect(sections[1]?.textContent).toContain('Grupo');
        expect(sections[0]?.textContent).not.toContain('Grupo');

        const marks = Array.from(host.querySelectorAll('mark')).map(m => m.textContent);
        expect(marks).toEqual(['CANCIÓN', 'canción', 'canción']);
        expect(host.querySelectorAll('button[data-result-id]')).toHaveLength(3);
    });

    it('notes how many more matches a chat has beyond the ones listed', () => {
        render('ready', [direct, group]);
        const sections = host.querySelectorAll('[data-chat-key]');
        expect(sections[0]?.textContent).toContain('+3 más');
        expect(sections[1]?.textContent).not.toContain('más');
    });

    it('clicking a result opens that chat at that message', () => {
        render('ready', [direct, group]);
        const second = host.querySelector('button[data-result-id="7"]') as HTMLButtonElement;
        act(() => { second.click(); });
        expect(onOpen).toHaveBeenCalledWith(direct, 7);

        const groupHit = host.querySelector('button[data-result-id="30"]') as HTMLButtonElement;
        act(() => { groupHit.click(); });
        expect(onOpen).toHaveBeenLastCalledWith(group, 30);
    });

    it('clicking the chat header opens the chat at its newest match', () => {
        render('ready', [direct]);
        const header = host.querySelector('[data-chat-key="direct:+2"] button[data-chat-header]') as HTMLButtonElement;
        act(() => { header.click(); });
        expect(onOpen).toHaveBeenCalledWith(direct, 11);
    });
});
