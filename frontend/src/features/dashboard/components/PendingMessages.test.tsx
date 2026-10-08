// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import PendingMessages from './PendingMessages';
import { outboxItemsFor, type OutboxItem } from '../../outbox/outboxTypes';

// PW9: own text messages still in the outbox render after the loaded list, with the
// pending clock or a minimal "No enviado" mark, filtered to the open chat/group and
// never duplicating a message the server already returned (same clientID).

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const items: OutboxItem[] = [
    { state: 'pending', entry: { clientID: A, kind: 'direct', target: '222', text: 'hola', replyTo: null, createdAt: 1, attempts: 0 } },
    { state: 'failed', entry: { clientID: B, kind: 'direct', target: '222', text: 'falló', replyTo: { messageID: 4, senderTelephon: '222', message: 'antes' }, createdAt: 2, attempts: 1 } },
    { state: 'pending', entry: { clientID: C, kind: 'group', target: 9, text: 'grupo', replyTo: null, createdAt: 3, attempts: 0 } },
];

describe('outboxItemsFor', () => {
    it('keeps only the items of the open chat or group', () => {
        expect(outboxItemsFor(items, { kind: 'direct', target: '222' }, []).map(i => i.entry.clientID)).toEqual([A, B]);
        expect(outboxItemsFor(items, { kind: 'group', target: 9 }, []).map(i => i.entry.clientID)).toEqual([C]);
        expect(outboxItemsFor(items, { kind: 'direct', target: '333' }, [])).toEqual([]);
    });

    it('hides an item whose clientID is already in the loaded messages', () => {
        expect(outboxItemsFor(items, { kind: 'direct', target: '222' }, [{ clientID: A }]).map(i => i.entry.clientID)).toEqual([B]);
    });
});

describe('PendingMessages', () => {
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

    it('renders each item with its text, a clock when pending and "No enviado" when failed', () => {
        act(() => { root.render(<PendingMessages items={items.slice(0, 2)} />); });

        const rows = container.querySelectorAll('[data-outbox-client-id]');
        expect(Array.from(rows, r => r.getAttribute('data-outbox-state'))).toEqual(['pending', 'failed']);
        expect(rows[0]?.textContent).toContain('hola');
        expect(rows[0]?.querySelector('[data-testid="message-pending"]')).not.toBeNull();
        expect(rows[1]?.querySelector('[data-testid="message-failed"]')?.textContent).toContain('No enviado');
        expect(rows[1]?.textContent).toContain('antes');
    });

    it('renders nothing without items', () => {
        act(() => { root.render(<PendingMessages items={[]} />); });
        expect(container.innerHTML).toBe('');
    });
});
