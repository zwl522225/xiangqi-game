import { describe, expect, it, vi } from 'vitest'
import { practiceExercises } from '../src/content/practice'
import { parsePracticeStrict } from '../src/core/practice-codec'
import { currentPractice, defaultPractice, nextPractice, retryPractice, showPracticeAnswer, showPracticeHint, skipPractice, startPractice, submitPractice, type PracticeData } from '../src/core/practice'

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const start = () => startPractice(defaultPractice(), { mode: 'topic', topicId: 'moves' })
function solve(data: PracticeData) {
  const task = currentPractice(data)!.exercise.task
  return submitPractice(data, task.kind === 'move' ? { kind: 'move', move: task.solutions[0] } : { kind: 'choice', optionId: task.correctOptionId })
}
function wrong(data: PracticeData) {
  const task = currentPractice(data)!.exercise.task
  return submitPractice(data, task.kind === 'move' ? { kind: 'move', move: task.blockedAttempt ?? { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } } : { kind: 'choice', optionId: task.options.find(o => o.id !== task.correctOptionId)!.id })
}

describe('strict practice backup codec', () => {
  it('roundtrips actual transitions for every topic, including assisted, hidden feedback, skipped errors and reviewed history', () => {
    const check = (data: PracticeData) => expect(parsePracticeStrict(data)).toEqual(data)
    check(defaultPractice())
    check(startPractice(defaultPractice(), { mode: 'mistakes' }))
    check(startPractice(defaultPractice(), { mode: 'recommended' }, { practicedUnits: ['read-notation'], masteredUnits: [] }))
    for (const topicId of ['moves', 'capture', 'check', 'endgame', 'notation'] as const) {
      let data = startPractice(defaultPractice(), { mode: 'topic', topicId }); check(data)
      while (currentPractice(data)) {
        for (const variant of [showPracticeHint(data), showPracticeAnswer(data), retryPractice(data), wrong(data), retryPractice(wrong(data)), skipPractice(wrong(data)), solve(data), solve(wrong(data)), solve(showPracticeAnswer(data)), skipPractice(retryPractice(wrong(data)))]) check(variant)
        data = nextPractice(solve(wrong(data))); check(data)
      }
      data = startPractice(data, { mode: 'mistakes' }); check(data)
      while (currentPractice(data)) { data = nextPractice(solve(data)); check(data) }
      // A new helped/unfinished attempt can retain earlier independent review evidence.
      data = startPractice(data, { mode: 'topic', topicId }); check(data)
      check(showPracticeHint(data)); check(solve(showPracticeHint(data)))
    }
  })

  it.each([
    ['unknown envelope key', (d: any) => { d.extra = true }],
    ['unsupported format', (d: any) => { d.version = 2 }],
    ['unknown record', (d: any) => { d.records.unknown = Object.values(d.records)[0] }],
    ['stale record', (d: any) => { Object.values<any>(d.records)[0].version = 2 }],
    ['unsafe counter', (d: any) => { Object.values<any>(d.records)[0].attempts = Number.MAX_SAFE_INTEGER + 1 }],
    ['fraction counter', (d: any) => { Object.values<any>(d.records)[0].errors = 0.5 }],
    ['counter relationship', (d: any) => { Object.values<any>(d.records)[0].attempts = 0 }],
    ['fake reviewed', (d: any) => { Object.values<any>(d.records)[0].review = 'reviewed' }],
    ['fake last error', (d: any) => { const t = currentPractice(start())!.exercise.task; Object.values<any>(d.records)[0].lastError = { kind: 'move', move: t.kind === 'move' ? t.solutions[0] : null } }],
    ['record unknown field', (d: any) => { Object.values<any>(d.records)[0].board = [] }],
    ['unknown item', (d: any) => { d.round.items[0].id = '../private' }],
    ['stale item', (d: any) => { d.round.items[0].version = 2 }],
    ['duplicate item', (d: any) => { d.round.items[1] = d.round.items[0] }],
    ['truncated topic', (d: any) => { d.round.items.pop() }],
    ['reordered topic', (d: any) => { d.round.items.reverse() }],
    ['advanced unanswered', (d: any) => { d.round.index = 2 }],
    ['future item used', (d: any) => { d.round.items[1].feedbackVisible = true }],
    ['fake success', (d: any) => { d.round.items[0].result = 'independent' }],
    ['error flag removed', (d: any) => { d.round.items[0].hadError = false }],
    ['extra coordinate', (d: any) => { d.round.items[0].submission.move.from.z = 1 }],
    ['bad coordinate', (d: any) => { d.round.items[0].submission.move.from.x = 9 }],
    ['hidden feedback without retry', (d: any) => { d.round.items[0].feedbackVisible = false }],
    ['hint without help', (d: any) => { d.round.items[0].hints = 1 }],
    ['reveal without help', (d: any) => { d.round.items[0].answerShown = true }],
    ['null topic on topic round', (d: any) => { d.round.topicId = null }],
    ['topic on mistakes round', (d: any) => { d.round.mode = 'mistakes' }],
  ])('rejects %s without permissive repair', (_name, mutate) => {
    const data = copy(wrong(start())); mutate(data)
    expect(() => parsePracticeStrict(data)).toThrow(Error)
  })

  it('requires genuine clean independent evidence for reviewed errors', () => {
    const reviewed = solve(startPractice(wrong(start()), { mode: 'mistakes' }))
    expect(parsePracticeStrict(reviewed)).toEqual(reviewed)
    for (const field of ['hints', 'answerShown', 'hadError', 'helpUsed']) {
      const raw = copy(reviewed), evidence = Object.values(raw.records)[0].reviewEvidence! as any
      evidence[field] = field === 'hints' ? 1 : true
      expect(() => parsePracticeStrict(raw)).toThrow()
    }
    const bad = copy(reviewed)
    Object.values(bad.records)[0].reviewEvidence!.submission = Object.values(bad.records)[0].lastError!
    expect(() => parsePracticeStrict(bad)).toThrow()
  })

  it('uses only own plain data descriptors across all branches without invoking hooks', () => {
    const hook = vi.fn(() => { throw Error('must never execute') })
    for (const value of [Object.assign(Object.create({}), defaultPractice()), { ...defaultPractice(), toJSON: hook }, Object.defineProperty(defaultPractice(), 'records', { get: hook }), { ...defaultPractice(), records: Object.create({ inherited: true }) }]) expect(() => parsePracticeStrict(value)).toThrow()
    const sparse = start(); delete (sparse.round!.items as any)[0]
    expect(() => parsePracticeStrict(sparse)).toThrow()
    const extra = start(); Object.assign(extra.round!.items, { extra: true })
    expect(() => parsePracticeStrict(extra)).toThrow()
    expect(hook).not.toHaveBeenCalled()
  })

  it('allows all twenty actual exercise records and safe saturated counters', () => {
    let data = defaultPractice()
    for (const topicId of ['moves', 'capture', 'check', 'endgame', 'notation'] as const) {
      data = startPractice(data, { mode: 'topic', topicId })
      while (currentPractice(data)) data = nextPractice(solve(data))
    }
    expect(Object.keys(data.records)).toHaveLength(practiceExercises.length)
    Object.values(data.records)[0].attempts = Number.MAX_SAFE_INTEGER
    expect(parsePracticeStrict(data)).toEqual(data)
  })

  it('preserves actual independent review when both aggregate counters have saturated', () => {
    const errored = wrong(start())
    const rec = Object.values(errored.records)[0]
    rec.attempts = Number.MAX_SAFE_INTEGER
    rec.errors = Number.MAX_SAFE_INTEGER
    const reviewed = solve(startPractice(errored, { mode: 'mistakes' }))
    expect(Object.values(reviewed.records)[0].review).toBe('reviewed')
    expect(parsePracticeStrict(reviewed)).toEqual(reviewed)
  })

  it('rejects an independent current success whose latest review evidence names a different correct move', () => {
    let data = startPractice(defaultPractice(), { mode: 'topic', topicId: 'check' })
    while (currentPractice(data)!.exercise.id !== 'practice-check-horse-attack') data = nextPractice(skipPractice(data))
    data = solve(startPractice(wrong(data), { mode: 'mistakes' }))
    const task = currentPractice(data)!.exercise.task
    if (task.kind !== 'move') throw Error('fixture must be move')
    Object.values(data.records)[0].reviewEvidence!.submission = { kind: 'move', move: task.solutions[1] }
    expect(() => parsePracticeStrict(data)).toThrow()
  })

  it('rejects a reversed unanswered recommendation that no original context can select', () => {
    const data = startPractice(defaultPractice(), { mode: 'recommended' })
    data.round!.items.reverse()
    expect(() => parsePracticeStrict(data)).toThrow()
  })

  it('requires the first five initial pending mistakes rather than any ascending five', () => {
    let data = defaultPractice()
    for (const topicId of ['moves', 'capture'] as const) {
      data = startPractice(data, { mode: 'topic', topicId })
      while (currentPractice(data)) data = nextPractice(skipPractice(wrong(data)))
    }
    data = startPractice(data, { mode: 'mistakes' })
    expect(data.round!.items[4].id).toBe('practice-moves-elephant-eye')
    data.round!.items[4].id = 'practice-moves-horse-leg'
    expect(() => parsePracticeStrict(data)).toThrow()
  })

  it('keeps custom-context recommendations through blank hints/skips and later answered context changes', () => {
    const context: { practicedUnits: string[]; masteredUnits: string[] } = { practicedUnits: ['read-notation'], masteredUnits: [] }
    let data = startPractice(defaultPractice(), { mode: 'recommended' }, context)
    const selected = data.round!.items.map(item => item.id)
    expect(selected).not.toEqual(startPractice(defaultPractice(), { mode: 'recommended' }).round!.items.map(item => item.id))
    data = showPracticeHint(data)
    expect(parsePracticeStrict(data)).toEqual(data)
    data = nextPractice(skipPractice(data))
    expect(parsePracticeStrict(data)).toEqual(data)
    data = showPracticeAnswer(retryPractice(data))
    expect(parsePracticeStrict(data)).toEqual(data)
    data = nextPractice(solve(data))
    // This context may change in the course while the old recommendation stays active.
    context.practicedUnits = ['rook']
    context.masteredUnits = ['rook']
    expect(parsePracticeStrict(data)).toEqual(data)
    expect(data.round!.items.map(item => item.id)).toEqual(selected)
    while (currentPractice(data)) data = nextPractice(skipPractice(data))
    expect(parsePracticeStrict(data)).toEqual(data)
  })

})
