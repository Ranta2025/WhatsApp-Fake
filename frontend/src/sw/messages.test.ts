import { describe, expect, it } from 'vitest'
import { isSkipWaiting } from './messages'

describe('isSkipWaiting', () => {
  it('accepts the SKIP_WAITING message', () => {
    expect(isSkipWaiting({ type: 'SKIP_WAITING' })).toBe(true)
  })

  it('rejects anything else', () => {
    for (const value of [null, undefined, 'SKIP_WAITING', [], { type: 'skip_waiting' }, { type: 'SHOW_NOTIFICATION' }, {}]) {
      expect(isSkipWaiting(value)).toBe(false)
    }
  })
})
