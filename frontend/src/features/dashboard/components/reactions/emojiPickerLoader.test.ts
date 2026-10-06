// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('emoji-picker-element', () => ({
  Picker: class {
    classList = document.createElement('div').classList
  },
}))
vi.mock('emoji-picker-element/i18n/es', () => ({ default: {} }))
vi.mock('emoji-picker-element-data/es/cldr/data.json?url', () => ({ default: '/data.json' }))

import { createEmojiPicker } from './emojiPickerLoader'

describe('createEmojiPicker', () => {
  afterEach(() => {
    document.documentElement.style.colorScheme = ''
  })

  it('uses the dark class for dark schemes and by default', () => {
    expect(createEmojiPicker().classList.contains('dark')).toBe(true)
    document.documentElement.style.colorScheme = 'dark'
    expect(createEmojiPicker().classList.contains('dark')).toBe(true)
  })

  it('uses the light class when the active scheme is light', () => {
    document.documentElement.style.colorScheme = 'light'
    const picker = createEmojiPicker()
    expect(picker.classList.contains('light')).toBe(true)
    expect(picker.classList.contains('dark')).toBe(false)
  })
})
