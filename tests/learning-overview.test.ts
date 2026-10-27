import { describe, expect, it } from 'vitest'
import { curriculum } from '../src/content/curriculum'
import { practiceExercises } from '../src/content/practice'
import { openings } from '../src/content/openings'
import { tactics } from '../src/content/tactics'
import { puzzles } from '../src/content/puzzles'
import { defaultProgress } from '../src/core/storage'
import { defaultPractice, startPractice, type PracticeRecord } from '../src/core/practice'
import { defaultOpeningTraining, transitionOpeningTraining } from '../src/core/opening-training'
import { defaultTactics, transitionTactics } from '../src/core/tactics'
import { learningOverview, type LearningOverviewInput } from '../src/core/learning-overview'

const units = curriculum.flatMap(chapter => chapter.units)
function input(): LearningOverviewInput {
  return { progress: defaultProgress(), opening: defaultOpeningTraining(), tactics: defaultTactics(), openingBlocked: false, tacticsBlocked: false }
}
function practicedRecord(version = practiceExercises[0].version): PracticeRecord {
  return { version, attempts: 3, errors: 3, review: 'pending', lastError: null, reviewEvidence: null }
}
function allMastered() {
  const state = input()
  state.progress.masteredUnits = units.map(unit => unit.id)
  return state
}
function activeRounds() {
  const state = input()
  state.progress.practice = startPractice(defaultPractice(), { mode: 'recommended' })
  state.opening = transitionOpeningTraining(state.opening, { type: 'start', openingId: openings[0].id, side: 'black' }).data
  state.tactics = transitionTactics(state.tactics, { type: 'start', request: { mode: 'recommended' } }).data
  return state
}
function completeCatalogs(state = allMastered()) {
  state.opening.groups = state.opening.groups.map(group => ({ ...group, completed: true, unassisted: true }))
  state.tactics.records = state.tactics.records.map(record => ({ ...record, everCompleted: true, everIndependent: true }))
  return state
}
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
}

