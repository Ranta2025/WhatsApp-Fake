// @vitest-environment jsdom
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEMES, resolveTheme, parsePreference, THEME_STORAGE_KEY } from './themes'

const root = process.cwd()
const css = readFileSync(join(root, 'src/index.css'), 'utf8')
const html = readFileSync(join(root, 'index.html'), 'utf8')

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
const REQUIRED_TOKENS = [
  ...['slate', 'indigo', 'purple'].flatMap((fam) => SHADES.map((s) => `--t-${fam}-${s}`)),
  '--t-fg',
  '--t-fg-muted',
  '--t-on-accent',
  '--t-overlay',
  '--t-overlay-strong',
  '--t-border-subtle',
  '--t-scrim',
]

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()[\]\\]/g, '\\$&')
}

/** Declarations of the `:root[data-theme="<id>"]` rule (the dark rule is also the plain `:root` default). */
function themeTokens(id: string): Record<string, string> {
  const re = new RegExp(`:root\\[data-theme="${escapeRegExp(id)}"\\]\\s*\\{([^}]*)\\}`)
  const body = re.exec(css)?.[1]
  if (body === undefined) return {}
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) out[m[1] ?? ''] = (m[2] ?? '').trim()
  return out
}

/** Token value or a loud failure (keeps the contrast assertions strictly typed). */
function tok(tokens: Record<string, string>, name: string): string {
  const v = tokens[name]
  if (v === undefined) throw new Error(`Missing token ${name}`)
  return v
}

function channel(c: number): number {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`Expected a #rrggbb color, got "${hex}"`)
  const n = parseInt(m[1] ?? '', 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

describe('theme registry vs index.css', () => {
  it('has unique ids and a single dark/light scheme per theme', () => {
    const ids = THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(['dark', 'light', 'rosa', 'menta', 'lavanda', 'durazno', 'cielo'])
  })

  it.each(THEMES.map((t) => [t.id] as const))('%s defines every --t-* token', (id) => {
    const tokens = themeTokens(id)
    for (const name of REQUIRED_TOKENS) expect(tokens[name], `${id} ${name}`).toBeTruthy()
  })

  it.each(THEMES.map((t) => [t.id, t.scheme] as const))('%s declares color-scheme %s', (id, scheme) => {
    expect(themeTokens(id)['color-scheme']).toBe(scheme)
  })

  it('maps the palette utilities to the runtime tokens in @theme', () => {
    for (const fam of ['slate', 'indigo', 'purple'])
      for (const s of SHADES) expect(css).toContain(`--color-${fam}-${s}: var(--t-${fam}-${s});`)
    for (const n of ['fg', 'fg-muted', 'on-accent', 'overlay', 'overlay-strong', 'border-subtle', 'scrim'])
      expect(css).toContain(`--color-${n}: var(--t-${n});`)
  })

  it('keeps the dark theme values identical to the pre-theming palette', () => {
    const dark = themeTokens('dark')
    expect(dark['--t-slate-950']).toBe('#0a1015')
    expect(dark['--t-slate-900']).toBe('#121b22')
    expect(dark['--t-slate-100']).toBe('#e9edef')
    expect(dark['--t-indigo-500']).toBe('#13b584')
    expect(dark['--t-indigo-700']).toBe('#0a7559')
    expect(dark['--t-purple-500']).toBe('#08aecb')
    expect(dark['--t-border-subtle']).toBe('rgb(255 255 255 / 0.1)')
    expect(dark['--t-scrim']).toBe('rgb(0 0 0 / 0.6)')
    expect(dark['--t-on-accent']).toBe('#ffffff')
  })
})

describe('theme contrast (WCAG)', () => {
  describe.each(THEMES.map((t) => [t.id] as const))('%s', (id) => {
    const t = themeTokens(id)
    it('fg on page background >= 4.5', () => {
      expect(contrast(tok(t, '--t-slate-100'), tok(t, '--t-slate-950'))).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tok(t, '--t-fg'), tok(t, '--t-slate-950'))).toBeGreaterThanOrEqual(4.5)
    })
    it('fg on panel >= 4.5', () => {
      expect(contrast(tok(t, '--t-slate-100'), tok(t, '--t-slate-900'))).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tok(t, '--t-fg'), tok(t, '--t-slate-900'))).toBeGreaterThanOrEqual(4.5)
    })
    it('muted text (slate-400) on panel >= 3', () => {
      expect(contrast(tok(t, '--t-slate-400'), tok(t, '--t-slate-900'))).toBeGreaterThanOrEqual(3)
    })
    it('on-accent text on own bubble (indigo-700) >= 4.5', () => {
      expect(contrast(tok(t, '--t-on-accent'), tok(t, '--t-indigo-700'))).toBeGreaterThanOrEqual(4.5)
    })
    it('slate-100 text on other bubble (slate-800) >= 4.5', () => {
      expect(contrast(tok(t, '--t-slate-100'), tok(t, '--t-slate-800'))).toBeGreaterThanOrEqual(4.5)
    })
    it('accent text (indigo-300) on panel >= 4.5 for light themes', () => {
      const light = THEMES.find((x) => x.id === id)?.scheme === 'light'
      if (light) expect(contrast(tok(t, '--t-indigo-300'), tok(t, '--t-slate-900'))).toBeGreaterThanOrEqual(4.5)
    })
  })
})

