import { describe, expect, it } from 'vitest'
import { buildNotificationOptions, parseShowNotification } from './notification'

describe('parseShowNotification', () => {
  it('accepts a SHOW_NOTIFICATION message with a payload', () => {
    const parsed = parseShowNotification({
      type: 'SHOW_NOTIFICATION',
      payload: { title: 'Ana', body: 'hola', icon: 'i.png', image: 'img.png', tag: 't', data: { telephon: '+1' } },
    })
    expect(parsed).toEqual({
      title: 'Ana', body: 'hola', icon: 'i.png', image: 'img.png', tag: 't', data: { telephon: '+1' },
    })
  })

  it('rejects other message types and malformed data', () => {
    expect(parseShowNotification(undefined)).toBeNull()
    expect(parseShowNotification(null)).toBeNull()
    expect(parseShowNotification('x')).toBeNull()
    expect(parseShowNotification({ type: 'OTHER', payload: { title: 'a' } })).toBeNull()
    expect(parseShowNotification({ type: 'SHOW_NOTIFICATION' })).toBeNull()
    expect(parseShowNotification({ type: 'SHOW_NOTIFICATION', payload: null })).toBeNull()
    expect(parseShowNotification({ type: 'SHOW_NOTIFICATION', payload: { body: 'no title' } })).toBeNull()
    expect(parseShowNotification({ type: 'SHOW_NOTIFICATION', payload: { title: 5 } })).toBeNull()
  })

  it('drops optional fields with the wrong type', () => {
    const parsed = parseShowNotification({
      type: 'SHOW_NOTIFICATION',
      payload: { title: 'a', body: 1, icon: 2, image: 3, tag: 4, data: 'str' },
    })
    expect(parsed).toEqual({ title: 'a' })
  })
})

describe('buildNotificationOptions (legacy defaults)', () => {
  it('applies defaults when optional fields are missing', () => {
    expect(buildNotificationOptions({ title: 'T' }, 1234)).toEqual({
      body: undefined,
      icon: '/todos.svg',
      badge: '/todos.svg',
      tag: 'chat-message',
      renotify: true,
      vibrate: [100, 50, 100],
      requireInteraction: false,
      timestamp: 1234,
      data: {},
      actions: [
        { action: 'open', title: 'Abrir' },
        { action: 'close', title: 'Cerrar' },
      ],
    })
  })

  it('uses the provided icon for icon and badge, plus tag, body, data and image', () => {
    const opts = buildNotificationOptions(
      { title: 'T', body: 'b', icon: 'x.png', image: 'big.png', tag: 'tg', data: { telephon: '1' } },
      5,
    )
    expect(opts.icon).toBe('x.png')
    expect(opts.badge).toBe('x.png')
    expect(opts.tag).toBe('tg')
    expect(opts.body).toBe('b')
    expect(opts.image).toBe('big.png')
    expect(opts.data).toEqual({ telephon: '1' })
  })

  it('omits image when absent', () => {
    expect('image' in buildNotificationOptions({ title: 'T' }, 1)).toBe(false)
  })
})
