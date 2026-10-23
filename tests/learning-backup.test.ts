import { describe, expect, it, vi } from 'vitest'
import { curriculum } from '../src/content/curriculum'
import { lessons } from '../src/content/lessons'
import { puzzles } from '../src/content/puzzles'
import { openings } from '../src/content/openings'
import { applyCoursePractice, backupModuleSummary, decodeLearningBackup, encodeLearningBackup, extractCoursePractice, MAX_LEARNING_BACKUP_BYTES, parseCoursePractice, type LearningBackup } from '../src/core/learning-backup'
import { defaultProgress } from '../src/core/storage'
import { defaultOpeningTraining, openingTrainingView, transitionOpeningTraining } from '../src/core/opening-training'
import { parseOpeningTraining } from '../src/core/opening-training-storage'
import { currentTactic, defaultTactics, transitionTactics } from '../src/core/tactics'
import { parseTactics } from '../src/core/tactics-storage'
import { learningOverview } from '../src/core/learning-overview'
import { checkLearningBytes } from '../src/core/learning-data-codec'

const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
function sample(): LearningBackup {
  return { format: 'yixiang-learning-backup', version: 1, exportedAt: '2026-10-22T00:00:00.000Z', modules: { coursePractice: extractCoursePractice(defaultProgress()), opening: defaultOpeningTraining(), tactics: defaultTactics() } }
}

