// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ThemePicker from './ThemePicker'
import type { ThemePreference } from './themes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const LABELS = ['Automático', 'Oscuro', 'Claro', 'Rosa', 'Menta', 'Lavanda', 'Durazno', 'Cielo']
const IDS: ThemePreference[] = ['auto', 'dark', 'light', 'rosa', 'menta', 'lavanda', 'durazno', 'cielo']

let container: HTMLDivElement
let reactRoot: Root

function mount(value: ThemePreference, onChange: (p: ThemePreference) => void) {
  act(() => reactRoot.render(<ThemePicker value={value} onChange={onChange} />))
}
const radios = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'))
const radio = (i: number): HTMLButtonElement => {
  const el = radios()[i]
  if (!el) throw new Error(`radio ${i} missing`)
  return el
}

describe('ThemePicker', () => {
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    reactRoot = createRoot(container)
  })
  afterEach(() => {
    act(() => reactRoot.unmount())
    container.remove()
  })

  it('renders a labelled radiogroup with 8 radios in order', () => {
    mount('dark', vi.fn())
    const group = container.querySelector('[role="radiogroup"]')
    expect(group?.getAttribute('aria-label')).toBe('Tema')
    expect(radios().map((r) => r.getAttribute('aria-label') ?? r.textContent?.trim())).toEqual(LABELS)
  })

  it('aria-checked follows value and only the checked radio is tabbable', () => {
    mount('rosa', vi.fn())
    radios().forEach((r, i) => {
      const checked = IDS[i] === 'rosa'
      expect(r.getAttribute('aria-checked')).toBe(String(checked))
      expect(r.tabIndex).toBe(checked ? 0 : -1)
    })
  })

  it('clicking an option calls onChange with its id', () => {
    const onChange = vi.fn()
    mount('dark', onChange)
    act(() => radio(3).click())
    expect(onChange).toHaveBeenCalledWith('rosa')
  })

  const press = (el: HTMLElement, key: string) =>
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    })

  it('ArrowRight / ArrowLeft move the selection with wraparound', () => {
    const onChange = vi.fn()
    mount('dark', onChange)
    press(radio(1), 'ArrowRight')
    expect(onChange).toHaveBeenLastCalledWith('light')
    press(radio(1), 'ArrowLeft')
    expect(onChange).toHaveBeenLastCalledWith('auto')

    mount('auto', onChange)
    press(radio(0), 'ArrowLeft')
    expect(onChange).toHaveBeenLastCalledWith('cielo')
    mount('cielo', onChange)
    press(radio(7), 'ArrowRight')
    expect(onChange).toHaveBeenLastCalledWith('auto')
  })
})
