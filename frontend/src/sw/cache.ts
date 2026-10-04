// Caching decisions of the service worker (ported 1:1 from the legacy public/sw.js).

export const CACHE_NAME = 'todos-chat-v3'

export const STATIC_ASSETS: readonly string[] = [
  '/',
  '/todos.svg',
  '/icons/icon-192x192.svg',
  '/icons/icon-512x512.svg',
  '/manifest.json',
]

export const DEFAULT_ICON = '/todos.svg'

export type FetchDecision = 'ignore' | 'navigate' | 'cache-first'

/** Cache keys that must be deleted on activate (everything but the current cache). */
export function outdatedCacheKeys(keys: readonly string[]): string[] {
  return keys.filter((key) => key !== CACHE_NAME)
}

/** Decides how a request is handled; API and websocket paths are never intercepted. */
export function decideFetch(pathname: string, mode: string): FetchDecision {
  if (pathname.startsWith('/api/') || pathname.startsWith('/ws')) return 'ignore'
  if (mode === 'navigate') return 'navigate'
  if (STATIC_ASSETS.includes(pathname) || pathname.startsWith('/icons/')) return 'cache-first'
  return 'ignore'
}
