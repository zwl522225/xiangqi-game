import { endgames } from '../content/endgames'
import { defaultEndgameLessons, endgamePosition, type EndgameData, type EndgameRound } from './endgame-lessons'
import { checkLearningBytes, dataBoolean, dataInteger, dataObject, rejectLearningData, snapshotLearningData } from './learning-data-codec'
export const ENDGAME_STORAGE_KEY = 'xiangqi-endgame-lessons'
export const MAX_ENDGAME_BYTES = 32 * 1024
export type EndgameStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const READ_ERROR = '残局分步教学存档无法读取或已损坏；原存档已保留。可临时练习，请显式重置或恢复有效备份后再保存。'

/** All-or-nothing metadata boundary. Copy data descriptors before serialization or reads. */
export function parseEndgameLessons(value: unknown): EndgameData {
  const snapshot = snapshotLearningData(value)
  checkLearningBytes(JSON.stringify(snapshot), MAX_ENDGAME_BYTES)
  const item = dataObject(snapshot, ['version', 'records', 'round'])
  if (item.version !== 1) rejectLearningData()
  const inputRecords = dataObject(item.records, endgames.map(lesson => lesson.id))
  const records: EndgameData['records'] = {}
  for (const lesson of endgames) {
    const record = dataObject(inputRecords[lesson.id], ['version', 'completed', 'independent'])
    if (record.version !== 1) rejectLearningData()
    const completed = dataBoolean(record.completed), independent = dataBoolean(record.independent)
    if (independent && !completed) rejectLearningData()
    records[lesson.id] = { version: 1, completed, independent }
  }
  let round: EndgameRound | null = null
  if (item.round !== null) {
    const input = dataObject(item.round, ['id', 'version', 'ply', 'errors', 'hadError', 'hintLevel', 'helpUsed', 'demoUsed', 'explanationViewed'])
    const lesson = endgames.find(lesson => lesson.id === input.id && lesson.version === input.version)
    if (!lesson) rejectLearningData()
    round = { id: lesson.id, version: 1, ply: dataInteger(input.ply, lesson.line.length), errors: dataInteger(input.errors, 999),
      hadError: dataBoolean(input.hadError), hintLevel: dataInteger(input.hintLevel, 3), helpUsed: dataBoolean(input.helpUsed),
      demoUsed: dataBoolean(input.demoUsed), explanationViewed: dataBoolean(input.explanationViewed) }
    const game = endgamePosition(lesson, round.ply)
    const finished = round.ply === lesson.line.length
    if (round.hadError !== (round.errors > 0)
      || (round.hintLevel > 0 && (!round.helpUsed || game.turn !== lesson.side || finished))
      || (round.helpUsed && round.ply === 0 && round.hintLevel === 0)
      || (round.demoUsed && round.ply === 0)) rejectLearningData()
    if (finished) {
      const independent = !round.hadError && !round.helpUsed && !round.demoUsed && !round.explanationViewed
      if (!records[lesson.id].completed || (independent && !records[lesson.id].independent)) rejectLearningData()
    }
  }
  return { version: 1, records, round }
}
export function loadEndgameLessons(storage: EndgameStorage): { data: EndgameData; error: string; blocked: boolean } {
  try {
    const raw = storage.getItem(ENDGAME_STORAGE_KEY)
    if (raw === null) return { data: defaultEndgameLessons(), error: '', blocked: false }
    checkLearningBytes(raw, MAX_ENDGAME_BYTES)
    return { data: parseEndgameLessons(JSON.parse(raw)), error: '', blocked: false }
  } catch { return { data: defaultEndgameLessons(), error: READ_ERROR, blocked: true } }
}
export function saveEndgameLessons(storage: EndgameStorage, data: EndgameData): boolean {
  try { storage.setItem(ENDGAME_STORAGE_KEY, JSON.stringify(parseEndgameLessons(data))); return true } catch { return false }
}
export function clearEndgameLessons(storage: EndgameStorage): boolean {
  try { storage.removeItem(ENDGAME_STORAGE_KEY); return true } catch { return false }
}
