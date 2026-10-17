import type { AiDifficulty } from '../ai/difficulty'
import type { StorageLike } from './storage'

export type BoardTheme = 'classic' | 'clear'
export type Preferences = {
  boardView: 'auto' | 'red' | 'black'
  aiDifficulty: AiDifficulty
  boardTheme: BoardTheme
  showCoordinates: boolean
  showCaptured: boolean
}
export type DisplayPreferences = Pick<Preferences, 'boardTheme' | 'showCoordinates' | 'showCaptured'>
export const defaultPreferences = (): Preferences => ({
  boardView: 'auto', aiDifficulty: 'normal', boardTheme: 'classic', showCoordinates: false, showCaptured: true,
})
const key = 'xiangqi-preferences'
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const validPlayPreferences = (value: unknown): value is Pick<Preferences, 'boardView' | 'aiDifficulty'> & Record<string, unknown> => object(value) &&
  (value.boardView === 'auto' || value.boardView === 'red' || value.boardView === 'black') &&
  (value.aiDifficulty === 'easy' || value.aiDifficulty === 'normal' || value.aiDifficulty === 'challenge')
const validPreferences = (value: unknown): value is Preferences => validPlayPreferences(value) &&
  (value.boardTheme === 'classic' || value.boardTheme === 'clear') &&
  typeof value.showCoordinates === 'boolean' && typeof value.showCaptured === 'boolean'

export function loadPreferences(storage: StorageLike): Preferences {
  try {
    const raw = storage.getItem(key)
    if (!raw) return defaultPreferences()
    const saved: unknown = JSON.parse(raw)
    if (!object(saved) || saved.version !== 1 || !validPlayPreferences(saved.preferences)) return defaultPreferences()
    const preferences = saved.preferences
    const defaults = defaultPreferences()
    return {
      boardView: preferences.boardView, aiDifficulty: preferences.aiDifficulty,
      boardTheme: preferences.boardTheme === 'classic' || preferences.boardTheme === 'clear' ? preferences.boardTheme : defaults.boardTheme,
      showCoordinates: typeof preferences.showCoordinates === 'boolean' ? preferences.showCoordinates : defaults.showCoordinates,
      showCaptured: typeof preferences.showCaptured === 'boolean' ? preferences.showCaptured : defaults.showCaptured,
    }
  } catch {
    return defaultPreferences()
  }
}

export function savePreferences(storage: StorageLike, preferences: Preferences): boolean {
  try {
    if (!validPreferences(preferences)) return false
    storage.setItem(key, JSON.stringify({ version: 1, preferences }))
    return true
  } catch {
    return false
  }
}
