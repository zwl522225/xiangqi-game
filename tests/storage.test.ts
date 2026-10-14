import { describe, expect, it } from 'vitest'
import { createSession, play } from '../src/core/session'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'

class MemoryStorage {
  data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
}

describe('local progress', () => {
  it.each([1, 2])('restores v%s without notes and drops only malformed note entries', version => {
    const storage = new MemoryStorage()
    const played = play(createSession(), { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    if (!played.ok) throw new Error('legal move expected')
    const progress = { ...defaultProgress(), session: played.session, completedLessons: ['board'] }
    const legacy = JSON.parse(JSON.stringify(progress))
    delete legacy.session.notes
    storage.setItem('xiangqi-progress', JSON.stringify({ version, progress: legacy }))
    expect(loadProgress(storage).session.notes).toEqual({})
    legacy.session.notes = { '1': '真实笔记', '0': '开局', '2': '未来', '1.0': '重复键', bad: 42 }
    storage.setItem('xiangqi-progress', JSON.stringify({ version, progress: legacy }))
    const restored = loadProgress(storage)
    expect(restored.session.notes).toEqual({ '1': '真实笔记' })
    expect(restored.session.game).toEqual(played.session.game)
    expect(restored.completedLessons).toEqual(['board'])
    legacy.session.notes = { '1': 'x'.repeat(501) }
    storage.setItem('xiangqi-progress', JSON.stringify({ version, progress: legacy }))
    expect(loadProgress(storage).session.notes).toEqual({})
    legacy.session.notes = ['bad']
    storage.setItem('xiangqi-progress', JSON.stringify({ version, progress: legacy }))
    expect(loadProgress(storage).session.records).toHaveLength(1)
    expect(loadProgress(storage).session.notes).toEqual({})
  })
  it('migrates a v1 played game and legacy labels without inferring new units', () => {
    const storage = new MemoryStorage()
    const played = play(createSession('ai', 'red'), { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    if (!played.ok) throw new Error('expected legal move')
    const legacy = { session: played.session, completedLessons: ['board', 'pieces'], solvedPuzzles: ['mate'] }
    storage.setItem('xiangqi-progress', JSON.stringify({ version: 1, progress: legacy }))

    expect(loadProgress(storage)).toEqual({
      ...legacy,
      practicedUnits: [], masteredUnits: [], assistedVariants: [],
      milestones: { firstMatch: false, independentMatch: false }, learningMatch: null,
    })
  })

  it('writes and restores the complete v2 state', () => {
    const storage = new MemoryStorage()
    const progress = {
      ...defaultProgress(), completedLessons: ['board'], solvedPuzzles: ['mate'],
      practicedUnits: ['horse'], masteredUnits: ['horse'], assistedVariants: ['rook-variant-1'],
      milestones: { firstMatch: true, independentMatch: false },
      learningMatch: { active: true, standardStart: true, coachEnabled: false, coachEverUsed: true, checkpointSeen: true },
    }
    expect(saveProgress(storage, progress)).toBe(true)
    expect(JSON.parse(storage.getItem('xiangqi-progress')!).version).toBe(2)
    expect(loadProgress(storage)).toEqual(progress)
  })

  it('restores optional tool history and accepts older v2 learning metadata without it', () => {
    const storage = new MemoryStorage()
    const metadata = { active: true, standardStart: true, coachEnabled: false, coachEverUsed: false, checkpointSeen: false }
    const progress = { ...defaultProgress(), session: createSession('ai'), learningMatch: metadata }
    saveProgress(storage, progress)
    expect(loadProgress(storage).learningMatch).toEqual(metadata)
    const assisted = { ...progress, learningMatch: { ...metadata, toolMoveUsed: true } }
    saveProgress(storage, assisted)
    expect(loadProgress(storage).learningMatch).toEqual(assisted.learningMatch)
  })

  it.each([
    { practicedUnits: ['valid', 42] },
    { masteredUnits: 'horse' },
    { assistedVariants: [null] },
    { milestones: { firstMatch: 'yes', independentMatch: false } },
    { milestones: { firstMatch: false, independentMatch: true } },
    { learningMatch: { active: true, standardStart: true, coachEnabled: false, coachEverUsed: 'yes', checkpointSeen: false } },
    { learningMatch: { active: true, standardStart: true, coachEnabled: true, coachEverUsed: false, checkpointSeen: false } },
    { learningMatch: { active: true, standardStart: true, coachEnabled: false, coachEverUsed: false, checkpointSeen: false, toolMoveUsed: 'yes' } },
    { learningMatch: undefined },
  ])('rejects malformed v2 fields and safely defaults: %j', badFields => {
    const storage = new MemoryStorage()
    storage.setItem('xiangqi-progress', JSON.stringify({ version: 2, progress: { ...defaultProgress(), ...badFields } }))
    expect(loadProgress(storage)).toEqual(defaultProgress())
  })

  it('restores a live game and completed lessons', () => {
    const storage = new MemoryStorage()
    const played = play(createSession(), { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    if (!played.ok) throw new Error('expected legal move')
    const progress = { ...defaultProgress(), session: played.session, completedLessons: ['board'] }
    expect(saveProgress(storage, progress)).toBe(true)
    const restored = loadProgress(storage)
    expect(restored.session.game.board[5][0]?.type).toBe('soldier')
    expect(restored.completedLessons).toEqual(['board'])
  })

  it('rejects damaged data and unknown versions', () => {
    const storage = new MemoryStorage()
    storage.setItem('xiangqi-progress', '{broken')
    expect(loadProgress(storage).session.game.turn).toBe('red')
    storage.setItem('xiangqi-progress', JSON.stringify({ version: 99, completedLessons: ['board'] }))
    expect(loadProgress(storage).completedLessons).toEqual([])
    const bad = defaultProgress()
    bad.session.game.board[0] = []
    storage.setItem('xiangqi-progress', JSON.stringify({ version: 1, progress: bad }))
    expect(loadProgress(storage).session.game.board[0]).toHaveLength(9)
  })

  it('rejects a damaged move record before the UI can replay it', () => {
    const storage = new MemoryStorage()
    const played = play(createSession(), { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    if (!played.ok) throw new Error('expected legal move')
    saveProgress(storage, { ...defaultProgress(), session: played.session })
    const envelope = JSON.parse(storage.getItem('xiangqi-progress')!)
    delete envelope.progress.session.records[0].move
    storage.setItem('xiangqi-progress', JSON.stringify(envelope))
    expect(loadProgress(storage).session.records).toHaveLength(0)
  })
})
