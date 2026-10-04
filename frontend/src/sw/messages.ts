/** Runtime guard for the page -> worker SKIP_WAITING message (sent by workbox-window / updateSW(true)). */
export function isSkipWaiting(message: unknown): boolean {
  return typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'SKIP_WAITING'
}