describe('learning overview statistics', () => {
  it('uses the current eight chapters and 21 units, with a deterministic first learning suggestion', () => {
    const result = learningOverview(input())
    expect(result.course).toMatchObject({ total: 21, mastered: 0, practiced: 0, unrecorded: 21, legacyCompleted: 0 })
    expect(result.course.chapters.map(chapter => chapter.id)).toEqual(curriculum.map(chapter => chapter.id))
    expect(result.single).toMatchObject({ total: 20, attempted: 0, pendingReview: 0, round: null })
    expect(result.opening).toMatchObject({ total: 8, history: { completed: 0, unassisted: 0 }, round: null })
    expect(result.tactics).toMatchObject({ total: 6, history: { completed: 0, independent: 0, pendingReview: 0 }, round: null })
    expect(result.puzzles).toEqual({ total: 6, solved: 0 })
    expect(result.pendingRounds).toEqual([])
    expect(result.suggestion.destination).toEqual({ kind: 'lesson', unitId: units[0].id })
    expect(result.suggestion.title).toContain('学习')
  })

  it('deduplicates current unit IDs and keeps mastery, practiced and unrecorded mutually exclusive', () => {
    const state = input()
    state.progress.masteredUnits = [units[0].id, units[0].id, 'missing']
    state.progress.practicedUnits = [units[0].id, units[1].id, units[1].id, 'missing']
    const result = learningOverview(state)
    expect(result.course).toMatchObject({ mastered: 1, practiced: 1, unrecorded: 19 })
    expect(result.course.chapters[0]).toMatchObject({ mastered: 1, practiced: 0 })
    expect(result.course.chapters[0].destination).toEqual({ kind: 'lesson', unitId: units[0].id })
    expect(result.course.chapters.find(chapter => chapter.id === curriculum.find(chapter => chapter.units.some(unit => unit.id === units[1].id))!.id)?.practiced).toBe(1)
    expect(result.suggestion.destination).toEqual({ kind: 'lesson', unitId: units[1].id })
    expect(result.suggestion.title).toContain('复习')
  })

  it('keeps legacy chapter completion separate from knowledge mastery and old puzzles include assisted completions', () => {
    const state = input()
    state.progress.completedLessons = [curriculum[0].id, curriculum[0].id, 'unknown']
    state.progress.solvedPuzzles = [puzzles[0].id, puzzles[0].id, 'unknown']
    const result = learningOverview(state)
    expect(result.course).toMatchObject({ mastered: 0, practiced: 0, legacyCompleted: 1 })
    expect(result.course.chapters[0].legacyCompleted).toBe(true)
    expect(result.puzzles).toEqual({ total: puzzles.length, solved: 1 })
    expect(result.puzzles).not.toHaveProperty('independent')
  })

  it('counts wrong-only single attempts as recorded answers, without claiming historical success', () => {
    const state = input()
    state.progress.practice!.records = {
      [practiceExercises[0].id]: practicedRecord(),
      [practiceExercises[1].id]: { ...practicedRecord(), version: practiceExercises[1].version + 1 },
      [practiceExercises[2].id]: { ...practicedRecord(practiceExercises[2].version), attempts: 0, review: null },
      unknown: practicedRecord(),
    }
    const single = learningOverview(state).single
    expect(single).toMatchObject({ attempted: 1, pendingReview: 1 })
    expect(single).not.toHaveProperty('completed')
    expect(single).not.toHaveProperty('independent')
  })

  it('treats omitted legacy practice as available empty records', () => {
    const state = input()
    delete state.progress.practice
    expect(learningOverview(state).single).toMatchObject({ attempted: 0, pendingReview: 0, round: null })
  })

  it('counts unique exact opening versions and sides while preserving historical unassisted evidence', () => {
    const state = input(), group = state.opening.groups[0]
    state.opening.groups = [
      { ...group, completed: true, unassisted: false }, { ...group, completed: true, unassisted: true },
      { ...group, openingVersion: group.openingVersion + 1, completed: true, unassisted: true },
      { ...group, openingId: 'unknown', completed: true, unassisted: true },
      { ...state.opening.groups[1], completed: true, unassisted: false },
    ]
    expect(learningOverview(state).opening.history).toEqual({ completed: 2, unassisted: 1 })
  })

  it('deduplicates tactic records and ignores unknown IDs or mismatching versions', () => {
    const state = input(), record = state.tactics.records[0]
    state.tactics.records = [
      { ...record, everCompleted: true, review: 'pending' },
      { ...record, everCompleted: true, everIndependent: true, review: 'pending' },
      { ...record, id: 'unknown', everCompleted: true, everIndependent: true },
      { ...record, version: 2 as 1, everCompleted: true, everIndependent: true },
    ]
    expect(learningOverview(state).tactics.history).toEqual({ completed: 1, independent: 1, pendingReview: 1 })
  })

  it('retains all single current-round result categories independently of historical attempts', () => {
    const state = activeRounds(), round = state.progress.practice!.round!
    round.items[0].result = 'independent'
    round.items[1].result = 'assisted'
    round.items[2].result = 'skipped'
    round.index = 2
    const single = learningOverview(state).single
    expect(single.attempted).toBe(0)
    expect(single.round).toMatchObject({ total: 5, completed: 3, independent: 1, assisted: 1, skipped: 1, index: 2, waitingNext: true, finished: false })
  })

  it('reports all four tactic result categories without promoting revealed or skipped to historical completion', () => {
    const state = activeRounds(), prototype = state.tactics.round!.items[0]
    state.tactics.round!.items = tactics.slice(0, 4).map((tactic, index) => ({ ...prototype, id: tactic.id, result: (['independent', 'assisted', 'revealed', 'skipped'] as const)[index] }))
    const result = learningOverview(state)
    expect(result.tactics.history).toEqual({ completed: 0, independent: 0, pendingReview: 0 })
    expect(result.tactics.round).toMatchObject({ total: 4, completed: 4, independent: 1, assisted: 1, revealed: 1, skipped: 1, waitingNext: true })
  })

  it('uses the actual active opening title, side and ply out of its eight steps', () => {
    const state = activeRounds()
    state.opening.active!.ply = 3
    expect(learningOverview(state).opening.round).toEqual({ openingId: openings[0].id, title: openings[0].title, side: 'black', ply: 3, total: 8, finished: false, temporary: false })
  })

  it('reads only existing milestone flags and does not award them from a match or other completion', () => {
    const state = completeCatalogs()
    expect(learningOverview(state).milestones).toEqual({ firstMatch: false, independentMatch: false })
    state.progress.milestones = { firstMatch: true, independentMatch: false }
    expect(learningOverview(state).milestones).toEqual(state.progress.milestones)
  })

  it('ignores unsupported module versions rather than reading their records or active rounds', () => {
    const state = activeRounds()
    state.progress.practice!.version = 2 as 1
    state.opening.version = 2 as 1
    state.tactics.version = 2 as 1
    const result = learningOverview(state)
    expect(result.single).toMatchObject({ attempted: 0, pendingReview: 0, round: null })
    expect(result.opening.history).toBe(null)
    expect(result.tactics.history).toBe(null)
    expect(result.pendingRounds).toEqual([])
  })
})

