import { describe, expect, it } from 'vitest'
import { CACHE_NAME, STATIC_ASSETS, DEFAULT_ICON, outdatedCacheKeys, decideFetch } from './cache'

describe('cache config (characterization of the legacy public/sw.js)', () => {
  it('keeps the legacy cache name and precached paths', () => {
    expect(CACHE_NAME).toBe('todos-chat-v3')
    expect(STATIC_ASSETS).toEqual([
      '/',
      '/todos.svg',
      '/icons/icon-192x192.svg',
      '/icons/icon-512x512.svg',
      '/manifest.json',
    ])
    expect(DEFAULT_ICON).toBe('/todos.svg')
  })

  it('deletes every cache key except the current one', () => {
    expect(outdatedCacheKeys(['todos-chat-v1', 'todos-chat-v3', 'other'])).toEqual(['todos-chat-v1', 'other'])
    expect(outdatedCacheKeys(['todos-chat-v3'])).toEqual([])
  })
})

describe('decideFetch', () => {
  it('ignores API and websocket paths, even for navigations', () => {
    expect(decideFetch('/api/users', 'cors')).toBe('ignore')
    expect(decideFetch('/ws', 'websocket')).toBe('ignore')
    expect(decideFetch('/ws/chat', 'navigate')).toBe('ignore')
    expect(decideFetch('/api/x', 'navigate')).toBe('ignore')
  })

  it('uses network-first with cached "/" fallback for navigations', () => {
    expect(decideFetch('/', 'navigate')).toBe('navigate')
    expect(decideFetch('/chat/123', 'navigate')).toBe('navigate')
  })

  it('uses cache-first for static assets and /icons/ paths', () => {
    expect(decideFetch('/todos.svg', 'no-cors')).toBe('cache-first')
    expect(decideFetch('/manifest.json', 'cors')).toBe('cache-first')
    expect(decideFetch('/icons/anything.png', 'no-cors')).toBe('cache-first')
  })

  it('does not intercept other requests', () => {
    expect(decideFetch('/assets/index-abc.js', 'cors')).toBe('ignore')
    expect(decideFetch('/storage/bucket/file.png', 'cors')).toBe('ignore')
  })
})
