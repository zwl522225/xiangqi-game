import { practiceExercises, practiceTopics, type PracticeExercise } from '../content/practice'
import { gradeChoiceTask, gradeMoveTask } from './lesson-goals'
import { practiceGame, startPractice, type PracticeData, type PracticeItem, type PracticeRecord, type PracticeReviewEvidence, type PracticeRound, type PracticeSubmission } from './practice'
import { dataArray, dataBoolean, dataInteger, dataObject, rejectLearningData } from './learning-data-codec'

const itemFields = ['id', 'version', 'hints', 'answerShown', 'hadError', 'helpUsed', 'submission', 'feedbackVisible', 'result']
const recordFields = ['version', 'attempts', 'errors', 'review', 'lastError', 'reviewEvidence']
const exercises = new Map(practiceExercises.map(exercise => [exercise.id, exercise]))
const reject = () => rejectLearningData('单步练习字段、提交或复习证据不一致')

function submission(value: unknown, exercise: PracticeExercise): PracticeSubmission {
  const task = exercise.task
  if (task.kind === 'choice') {
    const raw = dataObject(value, ['kind', 'optionId'])
    if (raw.kind !== 'choice' || typeof raw.optionId !== 'string' || !task.options.some(option => option.id === raw.optionId)) reject()
    return { kind: 'choice', optionId: raw.optionId as string }
  }
  const raw = dataObject(value, ['kind', 'move'])
  if (raw.kind !== 'move') reject()
  const move = dataObject(raw.move, ['from', 'to'])
  const position = (value: unknown) => {
    const raw = dataObject(value, ['x', 'y'])
    return { x: dataInteger(raw.x, 8), y: dataInteger(raw.y, 9) }
  }
  return { kind: 'move', move: { from: position(move.from), to: position(move.to) } }
}

function success(exercise: PracticeExercise, value: PracticeSubmission): boolean {
  const task = exercise.task
  if (task.kind === 'move' && value.kind === 'move') return gradeMoveTask(task, practiceGame(task), value.move).status === 'success'
  if (task.kind === 'choice' && value.kind === 'choice') return gradeChoiceTask(task, value.optionId).status === 'success'
  return false
}

function record(value: unknown, exercise: PracticeExercise): PracticeRecord {
  const raw = dataObject(value, recordFields)
  if (raw.version !== exercise.version || (raw.review !== null && raw.review !== 'pending' && raw.review !== 'reviewed')) reject()
  const attempts = dataInteger(raw.attempts), errors = dataInteger(raw.errors)
  if (!attempts || errors > attempts) reject()
  const lastError = raw.lastError === null ? null : submission(raw.lastError, exercise)
  if (lastError && success(exercise, lastError)) reject()
  let reviewEvidence: PracticeReviewEvidence | null = null
  if (raw.reviewEvidence !== null) {
    const evidence = dataObject(raw.reviewEvidence, ['submission', 'hints', 'answerShown', 'hadError', 'helpUsed'])
    const answer = submission(evidence.submission, exercise)
    if (evidence.hints !== 0 || evidence.answerShown !== false || evidence.hadError !== false || evidence.helpUsed !== false || !success(exercise, answer)) reject()
    reviewEvidence = { submission: answer, hints: 0, answerShown: false, hadError: false, helpUsed: false }
  }
  if (errors === 0 ? lastError !== null || raw.review !== null || reviewEvidence !== null : lastError === null || raw.review === null) reject()
  // Runtime counters saturate independently, so a genuine later success need
  // not make attempts exceed errors once both reach MAX_SAFE_INTEGER.
  if (raw.review === 'reviewed' ? reviewEvidence === null || (attempts <= errors && attempts !== Number.MAX_SAFE_INTEGER) : reviewEvidence !== null) reject()
  return { version: exercise.version, attempts, errors, review: raw.review as PracticeRecord['review'], lastError, reviewEvidence }
}

