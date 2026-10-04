import { describe, expect, it } from 'vitest'
import { DEFAULT_ICON, LEGACY_CACHE_NAME, shouldClaimClients } from './cache'

describe('legacy cache', () => {
  it('targets the old hand-written worker cache and keeps the default icon', () => {
    expect(LEGACY_CACHE_NAME).toBe('todos-chat-v3')
    expect(DEFAULT_ICON).toBe('/todos.svg')
  })
})

describe('shouldClaimClients', () => {
  it('claims only on first install (no previously active worker)', () => {
    expect(shouldClaimClients(null)).toBe(true)
    expect(shouldClaimClients({})).toBe(false)
  })
})
