import { describe, expect, it } from 'vitest'
import { clickMessageFor, openUrlFor, parseClickTarget, resolveNotificationClick } from './click'

const origin = 'https://chat.example.com'

describe('parseClickTarget', () => {
  it('reads a direct target', () => {
    expect(parseClickTarget({ telephon: '+34' })).toEqual({ kind: 'direct', telephon: '+34' })
  })

  it('reads a group target', () => {
    expect(parseClickTarget({ groupID: 12 })).toEqual({ kind: 'group', groupID: 12 })
  })

  it('returns undefined for anything else', () => {
    for (const bad of [undefined, null, 'x', {}, { telephon: '' }, { telephon: 1 }, { groupID: 0 }, { groupID: '3' }, { groupID: 1.5 }]) {
      expect(parseClickTarget(bad)).toBeUndefined()
    }
  })
})

describe('openUrlFor', () => {
  it('builds the dashboard cold-start URL for each target', () => {
    expect(openUrlFor({ kind: 'direct', telephon: '+34 600' })).toBe('/dashboard?chat=%2B34%20600')
    expect(openUrlFor({ kind: 'group', groupID: 9 })).toBe('/dashboard?group=9')
    expect(openUrlFor(undefined)).toBe('/dashboard')
  })
})

describe('clickMessageFor', () => {
  it('builds the NOTIFICATION_CLICK message for each target', () => {
    expect(clickMessageFor({ kind: 'direct', telephon: '1' })).toEqual({ type: 'NOTIFICATION_CLICK', telephon: '1' })
    expect(clickMessageFor({ kind: 'group', groupID: 4 })).toEqual({ type: 'NOTIFICATION_CLICK', groupID: 4 })
  })
})

describe('resolveNotificationClick', () => {
  it('does nothing for the "close" action', () => {
    expect(resolveNotificationClick('close', {}, [{ url: `${origin}/` }], origin)).toEqual({ kind: 'none' })
  })

  it('focuses the first client of this origin and forwards a direct target', () => {
    const clients = [{ url: 'https://other.com/' }, { url: `${origin}/chat` }, { url: `${origin}/x` }]
    expect(resolveNotificationClick('open', { telephon: '+34' }, clients, origin)).toEqual({
      kind: 'focus', clientIndex: 1, target: { kind: 'direct', telephon: '+34' },
    })
  })

  it('focuses and forwards a group target', () => {
    expect(resolveNotificationClick('', { groupID: 5 }, [{ url: `${origin}/dashboard` }], origin)).toEqual({
      kind: 'focus', clientIndex: 0, target: { kind: 'group', groupID: 5 },
    })
  })

  it('focuses without target when data has none', () => {
    expect(resolveNotificationClick('', {}, [{ url: `${origin}/` }], origin)).toEqual({
      kind: 'focus', clientIndex: 0, target: undefined,
    })
  })

  it('opens the dashboard with the target in the query when no client of this origin exists', () => {
    expect(resolveNotificationClick('open', { telephon: '+1' }, [{ url: 'https://other.com/' }], origin)).toEqual({
      kind: 'open', url: '/dashboard?chat=%2B1',
    })
    expect(resolveNotificationClick('', { groupID: 7 }, [], origin)).toEqual({ kind: 'open', url: '/dashboard?group=7' })
    expect(resolveNotificationClick('open', undefined, [], origin)).toEqual({ kind: 'open', url: '/dashboard' })
  })

  it('tolerates non-object notification data', () => {
    expect(resolveNotificationClick('open', null, [{ url: `${origin}/` }], origin)).toEqual({
      kind: 'focus', clientIndex: 0, target: undefined,
    })
  })
})