function item(value: unknown, records: PracticeData['records']): PracticeItem {
  const raw = dataObject(value, itemFields)
  const exercise = typeof raw.id === 'string' ? exercises.get(raw.id) : undefined
  if (!exercise || raw.version !== exercise.version) return reject()
  if (raw.result !== null && raw.result !== 'independent' && raw.result !== 'assisted' && raw.result !== 'skipped') reject()
  const result: PracticeItem = {
    id: exercise.id, version: exercise.version, hints: dataInteger(raw.hints, 3),
    answerShown: dataBoolean(raw.answerShown), hadError: dataBoolean(raw.hadError), helpUsed: dataBoolean(raw.helpUsed),
    submission: raw.submission === null ? null : submission(raw.submission, exercise),
    feedbackVisible: dataBoolean(raw.feedbackVisible), result: raw.result as PracticeItem['result'],
  }
  if ((result.hints > 0 || result.answerShown) && !result.helpUsed) reject()
  const rec = records[result.id]
  if (!result.submission) {
    if (result.feedbackVisible || result.hadError || (result.result !== null && result.result !== 'skipped')) reject()
  } else {
    if (!rec || (!result.feedbackVisible && !result.helpUsed)) reject()
    if (success(exercise, result.submission)) {
      if (!result.feedbackVisible || result.result !== (result.hadError || result.helpUsed ? 'assisted' : 'independent') || (rec.attempts <= rec.errors && rec.attempts !== Number.MAX_SAFE_INTEGER)) reject()
      if (result.result === 'independent' && rec.lastError && (rec.review !== 'reviewed' || JSON.stringify(rec.reviewEvidence?.submission) !== JSON.stringify(result.submission))) reject()
    } else {
      if (!result.hadError || (result.result !== null && result.result !== 'skipped') || rec.review !== 'pending' || JSON.stringify(rec.lastError) !== JSON.stringify(result.submission)) reject()
    }
  }
  if (result.hadError && (!rec || rec.errors < 1 || rec.review !== 'pending')) reject()
  return result
}

/** With no submissions in this round, its starting records are still available.
 * The original course context is deliberately not persisted. Search the at-most
 * five selected unattempted units for a context that produces this exact prefix;
 * any unselected promoted units can be demoted without changing that prefix. */
function possibleUnansweredRecommendation(items: PracticeItem[], records: PracticeData['records']): boolean {
  const candidates = [...new Set(items.filter(item => !records[item.id]?.attempts).map(item => exercises.get(item.id)!.unitId))]
  for (let mask = 0; mask < 2 ** candidates.length; mask++) {
    const practicedUnits = candidates.filter((_, n) => (mask & (1 << n)) !== 0)
    const expected = startPractice({ version: 1, records, round: null }, { mode: 'recommended' }, { practicedUnits, masteredUnits: [] }).round!.items
    if (items.every((item, n) => item.id === expected[n].id)) return true
  }
  return false
}

function round(value: unknown, records: PracticeData['records']): PracticeRound {
  const raw = dataObject(value, ['mode', 'topicId', 'items', 'index'])
  if (raw.mode !== 'topic' && raw.mode !== 'recommended' && raw.mode !== 'mistakes') reject()
  const topicId = raw.mode === 'topic' ? practiceTopics.find(topic => topic.id === raw.topicId)?.id : null
  if (raw.mode === 'topic' ? !topicId : raw.topicId !== null) reject()
  const items = dataArray(raw.items, 5, value => item(value, records)), index = dataInteger(raw.index, items.length)
  if (new Set(items.map(item => item.id)).size !== items.length) reject()
  if (topicId) {
    const expected = practiceExercises.filter(exercise => exercise.topicId === topicId).map(exercise => exercise.id).sort()
    if (items.length !== expected.length || items.some((item, n) => item.id !== expected[n])) reject()
  }
  if (raw.mode === 'recommended') {
    if (items.length !== Math.min(5, practiceExercises.length)) reject()
    if (items.every(item => item.submission === null) && !possibleUnansweredRecommendation(items, records)) reject()
  }
  if (raw.mode === 'mistakes') {
    if (items.some((item, n) => !records[item.id]?.lastError || (n > 0 && item.id <= items[n - 1].id))) reject()
    // At round start all selected mistakes were pending. Only selected items can
    // have become reviewed while this round was active.
    const initialPending = Object.entries(records).filter(([id, record]) => record.review === 'pending' || items.some(item => item.id === id)).map(([id]) => id).sort().slice(0, 5)
    if (items.length !== initialPending.length || items.some((item, n) => item.id !== initialPending[n])) reject()
  }
  for (let n = 0; n < items.length; n++) {
    const value = items[n]
    if (n < index && !value.result) reject()
    if (n > index && (value.hints || value.answerShown || value.hadError || value.helpUsed || value.submission || value.feedbackVisible || value.result)) reject()
  }
  return { mode: raw.mode as PracticeRound['mode'], topicId: topicId ?? null, items, index }
}

/** Strict current-format backup boundary. Legacy normalizePractice remains unchanged. */
export function parsePracticeStrict(value: unknown): PracticeData {
  const raw = dataObject(value, ['version', 'records', 'round'])
  if (raw.version !== 1) reject()
  const rawRecords = dataObject(raw.records)
  if (Object.keys(rawRecords).length > practiceExercises.length) reject()
  const records: PracticeData['records'] = {}
  for (const id of Object.keys(rawRecords)) {
    const exercise = exercises.get(id)
    if (!exercise) return reject()
    records[id] = record(rawRecords[id], exercise)
  }
  return { version: 1, records, round: raw.round === null ? null : round(raw.round, records) }
}
