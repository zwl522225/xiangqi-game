import { practiceExercises, practiceTopics } from '../content/practice'
import type { PracticeExercise, PracticeTopicId } from '../content/practice'
import type { LessonTask } from '../content/curriculum'
import { gradeChoiceTask, gradeMoveTask } from './lesson-goals'
import { createGame } from './rules'
import type { Game } from './rules'
import type { Move } from './types'

export type PracticeSubmission = { kind: 'move'; move: Move } | { kind: 'choice'; optionId: string }
export type PracticeResult = 'independent' | 'assisted' | 'skipped'
export type PracticeFeedback = { status: 'illegal' | 'not-goal' | 'success'; message: string; game?: Game }
export type PracticeReviewEvidence = {
  submission: PracticeSubmission
  hints: 0
  answerShown: false
  hadError: false
  helpUsed: false
}
export type PracticeRecord = {
  version: number
  attempts: number
  errors: number
  review: 'pending' | 'reviewed' | null
  lastError: PracticeSubmission | null
  reviewEvidence: PracticeReviewEvidence | null
}
export type PracticeItem = {
  id: string
  version: number
  hints: number
  answerShown: boolean
  hadError: boolean
  helpUsed: boolean
  submission: PracticeSubmission | null
  feedbackVisible: boolean
  result: PracticeResult | null
}
export type PracticeRequest = { mode: 'recommended' | 'mistakes' } | { mode: 'topic'; topicId: PracticeTopicId }
export type PracticeRound = {
  mode: PracticeRequest['mode']
  topicId: PracticeTopicId | null
  items: PracticeItem[]
  // items.length means the summary screen; next never crosses an unanswered item.
  index: number
}
export type PracticeData = { version: 1; records: Record<string, PracticeRecord>; round: PracticeRound | null }
export type PracticeContext = { readonly practicedUnits: readonly string[]; readonly masteredUnits: readonly string[] }

const exercises = new Map(practiceExercises.map(exercise => [exercise.id, exercise]))
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const natural = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const position = (value: unknown): boolean => object(value) && natural(value.x) && value.x <= 8 && natural(value.y) && value.y <= 9
const byId = (a: PracticeExercise, b: PracticeExercise) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0

export function defaultPractice(): PracticeData {
  return { version: 1, records: {}, round: null }
}

export function practiceGame(task: LessonTask): Game {
  return { ...createGame(task.board, task.turn), noCapturePlies: task.noCapturePlies ?? 0 }
}

// A canonical payload also keeps malformed coordinates away from the rules engine.
function submissionFor(task: LessonTask, value: unknown): PracticeSubmission | null {
  if (!object(value)) return null
  if (task.kind === 'move' && value.kind === 'move' && object(value.move) && position(value.move.from) && position(value.move.to)) {
    const move = value.move as Move
    return { kind: 'move', move: { from: { x: move.from.x, y: move.from.y }, to: { x: move.to.x, y: move.to.y } } }
  }
  if (task.kind === 'choice' && value.kind === 'choice' && typeof value.optionId === 'string' && task.options.some(option => option.id === value.optionId)) {
    return { kind: 'choice', optionId: value.optionId }
  }
  return null
}

function grade(task: LessonTask, submission: PracticeSubmission): PracticeFeedback {
  if (task.kind === 'move' && submission.kind === 'move') return gradeMoveTask(task, practiceGame(task), submission.move)
  if (task.kind === 'choice' && submission.kind === 'choice') return gradeChoiceTask(task, submission.optionId)
  throw new Error('Submission does not match the practice task')
}

function blankItem(exercise: PracticeExercise): PracticeItem {
  return { id: exercise.id, version: exercise.version, hints: 0, answerShown: false, hadError: false, helpUsed: false, submission: null, feedbackVisible: false, result: null }
}

export function currentPractice(data: PracticeData): { exercise: PracticeExercise; item: PracticeItem; index: number; total: number } | null {
  const round = data.round
  const item = round?.items[round.index]
  const exercise = item && exercises.get(item.id)
  return round && item && exercise && exercise.version === item.version ? { exercise, item, index: round.index, total: round.items.length } : null
}

export function practiceFeedback(data: PracticeData): PracticeFeedback | null {
  const current = currentPractice(data)
  return current?.item.feedbackVisible && current.item.submission ? grade(current.exercise.task, current.item.submission) : null
}

