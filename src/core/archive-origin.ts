import { openings } from '../content/openings'
import { createGame, tryMove } from './rules'
import type { Game } from './rules'
import type { Move } from './types'

// Compare all rule state, including the history that cannot be recovered from a board picture.
export function sameGame(actual: Game, expected: Game): boolean {
  if (!actual || !Array.isArray(actual.board) || actual.board.length !== 10 || !Array.isArray(actual.positionKeys)) return false
  if (actual.turn !== expected.turn || actual.noCapturePlies !== expected.noCapturePlies || actual.repetitionWarning !== expected.repetitionWarning) return false
  if (actual.positionKeys.length !== expected.positionKeys.length) return false
  for (let index = 0; index < expected.positionKeys.length; index++) if (actual.positionKeys[index] !== expected.positionKeys[index]) return false
  if (expected.result === null) {
    if (actual.result !== null) return false
  } else if (!actual.result || actual.result.reason !== expected.result.reason || actual.result.winner !== expected.result.winner) return false
  // Indexed loops also reject sparse arrays instead of silently skipping missing cells.
  for (let y = 0; y < 10; y++) {
    const row = actual.board[y]
    if (!Array.isArray(row) || row.length !== 9) return false
    for (let x = 0; x < 9; x++) {
      const piece = row[x], other = expected.board[y][x]
      if (other === null ? piece !== null : !piece || piece.type !== other.type || piece.side !== other.side) return false
    }
  }
  return true
}

export function inferLegacyStart(snapshot: Game): Move[] | null {
  if (sameGame(snapshot, createGame())) return []
  for (const opening of openings) {
    let game = createGame()
    const prefix: Move[] = []
    for (const step of opening.steps) {
      const result = tryMove(game, step.move)
      if (!result.ok) break
      game = result.game
      prefix.push(step.move)
      if (sameGame(snapshot, game)) return prefix
    }
  }
  return null
}
