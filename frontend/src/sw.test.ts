import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (event: unknown) => void

const precacheAndRoute = vi.fn()
const cleanupOutdatedCaches = vi.fn()
const registerRoute = vi.fn()
const createHandlerBoundToURL = vi.fn(() => 'bound-handler')
const NavigationRoute = vi.fn()

vi.mock('workbox-precaching', () => ({ precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL }))
vi.mock('workbox-routing', () => ({ registerRoute, NavigationRoute }))

interface Harness {
  listeners: Map<string, Listener>
  skipWaiting: ReturnType<typeof vi.fn>
  claim: ReturnType<typeof vi.fn>
  deleteCache: ReturnType<typeof vi.fn>
}

async function load(manifest: unknown[], active: unknown): Promise<Harness> {
  vi.resetModules()
  const listeners = new Map<string, Listener>()
  const skipWaiting = vi.fn(() => Promise.resolve())
  const claim = vi.fn(() => Promise.resolve())
  const deleteCache = vi.fn(() => Promise.resolve(true))
  vi.stubGlobal('self', {
    __WB_MANIFEST: manifest,
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    skipWaiting,
    clients: { claim },
    registration: { active, showNotification: vi.fn() },
    location: { origin: 'https://app.test' },
  })
  vi.stubGlobal('caches', { keys: () => Promise.resolve(['todos-chat-v3', 'workbox-precache-v2-x']), delete: deleteCache })
  await import('./sw')
  return { listeners, skipWaiting, claim, deleteCache }
}

function waitable(): { event: { waitUntil: (p: Promise<unknown>) => void }; done: () => Promise<unknown> } {
  const promises: Promise<unknown>[] = []
  return { event: { waitUntil: (p) => void promises.push(p) }, done: () => Promise.all(promises) }
}

describe('sw wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('precaches the injected manifest and cleans outdated caches', async () => {
    const manifest = [{ url: 'index.html', revision: 'r1' }]
    await load(manifest, null)
    expect(precacheAndRoute).toHaveBeenCalledWith(manifest)
    expect(cleanupOutdatedCaches).toHaveBeenCalled()
  })

  it('registers a navigation route bound to index.html with the denylist', async () => {
    await load([{ url: 'index.html', revision: 'r1' }], null)
    expect(createHandlerBoundToURL).toHaveBeenCalledWith('/index.html')
    const [handler, options] = NavigationRoute.mock.calls[0] as [unknown, { denylist: RegExp[] }]
    expect(handler).toBe('bound-handler')
    expect(options.denylist.some((re) => re.test('/api/v1/ws'))).toBe(true)
    expect(options.denylist.some((re) => re.test('/storage/x.png'))).toBe(true)
    expect(registerRoute).toHaveBeenCalledTimes(1)
  })

  it('falls back to a network-first navigation route when index.html is not precached', async () => {
    await load([{ url: 'assets/a.js', revision: null }], null)
    expect(createHandlerBoundToURL).not.toHaveBeenCalled()
    expect(NavigationRoute).toHaveBeenCalledTimes(1)
    expect(typeof NavigationRoute.mock.calls[0]?.[0]).toBe('function')
  })

  it('does not skip waiting on install', async () => {
    const h = await load([], null)
    const { event, done } = waitable()
    h.listeners.get('install')?.(event)
    await done()
    expect(h.skipWaiting).not.toHaveBeenCalled()
  })

  it('skips waiting only when the page sends SKIP_WAITING', async () => {
    const h = await load([], null)
    const { event } = waitable()
    h.listeners.get('message')?.({ ...event, data: { type: 'SOMETHING' } })
    expect(h.skipWaiting).not.toHaveBeenCalled()
    h.listeners.get('message')?.({ ...event, data: { type: 'SKIP_WAITING' } })
    expect(h.skipWaiting).toHaveBeenCalledTimes(1)
  })

  it('deletes the legacy cache on activate and claims clients on first install', async () => {
    const h = await load([], null)
    h.listeners.get('install')?.(waitable().event)
    const { event, done } = waitable()
    h.listeners.get('activate')?.(event)
    await done()
    expect(h.deleteCache).toHaveBeenCalledWith('todos-chat-v3')
    expect(h.deleteCache).toHaveBeenCalledTimes(1)
    expect(h.claim).toHaveBeenCalledTimes(1)
  })

  it('does not claim clients when updating over an active worker', async () => {
    const h = await load([], {})
    h.listeners.get('install')?.(waitable().event)
    const { event, done } = waitable()
    h.listeners.get('activate')?.(event)
    await done()
    expect(h.claim).not.toHaveBeenCalled()
  })
})
