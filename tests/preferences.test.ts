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
    expect(loadPreferences(new MemoryStorage())).toEqual({ boardView: 'auto', aiDifficulty: 'normal', boardTheme: 'classic', showCoordinates: false, showCaptured: true })
    const defaults = defaultPreferences()
    defaults.boardView = 'black'
    expect(defaultPreferences().boardView).toBe('auto')
  })

  it.each(['auto', 'red', 'black'] as const)('round trips %s with every supported difficulty in its own versioned key', boardView => {
    for (const aiDifficulty of ['easy', 'normal', 'challenge'] as const) {
      const storage = new MemoryStorage()
      storage.setItem('xiangqi-progress', 'unchanged progress')
      const preferences = { ...defaultPreferences(), boardView, aiDifficulty }
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
    expect(savePreferences(storage, { ...defaultPreferences(), boardView: 'black', aiDifficulty: 'normal' })).toBe(false)
  })

  it('rejects invalid enums before overwriting a valid preference', () => {
    const storage = new MemoryStorage()
    const valid: Preferences = { ...defaultPreferences(), boardView: 'black', aiDifficulty: 'easy' }
    savePreferences(storage, valid)
    expect(savePreferences(storage, { boardView: 'sideways', aiDifficulty: 'easy' } as unknown as Preferences)).toBe(false)
    expect(loadPreferences(storage)).toEqual(valid)
  })

  it('restores old v1 preferences with new display defaults', () => {
    const storage = new MemoryStorage()
    storage.setItem('xiangqi-preferences', JSON.stringify({ version: 1, preferences: { boardView: 'black', aiDifficulty: 'challenge' } }))
    expect(loadPreferences(storage)).toEqual({ boardView: 'black', aiDifficulty: 'challenge', boardTheme: 'classic', showCoordinates: false, showCaptured: true })
  })

  it.each([
    { boardTheme: 'paper', showCoordinates: true, showCaptured: false },
    { boardTheme: 'clear', showCoordinates: 'yes', showCaptured: false },
    { boardTheme: 'clear', showCoordinates: true, showCaptured: 0 },
    { boardTheme: undefined, showCoordinates: true, showCaptured: false },
    { boardTheme: 'clear', showCoordinates: undefined, showCaptured: false },
    { boardTheme: 'clear', showCoordinates: true, showCaptured: undefined },
  ])('defaults each missing or invalid display field independently: %j', display => {
    const storage = new MemoryStorage()
    storage.setItem('xiangqi-preferences', JSON.stringify({ version: 1, preferences: { boardView: 'red', aiDifficulty: 'easy', ...display } }))
    expect(loadPreferences(storage)).toEqual({
      boardView: 'red', aiDifficulty: 'easy',
      boardTheme: display.boardTheme === 'clear' ? 'clear' : 'classic',
      showCoordinates: typeof display.showCoordinates === 'boolean' ? display.showCoordinates : false,
      showCaptured: typeof display.showCaptured === 'boolean' ? display.showCaptured : true,
    })
  })

  it('round trips every display combination without changing progress', () => {
    const storage = new MemoryStorage()
    storage.setItem('xiangqi-progress', 'keep all learning and game data')
    for (const boardTheme of ['classic', 'clear'] as const) for (const showCoordinates of [false, true]) for (const showCaptured of [false, true]) {
      const preferences: Preferences = { ...defaultPreferences(), boardView: 'black', aiDifficulty: 'challenge', boardTheme, showCoordinates, showCaptured }
      expect(savePreferences(storage, preferences)).toBe(true)
      expect(loadPreferences(storage)).toEqual(preferences)
      expect(JSON.parse(storage.getItem('xiangqi-preferences')!)).toEqual({ version: 1, preferences })
    }
    expect(storage.getItem('xiangqi-progress')).toBe('keep all learning and game data')
  })

  it.each([
    { boardTheme: 'paper' }, { showCoordinates: 1 }, { showCaptured: 'false' },
    { boardTheme: undefined }, { showCoordinates: undefined }, { showCaptured: undefined },
  ])('rejects incomplete or invalid display preferences without replacing saved data: %j', invalid => {
    const storage = new MemoryStorage()
    const valid = { ...defaultPreferences(), boardView: 'black' as const }
    savePreferences(storage, valid)
    const before = storage.getItem('xiangqi-preferences')
    expect(savePreferences(storage, { ...valid, ...invalid } as unknown as Preferences)).toBe(false)
    expect(storage.getItem('xiangqi-preferences')).toBe(before)
  })
})
