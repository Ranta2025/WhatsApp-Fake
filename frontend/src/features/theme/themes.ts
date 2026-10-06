export type ThemeId = 'dark' | 'light' | 'rosa' | 'menta' | 'lavanda' | 'durazno' | 'cielo'
export type ThemePreference = ThemeId | 'auto'
export type ThemeScheme = 'dark' | 'light'

export interface ThemeDefinition {
  id: ThemeId
  /** Spanish label shown in the picker. */
  label: string
  scheme: ThemeScheme
  /** Value of `<meta name="theme-color">` (the page background of the theme). */
  metaColor: string
  /** [background, panel, accent] preview colors for the picker. */
  swatches: readonly [string, string, string]
}

/**
 * Single source of truth for the available themes. The CSS tokens live in
 * `src/index.css` (`:root[data-theme="<id>"]`) and the pre-React bootstrap
 * script in `index.html` mirrors ids and meta colors; tests keep all three in sync.
 */
const DARK_THEME: ThemeDefinition = {
  id: 'dark',
  label: 'Oscuro',
  scheme: 'dark',
  metaColor: '#0a1015',
  swatches: ['#0a1015', '#121b22', '#13b584'],
}

export const THEMES: readonly ThemeDefinition[] = [
  DARK_THEME,
  { id: 'light', label: 'Claro', scheme: 'light', metaColor: '#f3f6f7', swatches: ['#f3f6f7', '#ffffff', '#0da573'] },
  { id: 'rosa', label: 'Rosa', scheme: 'light', metaColor: '#fbe9ef', swatches: ['#fbe9ef', '#fdf7f9', '#9c164e'] },
  { id: 'menta', label: 'Menta', scheme: 'light', metaColor: '#e9fbf2', swatches: ['#e9fbf2', '#f7fdfa', '#169c70'] },
  { id: 'lavanda', label: 'Lavanda', scheme: 'light', metaColor: '#f1e9fb', swatches: ['#f1e9fb', '#f9f7fd', '#47169c'] },
  { id: 'durazno', label: 'Durazno', scheme: 'light', metaColor: '#fbf1e9', swatches: ['#fbf1e9', '#fdf9f7', '#9c3e16'] },
  { id: 'cielo', label: 'Cielo', scheme: 'light', metaColor: '#e9f4fb', swatches: ['#e9f4fb', '#f7fafd', '#16649c'] },
]

export const DEFAULT_THEME: ThemeId = 'dark'
export const THEME_STORAGE_KEY = 'whatsapp-fake:theme'

export function getTheme(id: ThemeId): ThemeDefinition {
  return THEMES.find((t) => t.id === id) ?? DARK_THEME
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some((t) => t.id === value)
}

/** Parses a stored value; anything unknown or absent falls back to the default theme. */
export function parsePreference(value: unknown): ThemePreference {
  if (value === 'auto') return 'auto'
  return isThemeId(value) ? value : DEFAULT_THEME
}

export function resolveTheme(preference: ThemePreference, prefersLight: boolean): ThemeId {
  if (preference === 'auto') return prefersLight ? 'light' : 'dark'
  return preference
}
