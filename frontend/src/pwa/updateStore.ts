// Tiny external store with the service worker update state, consumed through
// useSyncExternalStore. The registration code feeds it; the UI reads it.

type Listener = () => void;
type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

export interface UpdateState {
  readonly needRefresh: boolean;
}

let state: UpdateState = { needRefresh: false };
let updater: UpdateServiceWorker | null = null;
const listeners = new Set<Listener>();

function setState(next: UpdateState): void {
  if (next.needRefresh === state.needRefresh) return;
  state = next;
  listeners.forEach((l) => l());
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): UpdateState {
  return state;
}

export function setUpdater(fn: UpdateServiceWorker): void {
  updater = fn;
}

export function markNeedRefresh(): void {
  setState({ needRefresh: true });
}

/** Hides the prompt until the next page load; the waiting worker stays waiting. */
export function dismissUpdate(): void {
  setState({ needRefresh: false });
}

/** Activates the waiting worker and reloads the page (`updateSW(true)`). */
export async function applyUpdate(): Promise<void> {
  await updater?.(true);
}

/** Test helper: restores the initial state. */
export function resetUpdateStore(): void {
  state = { needRefresh: false };
  updater = null;
  listeners.clear();
}
