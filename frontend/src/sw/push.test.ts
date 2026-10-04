import { describe, expect, it } from 'vitest'
import { manifest } from '../pwa/manifest'
import { DEFAULT_ICON } from './cache'
import {
  APP_NAME,
  FALLBACK_PUSH_BODY,
  buildFallbackPushNotification,
  buildPushNotification,
  notificationForPush,
  parsePushPayload,
  readPushJson,
} from './push'

const direct = { v: 1, kind: 'direct', telephon: '+34600', messageID: 7, title: 'Ana', body: 'hola', tag: 'chat-+34600' }
const group = { v: 1, kind: 'group', groupID: 12, messageID: 8, title: 'Equipo', body: 'Ana: hola', tag: 'group-12' }

describe('parsePushPayload', () => {
  it('accepts a direct payload', () => {
    expect(parsePushPayload(direct)).toEqual(direct)
  })

  it('accepts a group payload', () => {
    expect(parsePushPayload(group)).toEqual(group)
  })

  it('drops fields that do not belong to the kind', () => {
    expect(parsePushPayload({ ...direct, groupID: 3 })).toEqual(direct)
    expect(parsePushPayload({ ...group, telephon: '+1' })).toEqual(group)
  })

  it('rejects non-objects and unknown versions/kinds', () => {
    for (const bad of [undefined, null, 'x', 5, [], { ...direct, v: 2 }, { ...direct, v: '1' }, { ...direct, kind: 'other' }]) {
      expect(parsePushPayload(bad)).toBeNull()
    }
  })

  it('rejects a direct payload without a non-empty telephon', () => {
    expect(parsePushPayload({ ...direct, telephon: '' })).toBeNull()
    expect(parsePushPayload({ ...direct, telephon: 5 })).toBeNull()
    expect(parsePushPayload({ ...direct, telephon: undefined })).toBeNull()
  })

  it('rejects a group payload without a positive integer groupID', () => {
    for (const groupID of [0, -1, 1.5, '12', Number.NaN, undefined]) {
      expect(parsePushPayload({ ...group, groupID })).toBeNull()
    }
  })

  it('rejects wrong title/body/tag/messageID types', () => {
    expect(parsePushPayload({ ...direct, title: 1 })).toBeNull()
    expect(parsePushPayload({ ...direct, body: null })).toBeNull()
    expect(parsePushPayload({ ...direct, tag: undefined })).toBeNull()
    expect(parsePushPayload({ ...direct, messageID: '7' })).toBeNull()
    expect(parsePushPayload({ ...direct, messageID: 1.5 })).toBeNull()
  })
})

describe('buildPushNotification', () => {
  it('builds a direct notification carrying telephon', () => {
    const parsed = parsePushPayload(direct)
    if (!parsed) throw new Error('expected payload')
    const { title, options } = buildPushNotification(parsed, 1000)
    expect(title).toBe('Ana')
    expect(options).toMatchObject({
      body: 'hola',
      tag: 'chat-+34600',
      renotify: true,
      icon: DEFAULT_ICON,
      badge: DEFAULT_ICON,
      timestamp: 1000,
      data: { telephon: '+34600' },
    })
  })

  it('builds a group notification carrying groupID', () => {
    const parsed = parsePushPayload(group)
    if (!parsed) throw new Error('expected payload')
    const { title, options } = buildPushNotification(parsed, 5)
    expect(title).toBe('Equipo')
    expect(options).toMatchObject({ body: 'Ana: hola', tag: 'group-12', renotify: true, data: { groupID: 12 } })
  })
})

describe('fallback notification', () => {
  it('uses the app name and a generic body with no click target', () => {
    const { title, options } = buildFallbackPushNotification(3)
    expect(title).toBe(APP_NAME)
    expect(options.body).toBe(FALLBACK_PUSH_BODY)
    expect(FALLBACK_PUSH_BODY).toBe('Nuevo mensaje')
    expect(options.data).toEqual({})
    expect(options.timestamp).toBe(3)
  })

  it('keeps APP_NAME in sync with the web manifest', () => {
    expect(APP_NAME).toBe(manifest.name)
  })
})

describe('notificationForPush', () => {
  it('builds from a valid payload', () => {
    expect(notificationForPush(group, 1).options.data).toEqual({ groupID: 12 })
  })

  it('falls back for anything unparseable', () => {
    expect(notificationForPush(null, 1).title).toBe(APP_NAME)
    expect(notificationForPush({ v: 9 }, 1).options.body).toBe(FALLBACK_PUSH_BODY)
  })
})

describe('readPushJson', () => {
  it('returns the parsed JSON', () => {
    expect(readPushJson({ json: () => direct })).toEqual(direct)
  })

  it('returns null with no data or when json() throws', () => {
    expect(readPushJson(null)).toBeNull()
    expect(readPushJson(undefined)).toBeNull()
    expect(
      readPushJson({
        json: () => {
          throw new SyntaxError('bad json')
        },
      }),
    ).toBeNull()
  })
})
