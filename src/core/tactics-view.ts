import { tactics } from '../content/tactics'
import type { Tactic } from '../content/tactics'
import { tacticsData } from '../content/tactics-data'
import { createGame, isInCheck, tryMove } from './rules'
import type { Game } from './rules'
import { captureDelta, goalStatus } from './tactics-goals'
import { formatMove } from './notation'
import type { Move, Piece } from './types'

export function moveKey(move: Move): string { return ((move.from.y * 9 + move.from.x) * 90 + move.to.y * 9 + move.to.x).toString(36) }
export function keyMove(key: string): Move { const n = parseInt(key, 36); return { from: { x: Math.floor(n / 90) % 9, y: Math.floor(n / 810) }, to: { x: n % 90 % 9, y: Math.floor(n % 90 / 9) } } }
function validMove(move: Move): boolean { return Boolean(move?.from && move?.to) && [move.from, move.to].every(p => Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < 9 && p.y >= 0 && p.y < 10) }
const names = { general: '将帅', rook: '车', horse: '马', cannon: '炮', advisor: '仕士', elephant: '相象', soldier: '兵卒' }
const pieceText = (piece: Piece) => `${piece.side === 'red' ? '红' : '黑'}${names[piece.type]}`
export type TacticCaptures = { score: number; red: Piece[]; black: Piece[] }
export type TacticView = {
  tactic: Tactic; game: Game; complete: boolean; learnerTurn: boolean; correctMoves: Move[]; reply: Move | null
  notation: string[]; notes: string[]; captures: TacticCaptures; ownMoves: number
}

/** Replay only. Published edges, including every defense, are checked at each step. */
export function tacticView(id: string, path: Move[]): TacticView | null {
  const tactic = tactics.find(item => item.id === id)
  const data = tacticsData[id]
  if (!tactic || !data || !Array.isArray(path) || path.length > 6) return null
  let game = createGame(tactic.board, tactic.side)
  const keys: string[] = [], notation: string[] = [], notes: string[] = []
  // Arrays are grouped by CAPTURER, and contain the pieces actually captured since setup.
  const captures: TacticCaptures = { score: 0, red: [], black: [] }
  let ownMoves = 0, allChecking = true, secondCheck = false
  for (const move of path) {
    if (!validMove(move)) return null
    const key = moveKey(move)
    if (!data[keys.join('.')]?.moves.includes(key)) return null
    const result = tryMove(game, move)
    if (!result.ok) return null
    const own = game.turn === tactic.side
    const captured = game.board[move.to.y][move.to.x]
    const text = formatMove(game.board, move)
    notation.push(text)
    notes.push(`${text}。${captured ? `吃掉${pieceText(captured)}。` : '本着没有吃子。'}${result.check ? '走后真实将军。' : '本着没有将军。'}${result.game.result?.reason === 'checkmate' ? '对方没有合法应将，形成将死。' : ''}`)
    if (captured) { captures[game.turn].push({ ...captured }); captures.score += captureDelta(captured, tactic.side) }
    ownMoves += Number(own)
    allChecking &&= !own || result.check
    if (own && ownMoves === 2) secondCheck = result.check
    game = result.game
    keys.push(key)
  }
  const node = data[keys.join('.')]
  if (!node) return null
  const complete = goalStatus(tactic.topic, tactic.side, { game, ownMoves, plies: path.length, score: captures.score, allChecking, secondCheck }) === 'success'
  const learnerTurn = !complete && game.turn === tactic.side
  return { tactic, game, complete, learnerTurn, correctMoves: learnerTurn ? node.moves.map(keyMove) : [],
    reply: !complete && !learnerTurn && node.reply ? keyMove(node.reply) : null, notation, notes, captures, ownMoves }
}

