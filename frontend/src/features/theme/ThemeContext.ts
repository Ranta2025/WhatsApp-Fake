import { createContext } from 'react'
import type { ThemeId, ThemePreference } from './themes'

export interface ThemeContextValue {
  /** What the user chose (may be `auto`). */
  preference: ThemePreference
  /** The theme actually applied. */
  theme: ThemeId
  setPreference: (preference: ThemePreference) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
