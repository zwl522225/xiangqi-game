import { describe, expect, it } from 'vitest'
import { practiceExercises } from '../src/content/practice'
import type { MoveTask } from '../src/content/curriculum'
import {
  currentPractice, defaultPractice, nextPractice, normalizePractice, practiceDisplayGame,
  practiceFeedback, practiceGame, practiceSummary, retryPractice, showPracticeAnswer,
  showPracticeHint, skipPractice, startPractice, submitPractice,
} from '../src/core/practice'

const moveExercise = practiceExercises.find(exercise => exercise.id === 'practice-moves-rook-route')!
const moveTask = moveExercise.task as MoveTask
const answer = { kind: 'move' as const, move: moveTask.solutions[0] }
const illegal = { kind: 'move' as const, move: moveTask.blockedAttempt! }
const wrong = { kind: 'move' as const, move: { from: { x: 2, y: 7 }, to: { x: 3, y: 7 } } }
const start = () => startPractice(defaultPractice(), { mode: 'topic', topicId: 'moves' })
const atRook = () => {
  let data = start()
  while (currentPractice(data)?.exercise.id !== moveExercise.id) data = nextPractice(skipPractice(data))
  return data
}
const solve = (data: ReturnType<typeof start>) => {
  const task = currentPractice(data)!.exercise.task
  return submitPractice(data, task.kind === 'move' ? { kind: 'move', move: task.solutions[0] } : { kind: 'choice', optionId: task.correctOptionId })
}