export function practiceDisplayGame(data: PracticeData): Game | null {
  const current = currentPractice(data)
  if (!current) return null
  const feedback = practiceFeedback(data)
  return feedback?.status === 'success' && feedback.game ? feedback.game : practiceGame(current.exercise.task)
}

export function startPractice(data: PracticeData, request: PracticeRequest, context: PracticeContext = { practicedUnits: [], masteredUnits: [] }): PracticeData {
  let selected = [...practiceExercises]
  if (request.mode === 'topic') selected = selected.filter(exercise => exercise.topicId === request.topicId).sort(byId)
  else {
    const rank = (exercise: PracticeExercise): number => {
      const record = data.records[exercise.id]
      if (record?.review === 'pending') return 0
      if (!record?.attempts && context.practicedUnits.includes(exercise.unitId) && !context.masteredUnits.includes(exercise.unitId)) return 1
      return record?.attempts ? 3 : 2
    }
    if (request.mode === 'mistakes') selected = selected.filter(exercise => data.records[exercise.id]?.review === 'pending')
    selected.sort((a, b) => rank(a) - rank(b) || (rank(a) === 3 ? (data.records[a.id]?.attempts ?? 0) - (data.records[b.id]?.attempts ?? 0) : 0) || byId(a, b))
  }
  return { ...data, round: { mode: request.mode, topicId: request.mode === 'topic' ? request.topicId : null, items: selected.slice(0, 5).map(blankItem), index: 0 } }
}

function replaceItem(data: PracticeData, item: PracticeItem): PracticeData {
  const round = data.round!
  return { ...data, round: { ...round, items: round.items.map((previous, index) => index === round.index ? item : previous) } }
}

export function submitPractice(data: PracticeData, payload: unknown): PracticeData {
  const current = currentPractice(data)
  if (!current || current.item.result) return data
  const submission = submissionFor(current.exercise.task, payload)
  if (!submission) return data
  const item = current.item
  if (JSON.stringify(item.submission) === JSON.stringify(submission)) {
    return item.feedbackVisible ? data : replaceItem(data, { ...item, feedbackVisible: true })
  }
  const feedback = grade(current.exercise.task, submission)
  const success = feedback.status === 'success'
  const result = success ? item.hadError || item.helpUsed ? 'assisted' : 'independent' : null
  const previous = data.records[item.id] ?? { version: item.version, attempts: 0, errors: 0, review: null, lastError: null, reviewEvidence: null }
  const record: PracticeRecord = {
    ...previous, attempts: Math.min(Number.MAX_SAFE_INTEGER, previous.attempts + 1),
    errors: Math.min(Number.MAX_SAFE_INTEGER, previous.errors + (success ? 0 : 1)),
    review: success ? result === 'independent' && previous.lastError ? 'reviewed' : previous.review : 'pending',
    lastError: success ? previous.lastError : submission,
    reviewEvidence: !success ? null : result === 'independent' && previous.lastError ? { submission, hints: 0, answerShown: false, hadError: false, helpUsed: false } : previous.reviewEvidence,
  }
  const updated = replaceItem(data, { ...item, submission, feedbackVisible: true, hadError: item.hadError || !success, result })
  return { ...updated, records: { ...data.records, [item.id]: record } }
}

export function showPracticeHint(data: PracticeData): PracticeData {
  const current = currentPractice(data)
  if (!current || current.item.result || current.item.hints >= 3) return data
  return replaceItem(data, { ...current.item, hints: current.item.hints + 1, helpUsed: true })
}

export function showPracticeAnswer(data: PracticeData): PracticeData {
  const current = currentPractice(data)
  if (!current || current.item.result || current.item.answerShown) return data
  return replaceItem(data, { ...current.item, answerShown: true, helpUsed: true })
}

export function retryPractice(data: PracticeData): PracticeData {
  const current = currentPractice(data)
  if (!current || current.item.result || (current.item.helpUsed && !current.item.feedbackVisible)) return data
  return replaceItem(data, { ...current.item, helpUsed: true, feedbackVisible: false })
}

export function skipPractice(data: PracticeData): PracticeData {
  const current = currentPractice(data)
  if (!current || current.item.result) return data
  return replaceItem(data, { ...current.item, result: 'skipped' })
}

export function nextPractice(data: PracticeData): PracticeData {
  const current = currentPractice(data)
  if (!current?.item.result) return data
  return { ...data, round: { ...data.round!, index: data.round!.index + 1 } }
}

