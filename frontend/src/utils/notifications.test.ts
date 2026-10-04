// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface RegisterOptions {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
}

const registerSW = vi.fn<(options?: RegisterOptions) => (reloadPage?: boolean) => Promise<void>>();
const updateSW = vi.fn<(reloadPage?: boolean) => Promise<void>>();

vi.mock('virtual:pwa-register', () => ({ registerSW }));

type Listener = (event: MessageEvent) => void;
let listeners: Listener[];

function stubServiceWorker(): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      addEventListener: (_: string, l: Listener) => listeners.push(l),
    },
  });
}

async function load() {
  vi.resetModules();
  const notifications = await import('./notifications');
  const store = await import('../pwa/updateStore');
  return { notifications, store };
}

beforeEach(() => {
  listeners = [];
  registerSW.mockReset();
  updateSW.mockReset().mockResolvedValue(undefined);
  registerSW.mockReturnValue(updateSW);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(window, 'Notification');
});

describe('registerServiceWorker', () => {
  it('is a no-op when service workers are unsupported', async () => {
    const { notifications } = await load();
    notifications.registerServiceWorker();
    expect(registerSW).not.toHaveBeenCalled();
  });

  it('registers through registerSW with immediate: true', async () => {
    stubServiceWorker();
    const { notifications } = await load();
    notifications.registerServiceWorker();
    expect(registerSW).toHaveBeenCalledTimes(1);
    expect(registerSW.mock.calls[0]![0]).toMatchObject({ immediate: true });
  });

  it('keeps posting SHOW_NOTIFICATION through the registration from onRegisteredSW', async () => {
    stubServiceWorker();
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'granted' },
    });
    // Icon generation needs canvas; a cached-free path is avoided by stubbing it.
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), closePath: vi.fn(), fill: vi.fn(),
      fillText: vi.fn(), createLinearGradient: () => ({ addColorStop: vi.fn() }),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,x');

    const { notifications } = await load();
    notifications.registerServiceWorker();
    const postMessage = vi.fn();
    registerSW.mock.calls[0]![0]!.onRegisteredSW!('/sw.js', {
      active: { postMessage },
    } as unknown as ServiceWorkerRegistration);

    const shown = await notifications.showNativeNotification({ title: 'Ana', body: 'hola', tag: 't' });
    expect(shown).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SHOW_NOTIFICATION',
        payload: expect.objectContaining({ title: 'Ana', body: 'hola', tag: 't' }),
      }),
    );
    getContext.mockRestore();
  });

  it('delivers NOTIFICATION_CLICK messages to onNotificationClick handlers', async () => {
    stubServiceWorker();
    const { notifications } = await load();
    const handler = vi.fn();
    notifications.onNotificationClick(handler);
    notifications.registerServiceWorker();
    expect(listeners).toHaveLength(1);
    listeners[0]!({ data: { type: 'NOTIFICATION_CLICK', telephon: '+5355' } } as MessageEvent);
    listeners[0]!({ data: { type: 'OTHER', telephon: '+1' } } as MessageEvent);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ telephon: '+5355' });
  });

  it('onNeedRefresh flips the update store and applyUpdate calls updateSW(true)', async () => {
    stubServiceWorker();
    const { notifications, store } = await load();
    notifications.registerServiceWorker();
    expect(store.getSnapshot().needRefresh).toBe(false);
    registerSW.mock.calls[0]![0]!.onNeedRefresh!();
    expect(store.getSnapshot().needRefresh).toBe(true);
    await store.applyUpdate();
    expect(updateSW).toHaveBeenCalledWith(true);
  });
});
