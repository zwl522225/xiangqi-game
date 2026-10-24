import { endgames, type EndgameLesson } from '../content/endgames'
import { formatMove } from './notation'
import { createGame, evaluateOutcome, isInCheck, tryMove, type Game } from './rules'
import { opposite, samePosition } from './types'
import type { Move } from './types'

export type EndgameRound = { id: string; version: 1; ply: number; errors: number; hadError: boolean; hintLevel: number; helpUsed: boolean; demoUsed: boolean; explanationViewed: boolean }
export type EndgameData = { version: 1; records: Record<string, { version: 1; completed: boolean; independent: boolean }>; round: EndgameRound | null }
export type EndgameAction = { type: 'start'; id: string } | { type: 'submit'; move: Move } | { type: 'reply' | 'hint' | 'demo' } | { type: 'explanation'; topic: EndgameLesson['topic'] }

export function defaultEndgameLessons(): EndgameData {
  return { version: 1, records: Object.fromEntries(endgames.map(lesson => [lesson.id, { version: 1, completed: false, independent: false }])), round: null }
}

/** Reconstruct a bounded route prefix; never manufacture boards or discard move history. */
export function endgamePosition(lesson: EndgameLesson, ply: number): Game {
  if (!Number.isInteger(ply) || ply < 0 || ply > lesson.line.length) throw Error('残局路线前缀无效')
  let game = createGame(lesson.board, lesson.side)
  if (isInCheck(game.board, lesson.side) || isInCheck(game.board, opposite(lesson.side)) || evaluateOutcome(game.board, game.turn, 0)) {
    throw Error('残局初始局面必须未被将军且未结束')
  }
  for (let index = 0; index < ply; index++) {
    const result = tryMove(game, lesson.line[index])
    if (!result.ok) throw Error(`残局第 ${index + 1} 着无效：${result.error}`)
    game = result.game
    if (game.result && index !== lesson.line.length - 1) throw Error('残局路线提前结束')
  }
  if (ply === lesson.line.length && (game.result?.reason !== 'checkmate' || game.result.winner !== lesson.side)) {
    throw Error('残局路线没有以练习方真实将死结束')
  }
  return game
}

export function endgameFinished(data: EndgameData): boolean {
  const round = data.round
  const lesson = endgames.find(item => item.id === round?.id && item.version === round.version)
  if (!round || !lesson || round.ply !== lesson.line.length) return false
  try { return endgamePosition(lesson, round.ply).result?.reason === 'checkmate' }
  catch { return false }
}

function boardCoordinates(move: Move): boolean {
  return Boolean(move?.from && move?.to) && [move.from, move.to].every(point =>
    Number.isInteger(point.x) && Number.isInteger(point.y) && point.x >= 0 && point.x < 9 && point.y >= 0 && point.y < 10)
}
const sameMove = (a: Move, b: Move) => samePosition(a.from, b.from) && samePosition(a.to, b.to)

/** Only the explicitly taught route advances. All persistence and confirmation belong to callers. */
export function transitionEndgameLessons(data: EndgameData, action: EndgameAction): { data: EndgameData; message: string } {
  if (action.type === 'start') {
    const lesson = endgames.find(item => item.id === action.id)
    if (!lesson) return { data, message: '找不到这道残局教学题。' }
    return { data: { ...data, round: { id: lesson.id, version: 1, ply: 0, errors: 0, hadError: false,
      hintLevel: 0, helpUsed: false, demoUsed: false, explanationViewed: false } }, message: '已开始本题指定路线练习。' }
  }
  const current = data.round
  const lesson = endgames.find(item => item.id === current?.id && item.version === current.version)
  if (!current || !lesson || endgameFinished(data)) return { data, message: '' }
  const game = endgamePosition(lesson, current.ply)
  const round = { ...current }
  const publish = (message: string) => ({ data: { ...data, round }, message })
  if (action.type === 'explanation') {
    if (action.topic !== lesson.topic) return { data, message: '' }
    round.explanationViewed = true
    return publish('本轮已记录查看本主题讲解；答题局面保留在当前步骤。')
  }
  const ownTurn = game.turn === lesson.side
  if (action.type === 'reply' ? ownTurn : !ownTurn) {
    return { data, message: ownTurn ? '现在轮到你行棋。' : '现在轮到对方，请查看指定应手。' }
  }
  if (action.type === 'hint') {
    round.hintLevel = Math.min(3, round.hintLevel + 1)
    round.helpUsed = true
    return publish(lesson.hints[Math.floor(round.ply / 2)][round.hintLevel - 1])
  }
  const expected = lesson.line[round.ply]
  if (action.type === 'submit') {
    const checked = boardCoordinates(action.move) ? tryMove(game, action.move) : { ok: false as const, error: '落点不在棋盘上' }
    if (!checked.ok || !sameMove(action.move, expected)) {
      round.errors = Math.min(999, round.errors + 1)
      round.hadError = true
      return publish(!checked.ok ? `非法着法：${checked.error}` : '这是合法走法，但不在本课当前路线中；本课未判断这条变化的最终结果。')
    }
  }
  if (action.type === 'demo') round.demoUsed = true
  round.ply++
  round.hintLevel = 0
  // A completed prefix must reproduce the actual checkmate before publishing either record.
  const next = endgamePosition(lesson, round.ply)
  let message = `${formatMove(game.board, expected)}：${lesson.explanations[current.ply]}`
  if (round.ply === lesson.line.length && next.result?.reason === 'checkmate' && next.result.winner === lesson.side) {
    const independent = round.errors === 0 && !round.hadError && !round.helpUsed && !round.demoUsed && !round.explanationViewed
    const previous = data.records[lesson.id]
    const records = { ...data.records, [lesson.id]: { version: 1 as const, completed: true, independent: Boolean(previous?.independent) || independent } }
    message += independent ? ' 本轮无提示且无错误完成指定路线。' : ' 已完成指定路线，本轮包含错误或辅助。'
    return { data: { ...data, round, records }, message }
  }
  return publish(message)
}
