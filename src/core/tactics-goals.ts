import type { Game } from './rules'
import type { Piece, Side } from './types'

export type TacticTopic = 'checks' | 'gain' | 'counter'
export type GoalState = {
  game: Game
  ownMoves: number
  plies: number
  score: number
  allChecking: boolean
  secondCheck: boolean
}
export const tacticValues = { general: 0, rook: 9, horse: 4, cannon: 4, advisor: 2, elephant: 2, soldier: 1 } as const

export function captureDelta(piece: Piece | null, learner: Side): number {
  return piece ? tacticValues[piece.type] * (piece.side === learner ? -1 : 1) : 0
}

export function goalStatus(topic: TacticTopic, learner: Side, state: GoalState): 'success' | 'failure' | 'pending' {
  const { game, ownMoves, plies, score, allChecking, secondCheck } = state
  if (topic === 'checks') {
    if (!allChecking || ownMoves > 3) return 'failure'
    if (game.result) return game.result.winner === learner && game.result.reason === 'checkmate' ? 'success' : 'failure'
    return ownMoves >= 3 && game.turn !== learner ? 'failure' : 'pending'
  }
  // Capturing the general, ending early, a draw, or any other terminal shortcut never satisfies these drills.
  if (game.result) return 'failure'
  if (plies < 4) return 'pending'
  return ownMoves === 2 && (topic === 'gain' ? score >= 4 : secondCheck && score >= 0) ? 'success' : 'failure'
}
