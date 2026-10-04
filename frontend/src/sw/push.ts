import { type WorkerNotificationOptions, buildNotificationOptions, isRecord } from './notification'

/** Same as the web manifest `name` (src/pwa/manifest.ts; a test keeps both in sync). */
export const APP_NAME = 'todos - Chat'
export const FALLBACK_PUSH_BODY = 'Nuevo mensaje'

interface PushPayloadBase {
  v: 1
  messageID: number
  title: string
  body: string
  tag: string
}

/** Decrypted Web Push payload sent by the backend (contract v1). */
export type PushPayload =
  | (PushPayloadBase & { kind: 'direct'; telephon: string })
  | (PushPayloadBase & { kind: 'group'; groupID: number })

export interface PushNotification {
  title: string
  options: WorkerNotificationOptions
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** Runtime guard for the push payload. Anything outside contract v1 yields null. */
export function parsePushPayload(data: unknown): PushPayload | null {
  if (!isRecord(data) || data.v !== 1) return null
  const { messageID, title, body, tag } = data
  if (typeof messageID !== 'number' || !Number.isInteger(messageID)) return null
  if (typeof title !== 'string' || typeof body !== 'string' || typeof tag !== 'string') return null
  const base: PushPayloadBase = { v: 1, messageID, title, body, tag }

  if (data.kind === 'direct') {
    const telephon = data.telephon
    if (typeof telephon !== 'string' || telephon === '') return null
    return { ...base, kind: 'direct', telephon }
  }
  if (data.kind === 'group') {
    const groupID = data.groupID
    if (!isPositiveInteger(groupID)) return null
    return { ...base, kind: 'group', groupID }
  }
  return null
}

/** Notification for a valid payload; `data` is the click target read by `resolveNotificationClick`. */
export function buildPushNotification(payload: PushPayload, now: number): PushNotification {
  const data: Record<string, unknown> =
    payload.kind === 'direct' ? { telephon: payload.telephon } : { groupID: payload.groupID }
  return {
    title: payload.title,
    options: buildNotificationOptions({ title: payload.title, body: payload.body, tag: payload.tag, data }, now),
  }
}

/** Generic notification: every push must show one (userVisibleOnly), even when the payload is unusable. */
export function buildFallbackPushNotification(now: number): PushNotification {
  return {
    title: APP_NAME,
    options: buildNotificationOptions({ title: APP_NAME, body: FALLBACK_PUSH_BODY }, now),
  }
}

export function notificationForPush(raw: unknown, now: number): PushNotification {
  const payload = parsePushPayload(raw)
  return payload ? buildPushNotification(payload, now) : buildFallbackPushNotification(now)
}

/** `PushMessageData.json()` throws on non-JSON bodies; treat that (and a missing body) as null. */
export function readPushJson(data: { json(): unknown } | null | undefined): unknown {
  if (!data) return null
  try {
    return data.json()
  } catch {
    return null
  }
}
