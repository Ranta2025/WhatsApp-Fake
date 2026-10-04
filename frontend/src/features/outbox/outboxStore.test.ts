import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { openDB } from 'idb';
import { createOutboxStore, OUTBOX_OBJECT_STORE } from './outboxStore';
import type { OutboxEntry } from './outboxTypes';

// PW9: the IndexedDB outbox keeps queued text sends per logged-in user, in FIFO
// order, survives a "reload" (a new store instance on the same database) and
// never trusts what it reads back (corrupted rows are dropped, not returned).

let dbSeq = 0;
const freshName = () => `outbox-store-test-${++dbSeq}`;

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const ID3 = '33333333-3333-4333-8333-333333333333';

const direct = (clientID: string, createdAt: number, over: Partial<OutboxEntry> = {}): OutboxEntry => ({
    clientID, kind: 'direct', target: '222', text: `t-${clientID.slice(0, 1)}`, replyTo: null, createdAt, attempts: 0,
    ...over,
} as OutboxEntry);

describe('outboxStore', () => {
    it('lists the entries of one owner in FIFO (createdAt) order', async () => {
        const store = createOutboxStore(freshName());
        await store.put('111', direct(ID2, 20));
        await store.put('111', direct(ID1, 10));
        await store.put('999', direct(ID3, 5));

        const listed = await store.list('111');
        expect(listed.map(e => e.clientID)).toEqual([ID1, ID2]);
        expect(await store.list('999')).toHaveLength(1);
        store.close();
    });

    it('stores group entries with a numeric target and a reply reference', async () => {
        const store = createOutboxStore(freshName());
        const entry: OutboxEntry = {
            clientID: ID1, kind: 'group', target: 9, text: 'hola grupo', createdAt: 1, attempts: 2,
            replyTo: { MessageID: 4, SenderTelephon: '333', Message: 'antes' },
        };
        await store.put('111', entry);
        expect(await store.list('111')).toEqual([entry]);
        store.close();
    });

    it('put replaces an entry (attempts update) and remove deletes only that entry', async () => {
        const store = createOutboxStore(freshName());
        await store.put('111', direct(ID1, 1));
        await store.put('111', direct(ID2, 2));
        await store.put('111', direct(ID1, 1, { attempts: 3 }));
        await store.remove('111', ID2);

        expect(await store.list('111')).toEqual([direct(ID1, 1, { attempts: 3 })]);
        store.close();
    });

    it('clear removes every entry of that owner only', async () => {
        const store = createOutboxStore(freshName());
        await store.put('111', direct(ID1, 1));
        await store.put('111', direct(ID2, 2));
        await store.put('999', direct(ID3, 3));
        await store.clear('111');

        expect(await store.list('111')).toEqual([]);
        expect((await store.list('999')).map(e => e.clientID)).toEqual([ID3]);
        store.close();
    });

    it('survives a reload: a new store instance on the same database sees the entries', async () => {
        const name = freshName();
        const first = createOutboxStore(name);
        await first.put('111', direct(ID1, 1));
        first.close();

        const second = createOutboxStore(name);
        expect((await second.list('111')).map(e => e.clientID)).toEqual([ID1]);
        second.close();
    });

    it('drops corrupted rows on read (runtime guard) and keeps the valid ones', async () => {
        const name = freshName();
        const store = createOutboxStore(name);
        await store.put('111', direct(ID1, 1));
        store.close();

        const raw = await openDB(name);
        await raw.put(OUTBOX_OBJECT_STORE, { owner: '111', clientID: 'not-a-uuid', kind: 'direct', target: '2', text: 'x', replyTo: null, createdAt: 2, attempts: 0 });
        await raw.put(OUTBOX_OBJECT_STORE, { owner: '111', clientID: ID2, kind: 'group', target: 'nine', text: 'x', replyTo: null, createdAt: 3, attempts: 0 });
        await raw.put(OUTBOX_OBJECT_STORE, { owner: '111', clientID: ID3, kind: 'direct', target: '2', text: '', replyTo: null, createdAt: 4, attempts: 0 });
        raw.close();

        const reopened = createOutboxStore(name);
        expect((await reopened.list('111')).map(e => e.clientID)).toEqual([ID1]);
        reopened.close();
    });

    it('rejects (instead of throwing synchronously) when IndexedDB is unavailable', async () => {
        const store = createOutboxStore(freshName(), () => { throw new Error('no idb'); });
        await expect(store.list('111')).rejects.toThrow('no idb');
    });
});