describe('practice rounds', () => {
  it('selects bounded unique rounds in stable ID order, including empty mistakes', () => {
    const data = startPractice(defaultPractice(), { mode: 'recommended' })
    expect(data.round!.items.map(item => item.id)).toEqual(practiceExercises.map(item => item.id).sort().slice(0, 5))
    expect(new Set(data.round!.items.map(item => item.id)).size).toBe(5)
    expect(start().round!.items).toHaveLength(4)
    expect(startPractice(defaultPractice(), { mode: 'mistakes' }).round!.items).toEqual([])
    expect(currentPractice(startPractice(defaultPractice(), { mode: 'mistakes' }))).toBeNull()
  })
  it('recommends pending errors before linked unmastered units and other new tasks', () => {
    const errored = submitPractice(atRook(), illegal)
    const data = startPractice(errored, { mode: 'recommended' }, { practicedUnits: ['read-notation'], masteredUnits: [] })
    expect(data.round!.items[0].id).toBe(moveExercise.id)
    expect(data.round!.items.slice(1, 4).every(item => item.id.startsWith('practice-notation-') && item.id !== 'practice-notation-develop-horse')).toBe(true)
    expect(startPractice(errored, { mode: 'mistakes' }).round!.items.map(item => item.id)).toEqual([moveExercise.id])
    const mastered = startPractice(defaultPractice(), { mode: 'recommended' }, { practicedUnits: ['read-notation'], masteredUnits: ['read-notation'] })
    expect(mastered.round!.items.map(item => item.id)).toEqual(practiceExercises.map(item => item.id).sort().slice(0, 5))
  })
  it('places unattempted tasks before attempted tasks, then uses attempts and ID order', () => {
    const records = Object.fromEntries(practiceExercises.map((exercise, index) => [exercise.id, { version: 1, attempts: index + 1, errors: 0, review: null, lastError: null }]))
    const data = normalizePractice({ version: 1, records, round: null })
    expect(startPractice(data, { mode: 'recommended' }).round!.items.map(item => item.id)).toEqual(practiceExercises.slice(0, 5).map(item => item.id))
    delete records[moveExercise.id]
    expect(startPractice(normalizePractice({ ...data, records }), { mode: 'recommended' }).round!.items[0].id).toBe(moveExercise.id)
  })
  it('does not move or skip unanswered questions on repeated next calls', () => {
    const data = atRook()
    expect(nextPractice(data)).toBe(data)
    const next = nextPractice(solve(data))
    expect(nextPractice(next)).toBe(next)
  })
  it('distinguishes illegal and legal wrong submissions and retains the original board', () => {
    const data = atRook()
    const bad = submitPractice(data, illegal)
    expect(practiceFeedback(bad)?.status).toBe('illegal')
    expect(practiceFeedback(submitPractice(bad, wrong))?.status).toBe('not-goal')
    expect(practiceDisplayGame(bad)).toEqual(practiceGame(moveTask))
    expect(bad.records[moveExercise.id]).toMatchObject({ attempts: 1, errors: 1, review: 'pending', lastError: illegal })
    expect(submitPractice(bad, illegal)).toBe(bad)
  })
  it.each([null, {}, { kind: 'move', move: {} }, { kind: 'move', move: { from: { x: -1, y: 0 }, to: { x: 0, y: 0 } } }, { kind: 'move', move: { from: { x: 1.5, y: 0 }, to: { x: 0, y: 0 } } }, { kind: 'choice', optionId: 'bogus' }])('ignores malformed submissions without recording errors: %j', payload => {
    const data = atRook()
    expect(submitPractice(data, payload)).toBe(data)
  })
  it('accepts only existing choice options, preserves natural limit setup, and grades true choices', () => {
    let data = startPractice(defaultPractice(), { mode: 'topic', topicId: 'endgame' })
    while (currentPractice(data)?.exercise.id !== 'practice-endgame-natural-limit') data = nextPractice(skipPractice(data))
    expect(practiceDisplayGame(data)?.noCapturePlies).toBe(120)
    expect(submitPractice(data, { kind: 'choice', optionId: 'absent' })).toBe(data)
    const bad = submitPractice(data, { kind: 'choice', optionId: 'mate-loss' })
    expect(practiceFeedback(bad)?.status).toBe('not-goal')
    expect(practiceSummary(solve(bad)).assisted).toBe(1)
  })
  it('records independent success once and rejects further actions on a completed item', () => {
    const done = submitPractice(atRook(), answer)
    expect(practiceSummary(done).independent).toBe(1)
    expect(practiceDisplayGame(done)?.board[7][6]?.type).toBe('rook')
    for (const action of [retryPractice, showPracticeHint, showPracticeAnswer, skipPractice]) expect(action(done)).toBe(done)
    expect(submitPractice(done, illegal)).toBe(done)
    expect(done.records[moveExercise.id].attempts).toBe(1)
  })
  it('keeps an unhinted correction assisted and pending through reload', () => {
    const wrongFirst = normalizePractice(JSON.parse(JSON.stringify(submitPractice(atRook(), wrong))))
    const done = submitPractice(wrongFirst, answer)
    expect(practiceSummary(done).assisted).toBe(1)
    expect(done.records[moveExercise.id]).toMatchObject({ attempts: 2, errors: 1, review: 'pending', lastError: wrong })
    expect(normalizePractice(done)).toEqual(done)
  })
  it.each([retryPractice, showPracticeHint, showPracticeAnswer])('keeps help sticky through retry and reload', help => {
    const helped = retryPractice(help(atRook()))
    const restored = normalizePractice(JSON.parse(JSON.stringify(helped)))
    expect(practiceSummary(submitPractice(restored, answer)).assisted).toBe(1)
    expect(practiceSummary(submitPractice(restored, answer)).independent).toBe(0)
  })
  it('caps hints at three, retains error evidence through retry, and clears pending only on a new independent round', () => {
    const errored = submitPractice(atRook(), illegal)
    const helped = showPracticeHint(showPracticeHint(showPracticeHint(showPracticeHint(errored))))
    expect(currentPractice(helped)!.item.hints).toBe(3)
    const retried = retryPractice(helped)
    expect(practiceFeedback(retried)).toBeNull()
    const done = submitPractice(retried, answer)
    expect(done.records[moveExercise.id].review).toBe('pending')
    expect(done.records[moveExercise.id].errors).toBe(1)
    const reviewed = solve(startPractice(done, { mode: 'mistakes' }))
    expect(reviewed.records[moveExercise.id].review).toBe('reviewed')
    expect(practiceSummary(reviewed).independent).toBe(1)
    const again = submitPractice(startPractice(reviewed, { mode: 'topic', topicId: 'moves' }), illegal)
    // The next round begins at another stable ID; explicitly return to the rook.
    let rook = again
    while (currentPractice(rook)?.exercise.id !== moveExercise.id) rook = nextPractice(skipPractice(rook))
    expect(submitPractice(rook, illegal).records[moveExercise.id].review).toBe('pending')
  })
  it('skips once and summarizes exactly one mutually exclusive outcome per finished item', () => {
    let data = start()
    data = nextPractice(solve(data))
    data = nextPractice(solve(showPracticeHint(data)))
    data = nextPractice(skipPractice(data))
    const skipped = skipPractice(data)
    expect(skipPractice(skipped)).toBe(skipped)
    data = nextPractice(skipped)
    expect(practiceSummary(data)).toMatchObject({ independent: 1, assisted: 1, skipped: 2, completed: 4, total: 4, finished: true })
  })
})

