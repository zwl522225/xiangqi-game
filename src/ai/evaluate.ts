import { isInCheck, legalMoves, moveBoard, tryMove } from '../core/rules'
import type { Game } from '../core/rules'
import { difficultyProfiles, normalizeDifficulty } from './difficulty'
import type { AiDifficulty } from './difficulty'
import type { Board, Move, PieceType, Side } from '../core/types'

const values: Record<PieceType, number> = {
  general: 10000, rook: 900, cannon: 450, horse: 400, elephant: 220, advisor: 220, soldier: 100,
}

function score(board: Board, side: Side): number {
  let total = 0
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) {
    const piece = board[y][x]
    if (!piece) continue
    let value = values[piece.type]
    if (piece.type === 'soldier') {
      const progress = piece.side === 'red' ? 6 - y : y - 3
      value += Math.max(0, progress) * 12
      if (progress >= 2) value += 18
    }
    if (piece.type === 'horse' || piece.type === 'cannon') {
      value += Math.max(0, 4 - Math.abs(4 - x)) * 3
    }
    total += piece.side === side ? value : -value
  }
  return total
}

export function chooseFallbackMove(game: Game, choices: Move[] = legalMoves(game.board, game.turn)): Move | null {
  if (game.result || !choices.length) return null
  let best = choices[0]
  let bestScore = -Infinity
  for (const move of choices) {
    const captured = game.board[move.to.y][move.to.x]
    const value = score(moveBoard(game.board, move), game.turn) + (captured ? values[captured.type] / 2 : 0)
    if (value > bestScore) { bestScore = value; best = move }
  }
  return best
}

const winScore = 1_000_000
function evaluate(game: Game, side: Side): number {
  if (game.result) return game.result.winner === null ? 0 : game.result.winner === side ? winScore : -winScore
  return score(game.board, side)
}

// Counts actual rule-engine transitions, including root terminal checks and every iteration.
export type SearchResult = { move: Move | null; nodes: number; completedPlies: number; score: number | null }
export function searchMove(game: Game, difficulty: AiDifficulty = 'normal', nodeLimit?: number): SearchResult {
  const report: SearchResult = { move: null, nodes: 0, completedPlies: 0, score: null }
  if (game.result) return report
  const profile = difficultyProfiles[normalizeDifficulty(difficulty)]
  const maxNodes = Math.min(profile.maxNodes, Math.max(0, Math.floor(nodeLimit ?? profile.maxNodes)))
  const choices = legalMoves(game.board, game.turn)
  if (choices.length === 0) return report
  const side = game.turn
  const exhausted = Symbol('search budget exhausted')
  function advance(state: Game, move: Move): Game {
    if (report.nodes >= maxNodes) throw exhausted
    report.nodes++
    const result = tryMove(state, move)
    if (!result.ok) throw new Error(result.error)
    return result.game
  }
  function ordered(state: Game, limit: number): Move[] {
    return legalMoves(state.board, state.turn).map((move, index) => ({ move, index, priority: score(moveBoard(state.board, move), state.turn) }))
      .sort((a, b) => b.priority - a.priority || a.index - b.index).slice(0, limit).map(value => value.move)
  }
  try {
    const candidates = choices.map((move, index) => {
      const next = advance(game, move)
      const priority = evaluate(next, side) + (next.result ? 0 : (isInCheck(next.board, next.turn) ? 30 : 0) + (game.board[move.to.y][move.to.x] ? 25 : 0))
      return { move, index, priority, game: next }
    })
    const win = candidates.find(candidate => candidate.game.result?.winner === side)
    if (win) return { ...report, move: win.move, completedPlies: 1, score: winScore }
    candidates.sort((a, b) => b.priority - a.priority || a.index - b.index)
    report.move = candidates[0].move
    report.score = candidates[0].priority
    report.completedPlies = 1
    for (let depth = 2; depth <= profile.maxPlies; depth++) {
      let best = candidates[0].move
      let bestScore = -Infinity
      for (const candidate of candidates.slice(0, profile.rootCandidates)) {
        let worst = candidate.priority
        let worstTerminal = Boolean(candidate.game.result)
        if (!candidate.game.result) {
          const replies = depth === 2 ? legalMoves(candidate.game.board, candidate.game.turn) : ordered(candidate.game, 6)
          worst = Infinity
          for (const reply of replies) {
            const afterReply = advance(candidate.game, reply)
            let value = evaluate(afterReply, side) - (afterReply.result ? 0 : isInCheck(afterReply.board, side) ? 35 : 0)
            let terminal = Boolean(afterReply.result)
            if (depth === 3 && !afterReply.result) {
              value = -Infinity
              for (const response of ordered(afterReply, 6)) {
                const afterResponse = advance(afterReply, response)
                const responseValue = evaluate(afterResponse, side)
                if (responseValue > value) { value = responseValue; terminal = Boolean(afterResponse.result) }
                else if (responseValue === value && afterResponse.result) terminal = true
              }
            }
            if (value < worst) { worst = value; worstTerminal = terminal }
            else if (value === worst && terminal) worstTerminal = true
          }
        }
        // Wins, losses and draws at every depth stay absolute, without material tie bonuses.
        const total = worstTerminal ? worst : worst + candidate.priority * 0.05
        if (total > bestScore) { bestScore = total; best = candidate.move }
      }
      // Only publish a completed iteration. A partially searched root cannot replace it.
      report.move = best
      report.score = bestScore
      report.completedPlies = depth
    }
  } catch (error) {
    if (error !== exhausted) throw error
    if (!report.move) report.move = chooseFallbackMove(game, choices)
  }
  return report
}

export function chooseMove(game: Game, difficulty: AiDifficulty = 'normal'): Move | null {
  return searchMove(game, difficulty).move
}
