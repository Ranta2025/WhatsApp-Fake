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

/** Decides what a notification click does: nothing, focus an existing client, or open a window. */
export function resolveNotificationClick(
  action: string,
  data: unknown,
  clients: readonly { url: string }[],
  origin: string,
): NotificationClickDecision {
  if (action === 'close') return { kind: 'none' }

  const target = parseClickTarget(data)
  const clientIndex = clients.findIndex((client) => client.url.includes(origin))
  if (clientIndex === -1) return { kind: 'open', url: openUrlFor(target) }
  return { kind: 'focus', clientIndex, target }
}