export type TacticFeedback = { status: 'illegal' | 'not-goal' | 'success'; message: string; refutation?: Move[] }
export function tacticFeedback(id: string, path: Move[], move: Move): TacticFeedback {
  const view = tacticView(id, path)
  if (!view || !view.learnerTurn || !validMove(move)) return { status: 'illegal', message: '当前不能提交这着棋，或坐标不在棋盘上。' }
  const result = tryMove(view.game, move)
  if (!result.ok) return { status: 'illegal', message: result.error }
  const node = tacticsData[id][path.map(moveKey).join('.')]
  if (node.moves.includes(moveKey(move))) return { status: 'success', message: '符合本题目标，可以继续。' }
  const failure = node.failures?.[moveKey(move)]
  if (!failure) return { status: 'not-goal', message: '合法，但不能保证在本题限定步数内完成目标。' }
  const [reason, line] = failure
  const direct: Record<string, string> = {
    'must-check': '本着没有将军，连续将军要求己方每一步都真实将军。',
    'second-check': '第二步没有真实将军，未达到反将条件。',
    'early-terminal': '棋局提前结束，未走完本题规定的检验着数。',
  }
  let detail = direct[reason] ?? (line.length ? '下列变化展示本题目标失败的一种实际可能。' : `本着虽然将军，但对方仍有合法应手；己方已走 ${view.ownMoves + 1} 步，未在限步内将死。`)
  if (line.length) {
    let game = result.game
    let score = view.captures.score + captureDelta(view.game.board[move.to.y][move.to.x], view.tactic.side)
    let ownMoves = view.ownMoves + 1
    let brokenCheckAt: number | null = result.check ? null : ownMoves
    for (const encoded of line) {
      const defense = keyMove(encoded)
      score += captureDelta(game.board[defense.to.y][defense.to.x], view.tactic.side)
      const replay = tryMove(game, defense)
      if (!replay.ok) throw Error('内置战术反例无法重放')
      if (game.turn === view.tactic.side) {
        ownMoves++
        if (!replay.check && brokenCheckAt === null) brokenCheckAt = ownMoves
      }
      game = replay.game
    }
    let ending = game.result ? '出现终局，未符合本题目标。' : '该变化未符合本题规定目标。'
    if (view.tactic.topic === 'checks') {
      if (brokenCheckAt !== null) ending = `己方第 ${brokenCheckAt} 步没有将军，连续将军中断。`
      else if (!game.result && ownMoves >= view.tactic.maxOwnMoves) ending = `己方已走 ${ownMoves} 步，未在限步内将死。`
    }
    detail += ` 一种可行防守及其后续示例：本题净吃子记分为 ${score}；${ending}`
  }
  return { status: 'not-goal', message: `合法，但不能保证在本题限定步数内完成目标。${detail}`, ...(line.length ? { refutation: line.map(keyMove) } : {}) }
}

export function tacticHints(id: string, path: Move[]): string[] {
  const view = tacticView(id, path)
  if (!view) return []
  if (view.complete) return ['本题目标已经完成。', `本题净吃子记分：${view.captures.score}。`, '可以逐着回看刚才的实际变化。']
  if (!view.learnerTurn) return ['现在轮到对方应手。', '点击查看对方应手后再观察局面。', view.reply ? `本分支指定应手：${formatMove(view.game.board, view.reply)}。` : '没有待查看的应手。']
  const move = view.correctMoves[0]
  const piece = view.game.board[move.from.y][move.from.x]!
  const laterObservation = view.tactic.topic === 'counter'
    ? isInCheck(view.game.board, view.tactic.side) ? '现在是第二步，己方再次受将；本步须合法应将并真实反将。' : '第一步已经解将；现在是第二步，须根据对方刚才的应手真实反将。'
    : view.tactic.topic === 'gain' ? '现在是第二步，须根据对方刚才的应手完成吃子目标，并检查最后一次防守能否吃回。' : `本步仍须真实将军，剩余己方 ${view.tactic.maxOwnMoves - view.ownMoves} 步；观察对方将帅现在的退路。`
  const laterRelation = view.tactic.topic === 'checks' ? '走后须继续封锁实际退路，直到形成真实将死。' : '走后还要计入对方一次合法应手，才能检验本题净吃子记分。'
  return [`${view.ownMoves ? laterObservation : view.tactic.hints[0]}当前已走 ${view.ownMoves} 步，本题净吃子记分 ${view.captures.score}。`,
    `${view.ownMoves ? laterRelation : view.tactic.hints[1]}本分支可关注位于 (${move.from.x},${move.from.y}) 的${pieceText(piece)}。`,
    `当前一条正确着法：${formatMove(view.game.board, move)}，从 (${move.from.x},${move.from.y}) 到 (${move.to.x},${move.to.y})。`]
}