describe('practice normalization', () => {
  it('rejects a truncated topic round instead of presenting it as the full four-question topic', () => {
    const raw = JSON.parse(JSON.stringify(start()))
    raw.round.items = raw.round.items.slice(0, 2)
    expect(normalizePractice(raw).round).toBeNull()
  })
  it('round trips valid active, helped, error, success, skipped and finished states idempotently', () => {
    for (const data of [defaultPractice(), atRook(), showPracticeAnswer(atRook()), submitPractice(atRook(), illegal), submitPractice(atRook(), answer), skipPractice(atRook()), startPractice(defaultPractice(), { mode: 'mistakes' })]) {
      const normalized = normalizePractice(JSON.parse(JSON.stringify(data)))
      expect(normalized).toEqual(data)
      expect(normalizePractice(normalized)).toEqual(normalized)
    }
  })
  it('drops unknown record IDs and invalid last errors while keeping valid aggregates', () => {
    const data = submitPractice(atRook(), illegal)
    const raw = JSON.parse(JSON.stringify(data))
    raw.records.unknown = raw.records[moveExercise.id]
    raw.records[moveExercise.id].lastError = answer
    const fixed = normalizePractice(raw)
    expect(fixed.records.unknown).toBeUndefined()
    expect(fixed.records[moveExercise.id]).toMatchObject({ attempts: 1, errors: 1, review: null, lastError: null })
    expect(normalizePractice(fixed)).toEqual(fixed)
  })
  it('requires a real independent success payload before a saved mistake can be called reviewed', () => {
    const data = submitPractice(atRook(), illegal)
    const raw = JSON.parse(JSON.stringify(data))
    raw.records[moveExercise.id].review = 'reviewed'
    expect(normalizePractice(raw).records[moveExercise.id].review).toBe('pending')
    const reviewed = solve(startPractice(data, { mode: 'mistakes' }))
    expect(normalizePractice(reviewed)).toEqual(reviewed)
    const corrupt = JSON.parse(JSON.stringify(reviewed))
    corrupt.records[moveExercise.id].reviewEvidence.submission = illegal
    expect(normalizePractice(corrupt).records[moveExercise.id].review).toBe('pending')
    corrupt.records[moveExercise.id].reviewEvidence.submission = answer
    corrupt.records[moveExercise.id].reviewEvidence.helpUsed = true
    expect(normalizePractice(corrupt).records[moveExercise.id].review).toBe('pending')
  })
  it.each([
    (raw: any) => { raw.round.items[0].id = 'unknown' },
    (raw: any) => { raw.round.items[0].version = 2 },
    (raw: any) => { raw.round.items.push(raw.round.items[0]) },
    (raw: any) => { raw.round.items = raw.round.items.slice(0, 2); raw.round.index = 0 },
    (raw: any) => { raw.round.items = Array.from({ length: 6 }, () => raw.round.items[0]) },
    (raw: any) => { raw.round.index = 99 },
    (raw: any) => { raw.round.index = 1 },
  ])('drops invalid active rounds without damaging valid records', corrupt => {
    const data = submitPractice(atRook(), illegal)
    const raw = JSON.parse(JSON.stringify(data))
    corrupt(raw)
    const fixed = normalizePractice(raw)
    expect(fixed.round).toBeNull()
    expect(fixed.records).toEqual(data.records)
  })
  it('regrades saved submissions and never accepts fake success or stale captions', () => {
    const raw = JSON.parse(JSON.stringify(submitPractice(atRook(), illegal)))
    const item = raw.round.items[raw.round.index]
    item.result = 'independent'
    item.message = '成功'
    item.status = 'success'
    const fixed = normalizePractice(raw)
    expect(currentPractice(fixed)!.item.result).toBeNull()
    expect(practiceFeedback(fixed)?.status).toBe('illegal')
    item.submission = { kind: 'move', move: { from: null } }
    const malformed = normalizePractice(raw)
    expect(practiceFeedback(malformed)).toBeNull()
    expect(currentPractice(malformed)!.item.result).toBeNull()
  })
  it('reconstructs a successful display from its real payload even with a damaged visibility flag', () => {
    const raw = JSON.parse(JSON.stringify(submitPractice(atRook(), answer)))
    raw.round.items[raw.round.index].feedbackVisible = false
    const fixed = normalizePractice(raw)
    expect(practiceFeedback(fixed)?.status).toBe('success')
    expect(practiceDisplayGame(fixed)?.board[7][6]?.type).toBe('rook')
    expect(normalizePractice(fixed)).toEqual(fixed)
  })
})
