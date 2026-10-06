import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { ThemeContext, type ThemeContextValue } from './ThemeContext'
import { getTheme, parsePreference, resolveTheme, THEME_STORAGE_KEY, type ThemePreference } from './themes'

const LIGHT_QUERY = '(prefers-color-scheme: light)'

function readStoredPreference(): ThemePreference {
  try {
    return parsePreference(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return parsePreference(null)
  }
}

function subscribeSystemScheme(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const mql = window.matchMedia(LIGHT_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function systemPrefersLight(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(LIGHT_QUERY).matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference)
  // Follow the OS setting live (only matters while the preference is `auto`).
  const prefersLight = useSyncExternalStore(subscribeSystemScheme, systemPrefersLight)

  // Keep tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      // `key === null` means another tab called `localStorage.clear()`: re-read what is stored now.
      if (e.key === null) setPreferenceState(readStoredPreference())
      else if (e.key === THEME_STORAGE_KEY) setPreferenceState(parsePreference(e.newValue))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const theme = resolveTheme(preference, prefersLight)

  useEffect(() => {
    const def = getTheme(theme)
    const root = document.documentElement
    root.dataset.theme = def.id
    root.style.colorScheme = def.scheme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', def.metaColor)
  }, [theme])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Storage unavailable (private mode, quota): the choice still applies for this session.
    }
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, theme, setPreference }),
    [preference, theme, setPreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