describe('registry metadata', () => {
  it('uses the page background (slate-950) as meta color and first swatch', () => {
    for (const th of THEMES) {
      const tokens = themeTokens(th.id)
      expect(th.metaColor).toBe(tokens['--t-slate-950'])
      expect(th.swatches[0]).toBe(tokens['--t-slate-950'])
      expect(th.swatches[1]).toBe(tokens['--t-slate-900'])
      expect(th.swatches[2]).toBe(tokens['--t-indigo-500'])
    }
  })

  it('resolves auto through the OS scheme and falls back to dark on garbage', () => {
    expect(resolveTheme('auto', true)).toBe('light')
    expect(resolveTheme('auto', false)).toBe('dark')
    expect(resolveTheme('rosa', false)).toBe('rosa')
    expect(parsePreference('nope')).toBe('dark')
    expect(parsePreference(null)).toBe('dark')
    expect(parsePreference('auto')).toBe('auto')
  })
})

describe('index.html bootstrap script', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''

  it('lists exactly the registry ids and meta colors', () => {
    const map = /var m = \{([^}]*)\}/.exec(script)?.[1] ?? ''
    const entries = [...map.matchAll(/(\w+)\s*:\s*"(#[0-9a-f]{6})"/gi)].map((m) => [m[1], m[2]])
    expect(Object.fromEntries(entries)).toEqual(Object.fromEntries(THEMES.map((t) => [t.id, t.metaColor])))
  })

  it('reads the same storage key as the provider', () => {
    expect(script).toContain(`"${THEME_STORAGE_KEY}"`)
  })

  it('applies the stored theme when run (auto, known, garbage)', () => {
    const run = (stored: string | null, light: boolean) => {
      document.documentElement.removeAttribute('data-theme')
      document.documentElement.style.colorScheme = ''
      document.head.innerHTML = '<meta name="theme-color" content="#000000">'
      const orig = window.matchMedia
      window.matchMedia = (() => ({ matches: light })) as unknown as typeof window.matchMedia
      try {
        if (stored === null) localStorage.removeItem(THEME_STORAGE_KEY)
        else localStorage.setItem(THEME_STORAGE_KEY, stored)
        new Function(script)()
      } finally {
        window.matchMedia = orig
      }
      return document.documentElement.dataset.theme
    }
    expect(run('rosa', false)).toBe('rosa')
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(run('dark', true)).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(run('auto', true)).toBe('light')
    expect(run('auto', false)).toBe('dark')
    expect(run('garbage', true)).toBe('dark')
    expect(run(null, true)).toBe('dark')
    expect(run('menta', false)).toBe('menta')
    expect(document.querySelector('meta[name=theme-color]')?.getAttribute('content')).toBe('#e9fbf2')
    localStorage.clear()
  })
})
