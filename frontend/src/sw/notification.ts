import { DEFAULT_ICON } from './cache'

export interface ShowNotificationPayload {
  title: string
  body?: string
  icon?: string
  image?: string
  tag?: string
  data?: Record<string, unknown>
}

export interface NotificationAction {
  action: string
  title: string
}

/** Options handed to showNotification (includes fields missing from lib.dom's NotificationOptions). */
export interface WorkerNotificationOptions {
  body: string | undefined
  icon: string
  badge: string
  tag: string
  renotify: boolean
  vibrate: number[]
  requireInteraction: boolean
  timestamp: number
  data: Record<string, unknown>
  actions: NotificationAction[]
  image?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** Runtime guard for page -> worker SHOW_NOTIFICATION messages. Returns null when malformed. */
export function parseShowNotification(message: unknown): ShowNotificationPayload | null {
  if (!isRecord(message) || message.type !== 'SHOW_NOTIFICATION') return null
  const payload = message.payload
  if (!isRecord(payload) || typeof payload.title !== 'string') return null

  const parsed: ShowNotificationPayload = { title: payload.title }
  const body = optionalString(payload.body)
  const icon = optionalString(payload.icon)
  const image = optionalString(payload.image)
  const tag = optionalString(payload.tag)
  if (body !== undefined) parsed.body = body
  if (icon !== undefined) parsed.icon = icon
  if (image !== undefined) parsed.image = image
  if (tag !== undefined) parsed.tag = tag
  if (isRecord(payload.data)) parsed.data = payload.data
  return parsed
}

export function buildNotificationOptions(payload: ShowNotificationPayload, now: number): WorkerNotificationOptions {
  const options: WorkerNotificationOptions = {
    body: payload.body,
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.icon || DEFAULT_ICON,
    tag: payload.tag || 'chat-message',
    renotify: true,
    vibrate: [100, 50, 100],
    requireInteraction: false,
    timestamp: now,
    data: payload.data ?? {},
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'close', title: 'Cerrar' },
    ],
  }
  if (payload.image) options.image = payload.image
  return options
}
