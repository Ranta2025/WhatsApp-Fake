// Constants shared by the service worker. All static assets are served from the Workbox precache.

/** Cache of the legacy hand-written worker; deleted on activate. */
export const LEGACY_CACHE_NAME = 'todos-chat-v3'

export const DEFAULT_ICON = '/todos.svg'

/** Claim open tabs only on first install; an update must wait for the user's accept (SKIP_WAITING). */
export function shouldClaimClients(previouslyActiveWorker: unknown): boolean {
  return previouslyActiveWorker === null || previouslyActiveWorker === undefined
}
