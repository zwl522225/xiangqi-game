import { describe, expect, it, vi } from 'vitest'
import { endgames } from '../src/content/endgames'
import { defaultEndgameLessons, transitionEndgameLessons, type EndgameData } from '../src/core/endgame-lessons'
import { ENDGAME_STORAGE_KEY, MAX_ENDGAME_BYTES, clearEndgameLessons, loadEndgameLessons, parseEndgameLessons, saveEndgameLessons, type EndgameStorage } from '../src/core/endgame-lessons-storage'

const start = () => transitionEndgameLessons(defaultEndgameLessons(), { type: 'start', id: endgames[0].id }).data
function memory(raw: string | null = null): EndgameStorage & { raw: string | null } {
  return { raw, getItem() { return this.raw }, setItem(_key, value) { this.raw = value }, removeItem() { this.raw = null } }
}
describe('strict independent endgame storage', () => {
  it('round-trips every actual phase, assistance and both colors without storing boards', () => {
    expect(ENDGAME_STORAGE_KEY).toBe('xiangqi-endgame-lessons'); expect(MAX_ENDGAME_BYTES).toBe(32768)
    for (const lesson of endgames) {
      let data = transitionEndgameLessons(defaultEndgameLessons(), { type: 'start', id: lesson.id }).data
      for (let ply = 0; ply <= lesson.line.length; ply++) {
        const storage = memory()
        expect(saveEndgameLessons(storage, data)).toBe(true)
        expect(loadEndgameLessons(storage)).toEqual({ data, blocked: false, error: '' })
        expect(parseEndgameLessons(data)).toEqual(data)
        expect(storage.raw).not.toMatch(/board|positionKeys/)
        if (ply < lesson.line.length) data = transitionEndgameLessons(data, ply % 2 ? { type: 'reply' } : { type: 'submit', move: lesson.line[ply] }).data
      }
    }
    for (const type of ['hint', 'demo', 'explanation'] as const) {
      const data = transitionEndgameLessons(start(), type === 'explanation' ? { type, topic: 'rook-soldier' } : { type }).data
      expect(parseEndgameLessons(data)).toEqual(data)
    }
  })
  it.each([
    (d: EndgameData) => { d.version = 2 as 1 },
    (d: EndgameData) => { delete d.records['cannon-b'] },
    (d: EndgameData) => { d.records.extra = { version: 1, completed: false, independent: false } },
    (d: EndgameData) => { d.records['cannon-a'].independent = true },
    (d: EndgameData) => { d.round!.id = 'future-id' },
    (d: EndgameData) => { d.round!.version = 2 as 1 },
    (d: EndgameData) => { d.round!.ply = 4 },
    (d: EndgameData) => { d.round!.ply = 0.5 },
    (d: EndgameData) => { d.round!.errors = 1000 },
    (d: EndgameData) => { d.round!.hadError = true },
    (d: EndgameData) => { d.round!.errors = 1 },
    (d: EndgameData) => { d.round!.hintLevel = 1 },
    (d: EndgameData) => { d.round!.hintLevel = 4; d.round!.helpUsed = true },
    (d: EndgameData) => { d.round!.helpUsed = true },
    (d: EndgameData) => { d.round!.demoUsed = true },
    (d: EndgameData) => { d.round!.ply = 1; d.round!.hintLevel = 1; d.round!.helpUsed = true },
    (d: EndgameData) => { d.round!.ply = 3 },
    (d: EndgameData) => { d.round!.ply = 3; d.records[d.round!.id].completed = true },
  ])('rejects an impossible record or prefix atomically (%#)', mutate => {
    const data = start(); mutate(data)
    expect(() => parseEndgameLessons(data)).toThrow()
    const raw = JSON.stringify(data); const storage = memory(raw)
    expect(loadEndgameLessons(storage)).toMatchObject({ data: defaultEndgameLessons(), blocked: true })
    expect(storage.raw).toBe(raw); expect(saveEndgameLessons(storage, data)).toBe(false)
  })
  it('never invokes getters, toJSON, inherited fields, sparse arrays or symbol fields', () => {
    const getter = vi.fn(() => 1)
    const candidates: unknown[] = [Object.create(start()), { ...start(), extra: [] }, { ...start(), [Symbol('x')]: 1 }]
    const accessor = start(); Object.defineProperty(accessor.round, 'ply', { get: getter }); candidates.push(accessor)
    const json = start(); Object.defineProperty(json, 'toJSON', { value: getter }); candidates.push(json)
    candidates.push({ ...start(), records: new Array(6) })
    for (const value of candidates) expect(() => parseEndgameLessons(value)).toThrow()
    expect(getter).not.toHaveBeenCalled()
  })
  it('protects oversized, malformed, unknown and read-failed whole modules without leaking exception text', () => {
    for (const raw of ['{broken', ' '.repeat(MAX_ENDGAME_BYTES + 1), JSON.stringify({ ...start(), extra: '棋'.repeat(12000) })]) {
      const storage = memory(raw); expect(loadEndgameLessons(storage)).toMatchObject({ blocked: true, data: defaultEndgameLessons() }); expect(storage.raw).toBe(raw)
    }
    const storage = memory(); storage.getItem = () => { throw Error('PRIVATE/PATH') }
    expect(loadEndgameLessons(storage)).toMatchObject({ blocked: true })
    expect(loadEndgameLessons(storage).error).not.toContain('PRIVATE')
    expect(loadEndgameLessons(memory())).toEqual({ data: defaultEndgameLessons(), blocked: false, error: '' })
  })
  it('catches set/remove failures while preserving raw storage', () => {
    const storage = memory('old'); storage.setItem = () => { throw Error('quota') }; storage.removeItem = () => { throw Error('denied') }
    expect(saveEndgameLessons(storage, start())).toBe(false); expect(clearEndgameLessons(storage)).toBe(false); expect(storage.raw).toBe('old')
    const healthy = memory('old'); expect(clearEndgameLessons(healthy)).toBe(true); expect(healthy.raw).toBeNull()
  })
})
