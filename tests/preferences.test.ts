import { describe, expect, it } from 'vitest'
import { defaultPreferences, loadPreferences, savePreferences } from '../src/core/preferences'
import type { Preferences } from '../src/core/preferences'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

describe('independent play preferences', () => {
  it('defaults to following the player and normal difficulty when missing', () => {
    expect(loadPreferences(new MemoryStorage())).toEqual({ boardView: 'auto', aiDifficulty: 'normal' })
    const defaults = defaultPreferences()
    defaults.boardView = 'black'
    expect(defaultPreferences().boardView).toBe('auto')
  })

  it.each(['auto', 'red', 'black'] as const)('round trips %s with every supported difficulty in its own versioned key', boardView => {
    for (const aiDifficulty of ['easy', 'normal', 'challenge'] as const) {
      const storage = new MemoryStorage()
      storage.setItem('xiangqi-progress', 'unchanged progress')
      const preferences = { boardView, aiDifficulty }
      expect(savePreferences(storage, preferences)).toBe(true)
      expect(JSON.parse(storage.getItem('xiangqi-preferences')!)).toEqual({ version: 1, preferences })
      expect(loadPreferences(storage)).toEqual(preferences)
      expect(storage.getItem('xiangqi-progress')).toBe('unchanged progress')
    }
  })

  it.each([
    '{broken', 'null', '[]', '{}',
    JSON.stringify({ version: 99, preferences: { boardView: 'black', aiDifficulty: 'challenge' } }),
    ...[
      null, [], {}, { boardView: 'BLACK', aiDifficulty: 'normal' },
      { boardView: 'red', aiDifficulty: 'hard' }, { boardView: 'red' },
      { boardView: false, aiDifficulty: 1 },
    ].map(preferences => JSON.stringify({ version: 1, preferences })),
  ])('safely defaults for damaged or unknown data: %s', raw => {
    const storage = new MemoryStorage()
    storage.setItem('xiangqi-preferences', raw)
    expect(loadPreferences(storage)).toEqual(defaultPreferences())
  })

  it('catches storage read and write failures', () => {
    const storage = {
      getItem() { throw new Error('read denied') },
      setItem() { throw new Error('quota reached') },
    }
    expect(loadPreferences(storage)).toEqual(defaultPreferences())
    expect(savePreferences(storage, { boardView: 'black', aiDifficulty: 'normal' })).toBe(false)
  })

  it('rejects invalid enums before overwriting a valid preference', () => {
    const storage = new MemoryStorage()
    const valid: Preferences = { boardView: 'black', aiDifficulty: 'easy' }
    savePreferences(storage, valid)
    expect(savePreferences(storage, { boardView: 'sideways', aiDifficulty: 'easy' } as unknown as Preferences)).toBe(false)
    expect(loadPreferences(storage)).toEqual(valid)
  })
})
