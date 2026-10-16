import { describe, expect, it } from 'vitest'
import { createSession, play } from '../src/core/session'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'
import { defaultPractice, normalizePractice, showPracticeHint, startPractice, submitPractice } from '../src/core/practice'
import { practiceExercises } from '../src/content/practice'
import { inspectArchive } from '../src/core/archive-codec'

class MemoryStorage {
  data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
}

describe('local progress', () => {
  it.each([1, 2])('adds an empty collection to old v%s saves and preserves a proven imported origin', version => {
    const imported = inspectArchive({ format: 'yixiang-game', version: 1, title: '起始局面',
      startMoves: [{ from: { x: 0, y: 6 }, to: { x: 0, y: 5 } }],
      moves: [{ from: { x: 0, y: 3 }, to: { x: 0, y: 4 } }], ending: null, notes: { '1': '续练笔记' } })
    if (!imported.ok) throw new Error(imported.error)
    const progress = { ...defaultProgress(), session: imported.value.session, completedLessons: ['board'], solvedPuzzles: ['mate'] }
    const raw = JSON.parse(JSON.stringify(progress))
    delete raw.collection
    const storage = new MemoryStorage()
    storage.setItem('xiangqi-progress', JSON.stringify({ version, progress: raw }))
    const loaded = loadProgress(storage)
    expect(loaded.collection).toEqual({ version: 1, items: [] })
    expect(loaded.session).toEqual(progress.session)
    expect(loaded.completedLessons).toEqual(['board'])
    expect(loaded.solvedPuzzles).toEqual(['mate'])
  })

  it.each([null, { version: 2, startMoves: [] }, { version: 1, startMoves: [{ from: { x: -1, y: 0 }, to: { x: 0, y: 1 } }] },
    { version: 1, startMoves: [], extra: true }])('drops only invalid session origin metadata: %j', origin => {
    const played = play(createSession(), { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    if (!played.ok) throw new Error(played.error)
    const progress = { ...defaultProgress(), session: { ...played.session, notes: { '1': '笔记' } }, completedLessons: ['board'] }
    const storage = new MemoryStorage()
    storage.setItem('xiangqi-progress', JSON.stringify({ version: 2, progress: { ...progress, session: { ...progress.session, origin } } }))
    const loaded = loadProgress(storage)
    expect(Object.hasOwn(loaded.session, 'origin')).toBe(false)
    expect(loaded).toEqual(progress)
  })

  it.each([null, 'broken', { version: 99, items: [] }, { version: 1, items: [null, { id: 'bad' }] }])('recovers a broken collection locally while preserving every learning and current-game field: %j', collection => {
    const played = play(createSession('ai'), { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    if (!played.ok) throw new Error(played.error)
    const progress = { ...defaultProgress(), session: { ...played.session, notes: { '1': '保留' } },
      completedLessons: ['board'], solvedPuzzles: ['mate'], practicedUnits: ['horse'], masteredUnits: ['horse'], assistedVariants: ['hint'],
      milestones: { firstMatch: true, independentMatch: false },
      learningMatch: { active: true, standardStart: false, coachEnabled: false, coachEverUsed: true, checkpointSeen: true, toolMoveUsed: true },
      practice: showPracticeHint(startPractice(defaultPractice(), { mode: 'topic', topicId: 'moves' })),
    }
    const storage = new MemoryStorage()
    storage.setItem('xiangqi-progress', JSON.stringify({ version: 2, progress: { ...progress, collection } }))
    expect(loadProgress(storage)).toEqual({ ...progress, collection: { version: 1, items: [] } })
  })

  it('roundtrips a complete collection in the existing v2 envelope', () => {
    const progress = { ...defaultProgress(), collection: { version: 1 as const, items: [{ id: 'one', savedAt: 1,
      archive: { format: 'yixiang-game' as const, version: 1 as const, title: '保留', startMoves: [],
        moves: [{ from: { x: 0, y: 6 }, to: { x: 0, y: 5 } }], ending: null, notes: { '1': '笔记' } } }] } }
    const storage = new MemoryStorage()
    expect(saveProgress(storage, progress)).toBe(true)
    expect(JSON.parse(storage.getItem('xiangqi-progress')!).version).toBe(2)
    expect(loadProgress(storage)).toEqual(progress)
  })
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
      practice: defaultPractice(),
      collection: { version: 1, items: [] },
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

  it.each([1, 2])('adds empty practice to older v%s saves without changing other progress', version => {
    const storage = new MemoryStorage()
    const progress = { ...defaultProgress(), completedLessons: ['board'] }
    const legacy = JSON.parse(JSON.stringify(progress))
    delete legacy.practice
    storage.setItem('xiangqi-progress', JSON.stringify({ version, progress: legacy }))
    expect(loadProgress(storage).practice).toEqual(defaultPractice())
    expect(loadProgress(storage).completedLessons).toEqual(['board'])
  })

  it('round trips an active practice round with real errors and sticky help in the existing v2 envelope', () => {
    const storage = new MemoryStorage()
    let practice = startPractice(defaultPractice(), { mode: 'topic', topicId: 'moves' })
    const task = practiceExercises.find(exercise => exercise.id === practice.round!.items[0].id)!.task
    if (task.kind !== 'move') throw new Error('move expected')
    practice = showPracticeHint(submitPractice(practice, { kind: 'move', move: { from: { x: 0, y: 0 }, to: { x: 0, y: 1 } } }))
    const progress = { ...defaultProgress(), practice }
    saveProgress(storage, progress)
    expect(loadProgress(storage)).toEqual(progress)
    expect(JSON.parse(storage.getItem('xiangqi-progress')!).version).toBe(2)
  })

  it.each([null, 'broken', { version: 99 }, { version: 1, records: null, round: ['broken'] }])('recovers malformed practice locally while retaining a live game and course state: %j', practice => {
    const storage = new MemoryStorage()
    const played = play(createSession(), { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    if (!played.ok) throw new Error('legal move expected')
    const progress = { ...defaultProgress(), session: { ...played.session, notes: { '1': '留下笔记' } }, practicedUnits: ['rook'], milestones: { firstMatch: true, independentMatch: false } }
    storage.setItem('xiangqi-progress', JSON.stringify({ version: 2, progress: { ...progress, practice } }))
    expect(loadProgress(storage)).toEqual({ ...progress, practice: normalizePractice(practice) })
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
