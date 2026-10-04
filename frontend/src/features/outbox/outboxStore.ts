import { openDB, type IDBPDatabase } from 'idb';
import { parseOutboxEntry, type OutboxEntry } from './outboxTypes';

/**
 * The only module that touches IndexedDB for the outbox. Rows are keyed by
 * `[owner, clientID]` (owner = logged-in telephon) and every read goes through
 * `parseOutboxEntry`: a corrupted row is deleted instead of returned.
 */

export const OUTBOX_DB_NAME = 'whatsapp-fake-outbox';
export const OUTBOX_OBJECT_STORE = 'entries';
const OWNER_INDEX = 'by-owner';
const DB_VERSION = 1;

export interface OutboxStore {
    /** Valid entries of `owner`, FIFO (oldest `createdAt` first). */
    list(owner: string): Promise<OutboxEntry[]>;
    /** Inserts or replaces the entry with the same clientID. */
    put(owner: string, entry: OutboxEntry): Promise<void>;
    remove(owner: string, clientID: string): Promise<void>;
    /** Removes every entry of `owner` (logout). */
    clear(owner: string): Promise<void>;
    close(): void;
}

type Opener = (name: string) => Promise<IDBPDatabase>;

const defaultOpener: Opener = (name) => openDB(name, DB_VERSION, {
    upgrade(db) {
        if (!db.objectStoreNames.contains(OUTBOX_OBJECT_STORE)) {
            const store = db.createObjectStore(OUTBOX_OBJECT_STORE, { keyPath: ['owner', 'clientID'] });
            store.createIndex(OWNER_INDEX, 'owner');
        }
    },
});

export function createOutboxStore(name: string = OUTBOX_DB_NAME, opener: Opener = defaultOpener): OutboxStore {
    let dbPromise: Promise<IDBPDatabase> | null = null;
    // Lazy open; `Promise.resolve().then` turns a synchronous throw (no IndexedDB) into a rejection.
    const db = (): Promise<IDBPDatabase> => {
        if (!dbPromise) {
            dbPromise = Promise.resolve().then(() => opener(name));
            dbPromise.catch(() => { dbPromise = null; });
        }
        return dbPromise;
    };

    return {
        async list(owner) {
            const tx = (await db()).transaction(OUTBOX_OBJECT_STORE, 'readwrite');
            const entries: OutboxEntry[] = [];
            let cursor = await tx.store.index(OWNER_INDEX).openCursor(owner);
            while (cursor) {
                const entry = parseOutboxEntry(cursor.value);
                if (entry) entries.push(entry);
                else await cursor.delete();
                cursor = await cursor.continue();
            }
            await tx.done;
            return entries.sort((a, b) => a.createdAt - b.createdAt);
        },
        async put(owner, entry) {
            await (await db()).put(OUTBOX_OBJECT_STORE, { ...entry, owner });
        },
        async remove(owner, clientID) {
            await (await db()).delete(OUTBOX_OBJECT_STORE, [owner, clientID]);
        },
        async clear(owner) {
            const tx = (await db()).transaction(OUTBOX_OBJECT_STORE, 'readwrite');
            let cursor = await tx.store.index(OWNER_INDEX).openCursor(owner);
            while (cursor) {
                await cursor.delete();
                cursor = await cursor.continue();
            }
            await tx.done;
        },
        close() {
            const pending = dbPromise;
            dbPromise = null;
            void pending?.then(d => d.close(), () => {});
        },
    };
}

let sharedStore: OutboxStore | null = null;

/** Store used by the app (one IndexedDB connection per tab). */
export function getDefaultOutboxStore(): OutboxStore {
    if (!sharedStore) sharedStore = createOutboxStore();
    return sharedStore;
}
