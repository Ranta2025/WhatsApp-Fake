import { describe, expect, it } from 'vitest'
import { resolveNotificationClick } from './click'

const origin = 'https://chat.example.com'

describe('resolveNotificationClick', () => {
  it('does nothing for the "close" action', () => {
    expect(resolveNotificationClick('close', {}, [{ url: `${origin}/` }], origin)).toEqual({ kind: 'none' })
  })

  it('focuses the first client of this origin and forwards telephon', () => {
    const clients = [{ url: 'https://other.com/' }, { url: `${origin}/chat` }, { url: `${origin}/x` }]
    expect(resolveNotificationClick('open', { telephon: '+34' }, clients, origin)).toEqual({
      kind: 'focus', clientIndex: 1, telephon: '+34',
    })
  })

  it('focuses without telephon when data has none', () => {
    expect(resolveNotificationClick('', {}, [{ url: `${origin}/` }], origin)).toEqual({
      kind: 'focus', clientIndex: 0, telephon: undefined,
    })
  })

  it('opens "/" when no client of this origin exists', () => {
    expect(resolveNotificationClick('open', { telephon: '1' }, [{ url: 'https://other.com/' }], origin)).toEqual({
      kind: 'open', url: '/',
    })
    expect(resolveNotificationClick('open', undefined, [], origin)).toEqual({ kind: 'open', url: '/' })
  })

  it('tolerates non-object notification data', () => {
    expect(resolveNotificationClick('open', null, [{ url: `${origin}/` }], origin)).toEqual({
      kind: 'focus', clientIndex: 0, telephon: undefined,
    })
  })
})
