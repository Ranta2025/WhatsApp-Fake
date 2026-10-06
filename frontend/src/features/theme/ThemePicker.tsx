import { useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { THEMES, type ThemePreference } from './themes'

interface ThemePickerProps {
  value: ThemePreference
  onChange: (preference: ThemePreference) => void
}

interface Option {
  id: ThemePreference
  label: string
  /** Preview style; inline colors are intentional: they show fixed theme palettes. */
  swatch: CSSProperties
  accent: string
}

const dark = THEMES.find((t) => t.id === 'dark')!
const light = THEMES.find((t) => t.id === 'light')!

const OPTIONS: readonly Option[] = [
  {
    id: 'auto',
    label: 'Automático',
    swatch: { background: `linear-gradient(135deg, ${dark.swatches[0]} 50%, ${light.swatches[0]} 50%)` },
    accent: dark.swatches[2],
  },
  ...THEMES.map((t) => ({
    id: t.id,
    label: t.label,
    swatch: { background: t.swatches[0] },
    accent: t.swatches[2],
  })),
]

const panelOf = (id: ThemePreference): string | null => THEMES.find((t) => t.id === id)?.swatches[1] ?? null

/** Presentational theme chooser: a radiogroup of swatch buttons with roving tabindex. */
export default function ThemePicker({ value, onChange }: ThemePickerProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const move = (from: number, delta: number) => {
    const next = (from + delta + OPTIONS.length) % OPTIONS.length
    const target = OPTIONS[next]
    if (!target) return
    onChange(target.id)
    refs.current[next]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      move(index, 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      move(index, -1)
    }
  }

  return (
    <div role="radiogroup" aria-label="Tema" className="grid grid-cols-4 gap-2">
      {OPTIONS.map((opt, i) => {
        const checked = opt.id === value
        const panel = panelOf(opt.id)
        return (
          <button
            key={opt.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={opt.label}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(opt.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`flex flex-col items-center gap-1 rounded-xl p-1.5 border transition-colors bg-overlay hover:bg-overlay-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              checked ? 'ring-2 ring-indigo-500 border-transparent' : 'border-border-subtle'
            }`}
          >
            <span
              aria-hidden="true"
              className="relative block w-full h-8 rounded-lg border border-border-subtle overflow-hidden"
              style={opt.swatch}
            >
              {panel && (
                <span
                  className="absolute left-1 bottom-1 w-3 h-3 rounded-sm"
                  style={{ background: panel }}
                />
              )}
              <span className="absolute right-1 bottom-1 w-3 h-3 rounded-full" style={{ background: opt.accent }} />
            </span>
            <span aria-hidden="true" className="text-[11px] leading-tight text-slate-300 truncate max-w-full">
              {opt.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