describe('learning backup protocol', () => {
  it('roundtrips new, mixed and full current catalog data, with selected modules omitted', () => {
    const full = sample(), units = curriculum.flatMap(c => c.units)
    full.modules.coursePractice = { ...full.modules.coursePractice!, completedLessons: lessons.map(l => l.id), solvedPuzzles: puzzles.map(p => p.id), practicedUnits: units.map(u => u.id), masteredUnits: units.map(u => u.id), assistedVariants: units.flatMap(u => u.variants.map(v => v.id)), milestones: { firstMatch: true, independentMatch: true } }
    for (const value of [sample(), full, { ...sample(), modules: { opening: defaultOpeningTraining() } }, { ...sample(), modules: { coursePractice: { ...extractCoursePractice(defaultProgress()), completedLessons: [curriculum[0].id], practicedUnits: [units[0].id], assistedVariants: [units[0].variants[0].id] } } }]) {
      expect(decodeLearningBackup(encodeLearningBackup(value))).toEqual(value)
    }
    const raw = encodeLearningBackup({ ...sample(), modules: { tactics: defaultTactics() } })
    expect(raw).not.toMatch(/coursePractice|opening|session|collection|learningMatch/)
  })

  it('extracts exactly seven fields and preserves latest game, coach and collection identities when applying', () => {
    const progress = defaultProgress(), course = extractCoursePractice(progress)
    expect(Object.keys(course).sort()).toEqual(['completedLessons', 'solvedPuzzles', 'practicedUnits', 'masteredUnits', 'assistedVariants', 'milestones', 'practice'].sort())
    progress.learningMatch = { active: true, standardStart: true, coachEnabled: false, coachEverUsed: false, checkpointSeen: false }
    const updated = applyCoursePractice(progress, { ...course, milestones: { firstMatch: true, independentMatch: false } })
    expect(updated.session).toBe(progress.session)
    expect(updated.learningMatch).toBe(progress.learningMatch)
    expect(updated.collection).toBe(progress.collection)
    expect(progress.milestones.firstMatch).toBe(false)
    expect(updated.milestones.firstMatch).toBe(true)
    expect(extractCoursePractice({ ...progress, practice: undefined }).practice).toEqual(course.practice)
  })

  it.each([
    ['format', (d: any) => { d.format = 'yixiang-game' }],
    ['version', (d: any) => { d.version = 2 }],
    ['empty modules', (d: any) => { d.modules = {} }],
    ['null module', (d: any) => { d.modules.opening = null }],
    ['unknown module', (d: any) => { d.modules.session = {} }],
    ['unknown envelope field', (d: any) => { d.path = 'unexpected-backup-field' }],
    ['unknown course field', (d: any) => { d.modules.coursePractice.session = {} }],
    ['unknown lesson', (d: any) => { d.modules.coursePractice.completedLessons = ['unknown'] }],
    ['duplicate puzzle', (d: any) => { d.modules.coursePractice.solvedPuzzles = [puzzles[0].id, puzzles[0].id] }],
    ['unknown unit', (d: any) => { d.modules.coursePractice.practicedUnits = ['unknown'] }],
    ['unknown variant', (d: any) => { d.modules.coursePractice.assistedVariants = ['../private'] }],
    ['mastery outside practice', (d: any) => { d.modules.coursePractice.masteredUnits = [curriculum[0].units[0].id] }],
    ['independent without first match', (d: any) => { d.modules.coursePractice.milestones.independentMatch = true }],
    ['bad opening version', (d: any) => { d.modules.opening.groups[0].openingVersion = 2 }],
    ['duplicate opening', (d: any) => { d.modules.opening.groups[1] = d.modules.opening.groups[0] }],
    ['unknown tactics', (d: any) => { d.modules.tactics.records[0].id = 'unknown' }],
  ])('rejects %s as an entire file', (_label, mutate) => {
    const value = copy(sample()); mutate(value)
    expect(() => encodeLearningBackup(value)).toThrow(Error)
    expect(() => decodeLearningBackup(JSON.stringify(value))).toThrow(Error)
  })

  it.each(['2026-02-30T00:00:00.000Z', '2026-10-22', '2026-10-22T00:00:00+00:00', '2026-10-22T00:00:00.000', 'bad', 42])('rejects invalid/noncanonical UTC date %s', exportedAt => {
    expect(() => decodeLearningBackup(JSON.stringify({ ...sample(), exportedAt }))).toThrow()
  })

  it('checks exact total UTF8 size before JSON parsing, including multibyte input', () => {
    expect(MAX_LEARNING_BACKUP_BYTES).toBe(256 * 1024)
    const raw = encodeLearningBackup(sample()), size = new TextEncoder().encode(raw).length
    const exact = raw + ' '.repeat(MAX_LEARNING_BACKUP_BYTES - size)
    expect(decodeLearningBackup(exact)).toEqual(sample())
    expect(() => decodeLearningBackup(exact + ' ')).toThrow(/大小|容量|字节|上限/)
    const parse = vi.spyOn(JSON, 'parse')
    expect(() => decodeLearningBackup('字'.repeat(90000))).toThrow()
    expect(parse).not.toHaveBeenCalled(); parse.mockRestore()
  })

  it('rejects oversized modules whose structure is also invalid', () => {
    for (const [key, limit] of [['coursePractice', 128 * 1024], ['opening', 32 * 1024], ['tactics', 64 * 1024]] as const) {
      const data = sample() as any
      data.modules[key] = { padding: '字'.repeat(Math.ceil(limit / 3)) }
      expect(() => encodeLearningBackup(data)).toThrow()
      expect(() => decodeLearningBackup(JSON.stringify(data))).toThrow()
    }
  })

  it.each([32, 64, 128, 256])('checks the exact %i KiB UTF8 boundary independently of payload structure', kibibytes => {
    const maximum = kibibytes * 1024
    const count = Math.floor(maximum / 3)
    const exact = '字'.repeat(count) + ' '.repeat(maximum - count * 3)
    expect(exact.length).toBeLessThan(maximum)
    expect(new TextEncoder().encode(exact)).toHaveLength(maximum)
    expect(() => checkLearningBytes(exact, maximum)).not.toThrow()
    expect(() => checkLearningBytes(exact + ' ', maximum)).toThrow(/大小|字节|上限/)
    const excessMultibyte = '字'.repeat(count + 1)
    expect(excessMultibyte.length).toBeLessThan(maximum)
    expect(() => checkLearningBytes(excessMultibyte, maximum)).toThrow(/大小|字节|上限/)
  })

  it('rejects descriptor hooks, prototypes, sparse and extra array fields without executing code', () => {
    const hook = vi.fn(() => { throw Error('never execute') })
    const bad: unknown[] = [Object.assign(Object.create({}), sample()), { ...sample(), toJSON: hook }, Object.defineProperty(sample(), 'modules', { get: hook })]
    for (const raw of bad) expect(() => encodeLearningBackup(raw as LearningBackup)).toThrow()
    const sparse = sample(); delete (sparse.modules.opening!.groups as any)[0]
    expect(() => encodeLearningBackup(sparse)).toThrow()
    const extra = sample(); Object.assign(extra.modules.coursePractice!.practicedUnits, { extra: true })
    expect(() => encodeLearningBackup(extra)).toThrow()
    const inherited = sample(); Object.setPrototypeOf(inherited.modules.opening!.groups, {})
    expect(() => encodeLearningBackup(inherited)).toThrow()
    expect(hook).not.toHaveBeenCalled()
    expect(() => parseCoursePractice({ ...extractCoursePractice(defaultProgress()), milestones: Object.create({ firstMatch: true }) })).toThrow()
  })

  it('strictly roundtrips true opening help/reply/completion and tactics error/retry/reveal states', () => {
    let opening = transitionOpeningTraining(defaultOpeningTraining(), { type: 'start', openingId: openings[0].id, side: 'black' }).data
    while (!openingTrainingView(opening.active)!.complete) {
      const view = openingTrainingView(opening.active)!
      if (view.learnerTurn) {
        opening = transitionOpeningTraining(opening, { type: 'hint' }).data
        expect(parseOpeningTraining(opening)).toEqual(opening)
      }
      opening = transitionOpeningTraining(opening, view.learnerTurn ? { type: 'demonstrate' } : { type: 'reply' }).data
      expect(parseOpeningTraining(opening)).toEqual(opening)
    }
    let tactics = transitionTactics(defaultTactics(), { type: 'start', request: { mode: 'recommended' } }).data
    for (const action of [{ type: 'move', move: { from: { x: 8, y: 8 }, to: { x: 8, y: 7 } } }, { type: 'refutation' }, { type: 'retry' }, { type: 'answer' }] as const) {
      tactics = transitionTactics(tactics, action).data
      expect(parseTactics(tactics)).toEqual(tactics)
    }
    const backup = { ...sample(), modules: { opening, tactics } }
    expect(decodeLearningBackup(encodeLearningBackup(backup))).toEqual(backup)
    const forged = copy(tactics)
    forged.round!.items[0].path[0] = { from: { x: 8, y: 8 }, to: { x: 8, y: 7 } }
    expect(() => parseTactics(forged)).toThrow()
    const error = copy(tactics), rec = error.records.find(r => r.id === currentTactic(error)!.item.id)!
    rec.lastError!.move = currentTactic(transitionTactics(defaultTactics(), { type: 'start', request: { mode: 'recommended' } }).data)!.view.correctMoves[0]
    expect(() => parseTactics(error)).toThrow()
  })

  it('summarizes with the same truthful overview counts and never labels attempts as success', () => {
    const data = sample(), p = defaultProgress()
    p.practicedUnits = [curriculum[0].units[0].id]
    p.masteredUnits = [...p.practicedUnits]
    const overview = learningOverview({ progress: p, opening: data.modules.opening!, tactics: data.modules.tactics!, openingBlocked: false, tacticsBlocked: false })
    const lines = backupModuleSummary('coursePractice', extractCoursePractice(p)).join(' ')
    expect(lines).toContain(`掌握 ${overview.course.mastered}/${overview.course.total}`)
    expect(lines).toContain(`尝试 ${overview.single.attempted}/${overview.single.total}`)
    expect(backupModuleSummary('opening', data.modules.opening!).join(' ')).toContain('无辅助')
    expect(backupModuleSummary('tactics', data.modules.tactics!).join(' ')).toContain('独立')
  })
})
