export type NotificationClickDecision =
  | { kind: 'none' }
  | { kind: 'focus'; clientIndex: number; telephon: string | undefined }
  | { kind: 'open'; url: string }

/** Decides what a notification click does: nothing, focus an existing client, or open a window. */
export function resolveNotificationClick(
  action: string,
  data: unknown,
  clients: readonly { url: string }[],
  origin: string,
): NotificationClickDecision {
  if (action === 'close') return { kind: 'none' }

  const clientIndex = clients.findIndex((client) => client.url.includes(origin))
  if (clientIndex === -1) return { kind: 'open', url: '/' }

  const telephon =
    typeof data === 'object' && data !== null && 'telephon' in data && typeof data.telephon === 'string' && data.telephon
      ? data.telephon
      : undefined
  return { kind: 'focus', clientIndex, telephon }
}