export function practiceSummary(data: PracticeData) {
  const items = data.round?.items ?? []
  const independent = items.filter(item => item.result === 'independent').length
  const assisted = items.filter(item => item.result === 'assisted').length
  const skipped = items.filter(item => item.result === 'skipped').length
  return { independent, assisted, skipped, completed: independent + assisted + skipped, total: items.length, finished: Boolean(data.round && data.round.index === items.length) }
}

function normalizeItem(value: unknown): PracticeItem | null {
  if (!object(value) || typeof value.id !== 'string') return null
  const exercise = exercises.get(value.id)
  if (!exercise || value.version !== exercise.version || !natural(value.hints) || value.hints > 3 ||
    typeof value.answerShown !== 'boolean' || typeof value.hadError !== 'boolean' || typeof value.helpUsed !== 'boolean' || typeof value.feedbackVisible !== 'boolean') return null
  const submission = submissionFor(exercise.task, value.submission)
  const feedback = submission ? grade(exercise.task, submission) : null
  const hadError = value.hadError || Boolean(feedback && feedback.status !== 'success')
  const helpUsed = value.helpUsed || value.hints > 0 || value.answerShown
  // Captions and saved success flags cannot establish completion without a correct payload.
  const result: PracticeResult | null = feedback?.status === 'success' ? hadError || helpUsed ? 'assisted' : 'independent' : value.result === 'skipped' ? 'skipped' : null
  return { id: exercise.id, version: exercise.version, hints: value.hints, answerShown: value.answerShown, hadError, helpUsed, submission, feedbackVisible: Boolean(submission && (value.feedbackVisible || feedback?.status === 'success')), result }
}

function normalizeRound(value: unknown): PracticeRound | null {
  if (!object(value) || !['recommended', 'topic', 'mistakes'].includes(value.mode as string) ||
    !Array.isArray(value.items) || value.items.length > 5 || !natural(value.index) || value.index > value.items.length) return null
  const topicId = value.mode === 'topic' ? practiceTopics.find(topic => topic.id === value.topicId)?.id : null
  if (value.mode === 'topic' && (!topicId || value.items.length !== practiceExercises.filter(exercise => exercise.topicId === topicId).length)) return null
  const items = value.items.map(normalizeItem)
  if (items.some(item => item === null)) return null
  const valid = items as PracticeItem[]
  if (new Set(valid.map(item => item.id)).size !== valid.length ||
    valid.some((item, index) => (topicId && exercises.get(item.id)!.topicId !== topicId) ||
      (index < Number(value.index) && !item.result) ||
      (index > Number(value.index) && (item.submission || item.result || item.hints || item.answerShown || item.hadError || item.helpUsed)))) return null
  return { mode: value.mode as PracticeRound['mode'], topicId: topicId ?? null, items: valid, index: value.index }
}

/** Load boundary only. Runtime actions preserve no-op references and never write storage. */
export function normalizePractice(value: unknown): PracticeData {
  if (!object(value) || value.version !== 1) return defaultPractice()
  const records: Record<string, PracticeRecord> = {}
  if (object(value.records)) {
    for (const exercise of practiceExercises) {
      const record = value.records[exercise.id]
      if (!object(record) || record.version !== exercise.version || !natural(record.attempts) || !natural(record.errors) || record.errors > record.attempts) continue
      const candidate = submissionFor(exercise.task, record.lastError)
      const lastError = candidate && grade(exercise.task, candidate).status !== 'success' && record.errors > 0 ? candidate : null
      const savedEvidence = record.reviewEvidence
      const reviewedSubmission = object(savedEvidence) ? submissionFor(exercise.task, savedEvidence.submission) : null
      const reviewEvidence: PracticeReviewEvidence | null = lastError && record.review === 'reviewed' && object(savedEvidence) &&
        savedEvidence.hints === 0 && savedEvidence.answerShown === false && savedEvidence.hadError === false && savedEvidence.helpUsed === false &&
        reviewedSubmission && grade(exercise.task, reviewedSubmission).status === 'success' ?
          { submission: reviewedSubmission, hints: 0, answerShown: false, hadError: false, helpUsed: false } : null
      const review = lastError ? reviewEvidence ? 'reviewed' : 'pending' : null
      records[exercise.id] = { version: exercise.version, attempts: record.attempts, errors: record.errors, review, lastError, reviewEvidence }
    }
  }
  return { version: 1, records, round: normalizeRound(value.round) }
}
