import type { AiDifficulty } from '../ai/difficulty'
import type { StorageLike } from './storage'

export type Preferences = { boardView: 'auto' | 'red' | 'black'; aiDifficulty: AiDifficulty }
export const defaultPreferences = (): Preferences => ({ boardView: 'auto', aiDifficulty: 'normal' })
const key = 'xiangqi-preferences'
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const validPreferences = (value: unknown): value is Preferences => object(value) &&
  (value.boardView === 'auto' || value.boardView === 'red' || value.boardView === 'black') &&
  (value.aiDifficulty === 'easy' || value.aiDifficulty === 'normal' || value.aiDifficulty === 'challenge')

export function loadPreferences(storage: StorageLike): Preferences {
  try {
    const raw = storage.getItem(key)
    if (!raw) return defaultPreferences()
    const saved: unknown = JSON.parse(raw)
    if (!object(saved) || saved.version !== 1 || !validPreferences(saved.preferences)) return defaultPreferences()
    return { boardView: saved.preferences.boardView, aiDifficulty: saved.preferences.aiDifficulty }
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