describe('deterministic overview navigation', () => {
  it('lists at most three unfinished rounds in single, opening, tactics order and suggests the first', () => {
    const state = activeRounds()
    state.progress.practice!.round!.items[0].result = 'skipped'
    const result = learningOverview(state)
    expect(result.pendingRounds.map(round => round.destination.kind)).toEqual(['single', 'opening', 'tactics'])
    expect(result.pendingRounds[0]).toMatchObject({ waitingNext: true, temporary: false })
    expect(result.pendingRounds[0].reason).toContain('本题已结束')
    expect(result.suggestion.destination).toEqual({ kind: 'single' })
    state.progress.practice!.round = null
    expect(learningOverview(state).suggestion.destination).toEqual({ kind: 'opening' })
    state.opening.active = null
    expect(learningOverview(state).suggestion.destination).toEqual({ kind: 'tactics' })
  })

  it('retains finished summaries but never lists a finished or empty round as pending', () => {
    const state = activeRounds()
    state.progress.practice!.round!.index = state.progress.practice!.round!.items.length
    state.tactics.round!.index = state.tactics.round!.items.length
    state.opening.active!.ply = openings[0].steps.length
    const result = learningOverview(state)
    expect(result.pendingRounds).toEqual([])
    expect(result.single.round?.finished).toBe(true)
    expect(result.opening.round?.finished).toBe(true)
    expect(result.tactics.round?.finished).toBe(true)
    state.progress.practice!.round!.items = []; state.progress.practice!.round!.index = 0
    state.tactics.round!.items = []; state.tactics.round!.index = 0
    expect(learningOverview(state).pendingRounds).toEqual([])
    expect(learningOverview(state).single.round).toBe(null)
    expect(learningOverview(state).tactics.round).toBe(null)
  })

  it('filters invalid and duplicate round references from totals, and refuses invalid current references', () => {
    const state = activeRounds(), round = state.progress.practice!.round!
    round.items.push({ ...round.items[0] }, { ...round.items[0], id: 'unknown' }, { ...round.items[0], version: 999 })
    expect(learningOverview(state).single.round?.total).toBe(5)
    round.items[0].id = 'unknown'
    state.tactics.round!.items[0].version = 99 as 1
    state.opening.active!.openingVersion++
    expect(learningOverview(state).pendingRounds).toEqual([])
  })

  it('ignores out of range round cursors and invalid opening sides', () => {
    const state = activeRounds()
    state.progress.practice!.round!.index = -1
    state.tactics.round!.index = 99
    state.opening.active!.side = 'green' as 'red'
    expect(learningOverview(state).pendingRounds).toEqual([])
  })

  it('recommends available pending errors single before tactics, with the actual unique count', () => {
    const state = input()
    state.progress.practice!.records[practiceExercises[0].id] = practicedRecord()
    state.tactics.records[0].review = 'pending'
    expect(learningOverview(state).suggestion).toMatchObject({ destination: { kind: 'single' }, reason: expect.stringContaining('1') })
    state.progress.practice!.records = {}
    expect(learningOverview(state).suggestion).toMatchObject({ destination: { kind: 'tactics' }, reason: expect.stringContaining('1') })
  })

  it('explicitly explains an unmastered unit whose every challenge variant has recorded assistance', () => {
    const state = input()
    state.progress.assistedVariants = units[0].variants.map(variant => variant.id)
    const suggestion = learningOverview(state).suggestion
    expect(suggestion.title).toContain('复习')
    expect(suggestion.reason).toContain('当前未见变式已用完')
    expect(suggestion.destination).toEqual({ kind: 'lesson', unitId: units[0].id })
  })

  it('after mastery recommends opening groups in directory then red/black order, before tactics', () => {
    const state = allMastered()
    state.opening.groups[0].completed = true
    const suggestion = learningOverview(state).suggestion
    expect(suggestion.destination).toEqual({ kind: 'opening' })
    expect(suggestion.reason).toContain(openings[0].title)
    expect(suggestion.reason).toContain('执黑')
    state.opening.groups = state.opening.groups.map(group => ({ ...group, completed: true }))
    expect(learningOverview(state).suggestion).toMatchObject({ destination: { kind: 'tactics' }, reason: expect.stringContaining(tactics[0].title) })
  })

  it('offers free review or current match when all catalogs are completed, without requiring milestones', () => {
    const state = completeCatalogs()
    expect(learningOverview(state).suggestion).toMatchObject({ destination: { kind: 'match' }, reason: expect.stringContaining('自由复习') })
    for (const chapter of learningOverview(state).course.chapters) {
      expect(chapter.destination).toEqual({ kind: 'lesson', unitId: curriculum.find(item => item.id === chapter.id)!.units[0].id })
    }
  })

  it('exposes blocked histories as unknown while allowing tagged temporary active rounds', () => {
    const state = activeRounds()
    state.openingBlocked = true; state.tacticsBlocked = true
    const result = learningOverview(state)
    expect(result.opening.history).toBe(null)
    expect(result.tactics.history).toBe(null)
    expect(result.opening.round?.temporary).toBe(true)
    expect(result.tactics.round?.temporary).toBe(true)
    expect(result.pendingRounds.slice(1).every(round => round.temporary)).toBe(true)
    state.progress.practice!.round = null
    expect(learningOverview(state).suggestion.destination.kind).toBe('opening')
    expect(learningOverview(state).suggestion.reason).toContain('临时练习')
  })

  it('does not recommend pending mistakes or incomplete items from blocked histories', () => {
    const state = allMastered()
    state.openingBlocked = true; state.tacticsBlocked = true
    state.tactics.records[0].review = 'pending'
    expect(learningOverview(state).suggestion.destination).toEqual({ kind: 'match' })
    state.tacticsBlocked = false
    expect(learningOverview(state).suggestion.destination).toEqual({ kind: 'tactics' })
    state.tactics.records[0].review = null
    expect(learningOverview(state).suggestion.destination).toEqual({ kind: 'tactics' })
  })

  it('is deterministic and leaves a deeply frozen input untouched', () => {
    const state = activeRounds(), before = JSON.stringify(state)
    freeze(state)
    expect(learningOverview(state)).toEqual(learningOverview(state))
    expect(JSON.stringify(state)).toBe(before)
  })
})
