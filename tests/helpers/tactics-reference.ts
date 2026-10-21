/** Independent finite reference. Deliberately does not import tactics-goals or the compiler. */
import { createGame, legalMoves, tryMove } from '../../src/core/rules'
import type { Game } from '../../src/core/rules'
import type { Move } from '../../src/core/types'
import type { Tactic } from '../../src/content/tactics'

type State = { game: Game; own: number; ply: number; score: number; checking: boolean; counterCheck: boolean }
type Verdict = { win: boolean; distance: number }
const values = { general: 0, rook: 9, horse: 4, cannon: 4, advisor: 2, elephant: 2, soldier: 1 }

export function referenceEvaluator(tactic: Tactic, cooperative = false) {
  const cache = new Map<string, Verdict>()
  let count = 0
  function terminal(state: State): boolean | null {
    if (state.game.result) return tactic.topic === 'checks' && state.own <= 3 && state.checking && state.game.result.winner === tactic.side && state.game.result.reason === 'checkmate'
    if (tactic.topic === 'checks') {
      if (!state.checking || state.own >= 3) return false
      return null
    }
    if (state.ply === 4) return state.own === 2 && (tactic.topic === 'gain' ? state.score >= 4 : state.counterCheck && state.score >= 0)
    return state.ply > 4 ? false : null
  }
  function next(state: State, move: Move): State {
    const result = tryMove(state.game, move)
    if (!result.ok) throw Error(`reference illegal: ${result.error}`)
    const ownTurn = state.game.turn === tactic.side
    const victim = state.game.board[move.to.y][move.to.x]
    return { game: result.game, own: state.own + Number(ownTurn), ply: state.ply + 1,
      score: state.score + (victim ? values[victim.type] * (victim.side === tactic.side ? -1 : 1) : 0),
      checking: state.checking && (!ownTurn || result.check),
      counterCheck: ownTurn && state.own === 1 ? result.check : state.counterCheck }
  }
  function proof(state: State): Verdict {
    const key = JSON.stringify(state)
    const saved = cache.get(key)
    if (saved) return saved
    if (++count > 1_000_000) throw Error('reference state budget exceeded')
    const done = terminal(state)
    if (done !== null) return { win: done, distance: 0 }
    const ownTurn = state.game.turn === tactic.side
    let win = ownTurn || cooperative ? false : true
    let distance = ownTurn ? Infinity : 0
    const moves = legalMoves(state.game.board, state.game.turn)
    if (!moves.length) return { win: false, distance: 0 }
    for (const move of moves) {
      const child = proof(next(state, move))
      if (ownTurn || cooperative) {
        if (child.win) { win = true; distance = Math.min(distance, child.distance + Number(ownTurn)) }
      } else {
        if (!child.win) { win = false; break }
        distance = Math.max(distance, child.distance)
      }
    }
    const answer = { win, distance: win ? distance : 0 }
    cache.set(key, answer)
    return answer
  }
  function replay(path: Move[]): State {
    let state: State = { game: createGame(tactic.board, tactic.side), own: 0, ply: 0, score: 0, checking: true, counterCheck: false }
    for (const move of path) state = next(state, move)
    return state
  }
  return { proof, next, terminal, replay, states: () => count }
}
