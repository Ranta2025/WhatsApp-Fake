// Routing decisions of the service worker. The backend (REST, websocket, user media) is never cached.

export const NAVIGATION_DENYLIST: readonly RegExp[] = [/^\/api\//, /^\/storage\//, /^\/healthz/, /^\/metrics/]

/** True when a navigation to this path may be answered by the precached app shell. */
export function isNavigationAllowed(pathname: string): boolean {
  return !NAVIGATION_DENYLIST.some((re) => re.test(pathname))
}

/** True for paths that must go straight to the network (no route may match them). */
export function shouldBypass(pathname: string): boolean {
  return !isNavigationAllowed(pathname)
}

/** True when the injected precache manifest contains index.html (required for the offline shell). */
export function hasIndexHtml(manifest: ReadonlyArray<{ url: string; revision?: string | null } | string>): boolean {
  return manifest.some((entry) => {
    const url = typeof entry === 'string' ? entry : entry.url
    return url.replace(/^\//, '') === 'index.html'
  })
}
