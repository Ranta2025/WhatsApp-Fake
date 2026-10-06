// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from './ThemeProvider'
import { useTheme } from './useTheme'
import { THEME_STORAGE_KEY } from './themes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Probe() {
  const { preference, theme, setPreference } = useTheme()
  return (
    <div>
      <span id="pref">{preference}</span>
      <span id="theme">{theme}</span>
      <button id="rosa" onClick={() => setPreference('rosa')} />
      <button id="auto" onClick={() => setPreference('auto')} />
    </div>
  )
}

type Listener = (e: MediaQueryListEvent) => void
let mqlMatches = false
let listeners: Listener[] = []

function mockMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return mqlMatches
      },
      addEventListener: (_: string, l: Listener) => listeners.push(l),
      removeEventListener: (_: string, l: Listener) => {
        listeners = listeners.filter((x) => x !== l)
      },
    })),
  )
}

function setSystemLight(light: boolean) {
  mqlMatches = light
  act(() => listeners.forEach((l) => l({ matches: light } as MediaQueryListEvent)))
}

const root = document.documentElement
const metaContent = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content')

let container: HTMLDivElement
let reactRoot: Root

function mount() {
  act(() => reactRoot.render(<ThemeProvider><Probe /></ThemeProvider>))
}
const text = (id: string) => container.querySelector(`#${id}`)?.textContent
const click = (id: string) => act(() => container.querySelector<HTMLButtonElement>(`#${id}`)?.click())

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    mqlMatches = false
    listeners = []
    mockMatchMedia()
    document.head.innerHTML = '<meta name="theme-color" content="#0a1015">'
    root.removeAttribute('data-theme')
    root.style.colorScheme = ''
    container = document.createElement('div')
    document.body.appendChild(container)
    reactRoot = createRoot(container)
  })
  afterEach(() => {
    act(() => reactRoot.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('applies the stored theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'lavanda')
    mount()
    expect(root.dataset.theme).toBe('lavanda')
    expect(root.style.colorScheme).toBe('light')
    expect(metaContent()).toBe('#f1e9fb')
  })

  it('falls back to dark on garbage or absent values', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'neon')
    mount()
    expect(text('theme')).toBe('dark')
    expect(root.dataset.theme).toBe('dark')
    expect(root.style.colorScheme).toBe('dark')
  })

  it('setPreference persists and applies', () => {
    mount()
    click('rosa')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('rosa')
    expect(root.dataset.theme).toBe('rosa')
    expect(metaContent()).toBe('#fbe9ef')
  })

  it('auto follows matchMedia and reacts to changes', () => {
    mount()
    click('auto')
    expect(text('pref')).toBe('auto')
    expect(root.dataset.theme).toBe('dark')
    setSystemLight(true)
    expect(root.dataset.theme).toBe('light')
    expect(root.style.colorScheme).toBe('light')
    expect(metaContent()).toBe('#f3f6f7')
    setSystemLight(false)
    expect(root.dataset.theme).toBe('dark')
  })

  it('does not follow the OS when a fixed theme is chosen', () => {
    mount()
    click('rosa')
    setSystemLight(true)
    expect(root.dataset.theme).toBe('rosa')
  })

  it('syncs across tabs through the storage event', () => {
    mount()
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'cielo' }))
    })
    expect(root.dataset.theme).toBe('cielo')
  })

  it('still applies the choice when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    mount()
    click('rosa')
    expect(root.dataset.theme).toBe('rosa')
  })

  it('re-reads storage when another tab clears it (key === null)', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'rosa')
    mount()
    expect(root.dataset.theme).toBe('rosa')
    localStorage.clear()
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: null }))
    })
    expect(root.dataset.theme).toBe('dark')
  })

  it('falls back to the default theme when getItem throws at mount', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    mount()
    expect(text('theme')).toBe('dark')
    expect(root.dataset.theme).toBe('dark')
  })
})
