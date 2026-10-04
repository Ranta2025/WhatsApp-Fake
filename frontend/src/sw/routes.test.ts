import { describe, expect, it } from 'vitest'
import { NAVIGATION_DENYLIST, hasIndexHtml, isNavigationAllowed, shouldBypass } from './routes'

describe('isNavigationAllowed', () => {
  it('allows app routes to be served by the precached shell', () => {
    for (const path of ['/', '/chat', '/chat/123', '/login', '/index.html', '/apiary']) {
      expect(isNavigationAllowed(path)).toBe(true)
    }
  })

  it('denies api, storage, health and metrics paths', () => {
    for (const path of ['/api/v1/ws', '/api/users', '/storage/img.png', '/healthz', '/metrics']) {
      expect(isNavigationAllowed(path)).toBe(false)
    }
  })
})

describe('shouldBypass', () => {
  it('bypasses the worker for backend paths and user media', () => {
    expect(shouldBypass('/api/v1/ws')).toBe(true)
    expect(shouldBypass('/storage/a/b.jpg')).toBe(true)
  })

  it('does not bypass app paths', () => {
    expect(shouldBypass('/')).toBe(false)
    expect(shouldBypass('/assets/index-abc.js')).toBe(false)
  })
})

describe('NAVIGATION_DENYLIST', () => {
  it('is a list of anchored regexes', () => {
    expect(NAVIGATION_DENYLIST).toHaveLength(4)
    expect(NAVIGATION_DENYLIST.every((re) => re instanceof RegExp)).toBe(true)
  })
})

describe('hasIndexHtml', () => {
  it('detects index.html in string and object entries', () => {
    expect(hasIndexHtml([{ url: 'index.html', revision: 'x' }])).toBe(true)
    expect(hasIndexHtml(['/index.html'])).toBe(true)
    expect(hasIndexHtml([{ url: 'assets/a.js', revision: null }])).toBe(false)
    expect(hasIndexHtml([])).toBe(false)
  })
})
