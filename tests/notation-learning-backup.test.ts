import { describe, expect, it, vi } from 'vitest'
import legacy from './fixtures/notation-v15.json'
import { notationUnits } from '../src/content/notation-lessons'
import { curriculum } from '../src/content/curriculum'
import { learningOverview } from '../src/core/learning-overview'
import { defaultOpeningTraining } from '../src/core/opening-training'
import { defaultTactics } from '../src/core/tactics'
import { notationLearningSummary } from '../src/core/notation-learning'
import { loadProgressWithStatus, saveProgress } from '../src/core/storage'
import { applyCoursePractice, decodeLearningBackup, encodeLearningBackup, extractCoursePractice, parseCoursePractice, MAX_LEARNING_BACKUP_BYTES } from '../src/core/learning-backup'

// Synthetic files exported by the fixed v15 source, not reconstructed from today's catalog.
const oldIds = ['turns', 'rook', 'horse-leg', 'cannon-capture', 'palace', 'elephant-river', 'soldier', 'capture-target', 'protect', 'give-check', 'resolve-check', 'checkmate', 'stalemate', 'draws', 'read-notation', 'opening-move', 'opening-purpose']
const storage = (raw = legacy.progressRaw) => ({ getItem: vi.fn(() => raw), setItem: vi.fn((_key: string, _value: string) => {}) })
const overview = (progress: ReturnType<typeof loadProgressWithStatus>['progress']) => learningOverview({ progress, opening: defaultOpeningTraining(), tactics: defaultTactics(), openingBlocked: false, tacticsBlocked: false })

describe('notation catalog compatibility with fixed v15 files', () => {
  it('retains the literal original 17 IDs and leaves the original seventh-chapter unit first', () => {
    expect(legacy.synthetic).toBe(true)
    expect(legacy.v15UnitIds).toEqual(oldIds)
    expect(curriculum.flatMap(chapter => chapter.units).filter(unit => oldIds.includes(unit.id)).map(unit => unit.id)).toEqual(oldIds)
    expect(curriculum[6].units.map(unit => unit.id)).toEqual(['read-notation', ...notationUnits.map(unit => unit.id)])
  })

  it.each(['freshProgressRaw', 'progressRaw'] as const)('reads %s without migration writes or implicit new records', key => {
    const source = storage(legacy[key]), before = JSON.parse(legacy[key]).progress
    const loaded = loadProgressWithStatus(source)
    expect(loaded.blocked).toBe(false)
    expect(loaded.progress).toEqual(before)
    expect(source.setItem).not.toHaveBeenCalled()
    expect(notationLearningSummary(loaded.progress)).toMatchObject({ total: 4, mastered: 0, practiced: 0, unrecorded: 4 })
    expect(overview(loaded.progress).notation).toEqual(notationLearningSummary(loaded.progress))
    expect(overview(loaded.progress).course).toMatchObject({ total: 21, mastered: key === 'progressRaw' ? 17 : 0, unrecorded: key === 'progressRaw' ? 4 : 21 })
  })

  it.each(['v1', 'v2'] as const)('reads the old %s file preserving every old array and other modules', key => {
    const decoded = decodeLearningBackup(legacy[key])
    expect(decoded).toEqual(JSON.parse(legacy[key]))
    expect(decoded.modules.coursePractice).toEqual(legacy.coursePractice)
    const source = storage(), before = loadProgressWithStatus(source).progress
    expect(applyCoursePractice(before, decoded.modules.coursePractice!)).toEqual(before)
    expect(extractCoursePractice(before)).toEqual(legacy.coursePractice)
    expect(source.setItem).not.toHaveBeenCalled()
  })

  it.each(['v1', 'v2'] as const)('roundtrips mixed old/new IDs and all twelve assistance IDs in %s without new fields', key => {
    const data = decodeLearningBackup(legacy[key]), course = data.modules.coursePractice!
    course.practicedUnits.push(...notationUnits.map(unit => unit.id))
    course.masteredUnits.push(notationUnits[0].id)
    course.assistedVariants.push(...notationUnits.flatMap(unit => unit.variants.map(task => task.id)))
    const result = decodeLearningBackup(encodeLearningBackup(data))
    expect(result).toEqual(data)
    expect(Object.keys(result.modules.coursePractice!).sort()).toEqual(Object.keys(legacy.coursePractice).sort())
    const source = storage(), before = loadProgressWithStatus(source).progress
    const progress = applyCoursePractice(before, result.modules.coursePractice!)
    expect(progress.session).toBe(before.session)
    expect(progress.collection).toBe(before.collection)
    expect(progress.learningMatch).toBe(before.learningMatch)
    expect(progress.milestones).toEqual(before.milestones)
    expect(saveProgress(source, progress)).toBe(true)
    const raw = source.setItem.mock.calls[0][1]
    expect(loadProgressWithStatus(storage(raw)).progress).toEqual(progress)
    expect(notationLearningSummary(progress)).toMatchObject({ mastered: 1, practiced: 3, unrecorded: 0 })
  })

  it.each(['practicedUnits', 'masteredUnits', 'assistedVariants'] as const)('rejects unknown %s instead of silently dropping the ID', field => {
    const data = decodeLearningBackup(legacy.v1)
    data.modules.coursePractice![field].push('notation-unknown')
    expect(() => decodeLearningBackup(JSON.stringify(data))).toThrow(/未知|数量/)
    expect(() => encodeLearningBackup(data)).toThrow()
  })

  it('continues rejecting mastery without practice, duplicate IDs and additional fields', () => {
    expect(() => parseCoursePractice({ ...legacy.coursePractice, masteredUnits: [...oldIds, notationUnits[0].id] })).toThrow(/练习/)
    expect(() => parseCoursePractice({ ...legacy.coursePractice, practicedUnits: [...oldIds, oldIds[0]] })).toThrow(/重复/)
    expect(() => parseCoursePractice({ ...legacy.coursePractice, notation: {} })).toThrow()
  })

  it('retains four modules, old format versions and the whole-file byte limit', () => {
    const v2 = decodeLearningBackup(legacy.v2)
    expect(decodeLearningBackup(encodeLearningBackup(v2))).toEqual(v2)
    expect(() => decodeLearningBackup(JSON.stringify({ ...v2, version: 1 }))).toThrow(/版本 1/)
    expect(() => decodeLearningBackup(JSON.stringify({ ...v2, version: 3 }))).toThrow(/版本/)
    expect(() => decodeLearningBackup(JSON.stringify({ ...v2, modules: { ...v2.modules, notation: {} } }))).toThrow(/未知/)
    expect(MAX_LEARNING_BACKUP_BYTES).toBe(256 * 1024)
    expect(() => decodeLearningBackup(legacy.v1 + ' '.repeat(MAX_LEARNING_BACKUP_BYTES))).toThrow(/大小|字节|上限/)
  })
})
