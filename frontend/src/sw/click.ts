import { isRecord } from './notification'

/** What a notification click points at (read from `notification.data`). */
export type ClickTarget = { kind: 'direct'; telephon: string } | { kind: 'group'; groupID: number }

/** Worker -> page message posted to a focused client. */
export type NotificationClickMessage =
  | { type: 'NOTIFICATION_CLICK'; telephon: string }
  | { type: 'NOTIFICATION_CLICK'; groupID: number }

export type NotificationClickDecision =
  | { kind: 'none' }
  | { kind: 'focus'; clientIndex: number; target: ClickTarget | undefined }
  | { kind: 'navigate'; clientIndex: number; url: string }
  | { kind: 'open'; url: string }

/** The SPA route that renders the dashboard (`/` is the public welcome page). */
export const DASHBOARD_PATH = '/dashboard'

/** Reads `{ telephon }` (1:1) or `{ groupID }` (group) from notification data. */
export function parseClickTarget(data: unknown): ClickTarget | undefined {
  if (!isRecord(data)) return undefined
  const { telephon, groupID } = data
  if (typeof telephon === 'string' && telephon !== '') return { kind: 'direct', telephon }
  if (typeof groupID === 'number' && Number.isInteger(groupID) && groupID > 0) return { kind: 'group', groupID }
  return undefined
}

/** Cold-start URL: the dashboard reads `?chat=` / `?group=` once on boot. */
export function openUrlFor(target: ClickTarget | undefined): string {
  if (!target) return DASHBOARD_PATH
  if (target.kind === 'direct') return `${DASHBOARD_PATH}?chat=${encodeURIComponent(target.telephon)}`
  return `${DASHBOARD_PATH}?group=${target.groupID}`
}

export function clickMessageFor(target: ClickTarget): NotificationClickMessage {
  return target.kind === 'direct'
    ? { type: 'NOTIFICATION_CLICK', telephon: target.telephon }
    : { type: 'NOTIFICATION_CLICK', groupID: target.groupID }
}

const parseUrl = (url: string): URL | undefined => {
  try {
    return new URL(url)
  } catch {
    return undefined
  }
}

const isDashboardPath = (pathname: string): boolean =>
  pathname === DASHBOARD_PATH || pathname.startsWith(`${DASHBOARD_PATH}/`)

/**
 * Decides what a notification click does: nothing, focus a dashboard client
 * (it handles the target via postMessage), navigate another tab of this origin
 * to the cold-start URL (it has no dashboard listening), or open a window.
 */
export function resolveNotificationClick(
  action: string,
  data: unknown,
  clients: readonly { url: string }[],
  origin: string,
): NotificationClickDecision {
  if (action === 'close') return { kind: 'none' }

  const target = parseClickTarget(data)
  const urls = clients.map((client) => parseUrl(client.url))
  const dashboardIndex = urls.findIndex((url) => url?.origin === origin && isDashboardPath(url.pathname))
  if (dashboardIndex !== -1) return { kind: 'focus', clientIndex: dashboardIndex, target }

  const sameOriginIndex = urls.findIndex((url) => url?.origin === origin)
  if (sameOriginIndex !== -1) return { kind: 'navigate', clientIndex: sameOriginIndex, url: openUrlFor(target) }
  return { kind: 'open', url: openUrlFor(target) }
}
