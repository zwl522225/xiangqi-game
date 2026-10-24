import { describe, expect, it } from 'vitest'
import { endgames } from '../src/content/endgames'
import { defaultEndgameLessons, transitionEndgameLessons } from '../src/core/endgame-lessons'
import { backupModuleSummary, decodeLearningBackup, encodeLearningBackup, extractCoursePractice, MAX_LEARNING_BACKUP_BYTES, type LearningBackup } from '../src/core/learning-backup'
import { defaultProgress } from '../src/core/storage'
import { defaultOpeningTraining } from '../src/core/opening-training'
import { defaultTactics } from '../src/core/tactics'
import { learningOverview } from '../src/core/learning-overview'
const initial = () => defaultEndgameLessons()
const started = () => transitionEndgameLessons(initial(), { type: 'start', id: endgames[0].id }).data
const backup = (version: 1 | 2 = 2): LearningBackup => ({ format: 'yixiang-learning-backup', version, exportedAt: '2026-10-24T01:02:03.000Z', modules: { endgame: started() } })
const decode = (value: unknown) => decodeLearningBackup(JSON.stringify(value))
describe('endgame backup versioning and overview', () => {
  it('round trips version 2 progress and assistance without changing the input', () => {
    const source = backup(); source.modules.endgame = transitionEndgameLessons(started(), { type: 'hint' }).data
    const raw = JSON.stringify(source)
    expect(decodeLearningBackup(encodeLearningBackup(source))).toEqual(source)
    expect(JSON.stringify(source)).toBe(raw)
    expect(backupModuleSummary('endgame', source.modules.endgame! ).join(' ')).toContain('0/6')
  })
  it('accepts any nonempty known version 2 subset and preserves version 1 compatibility', () => {
    const modules = { coursePractice: extractCoursePractice(defaultProgress()), opening: defaultOpeningTraining(), tactics: defaultTactics(), endgame: initial() }
    const keys = Object.keys(modules) as (keyof typeof modules)[]
    for (let bits = 1; bits < 16; bits++) {
      const subset = Object.fromEntries(keys.filter((_, i) => bits & (1 << i)).map(key => [key, modules[key]]))
      expect(decode({ ...backup(), modules: subset }).modules).toEqual(subset)
      if (!('endgame' in subset)) expect(decode({ ...backup(1), modules: subset }).version).toBe(1)
    }
    expect(() => encodeLearningBackup(backup(1))).toThrow()
    expect(() => decode(backup(1))).toThrow()
  })
  it('rejects unknown fields, versions, empty modules and one invalid block before preview', () => {
    for (const source of [ { ...backup(), extra: 1 }, { ...backup(), version: 3 }, { ...backup(), modules: {} },
      { ...backup(), modules: { endgame: initial(), unknown: {} } },
      { ...backup(), modules: { endgame: { ...initial(), extra: true } } },
      { ...backup(), modules: { endgame: initial(), opening: {} } },
      { ...backup(), modules: { endgame: { ...started(), round: { ...started().round, ply: 3 } } } },
      { ...backup(), modules: { endgame: { ...initial(), records: { wrong: {} } } } },
    ]) expect(() => decode(source)).toThrow()
    expect(() => decodeLearningBackup(' '.repeat(MAX_LEARNING_BACKUP_BYTES) + encodeLearningBackup(backup()))).toThrow()
    expect(() => decode({ ...backup(), modules: { endgame: { ...initial(), padding: 'x'.repeat(32 * 1024) } } })).toThrow()
  })
  it('reports six histories and a temporary round without changing the original recommendation', () => {
    const state = { progress: defaultProgress(), opening: defaultOpeningTraining(), tactics: defaultTactics(), openingBlocked: false, tacticsBlocked: false }
    const original = learningOverview(state)
    const endgame = started()
    endgames.forEach((lesson, index) => { endgame.records[lesson.id] = { version: 1, completed: index < 5, independent: index < 3 } })
    const result = learningOverview({ ...state, endgame, endgameBlocked: false })
    expect(result.endgame).toMatchObject({ total: 6, history: { completed: 5, independent: 3 }, round: { title: endgames[0].title, side: 'red', ply: 0, total: 3 } })
    expect(result.pendingRounds.at(-1)).toMatchObject({ destination: { kind: 'endgame' }, completed: 0, total: 3 })
    expect(result.suggestion).toEqual(original.suggestion)
    const protectedView = learningOverview({ ...state, endgame, endgameBlocked: true })
    expect(protectedView.endgame.history).toBeNull()
    expect(protectedView.endgame.round?.temporary).toBe(true)
  })
})
