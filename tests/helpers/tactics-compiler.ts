/** Development only. Bounded AND/OR proof; never imported by src/. */
import { createGame, evaluateOutcome, generalsFacing, isInCheck, legalMoves, tryMove } from '../../src/core/rules'
import { captureDelta, goalStatus } from '../../src/core/tactics-goals'
import type { GoalState } from '../../src/core/tactics-goals'
import type { Tactic } from '../../src/content/tactics'
import type { TacticData, TacticFailureReason } from '../../src/content/tactics-data'
import type { Move } from '../../src/core/types'
import { opposite } from '../../src/core/types'
import { referenceEvaluator } from './tactics-reference'

export function encode(move: Move): string { return ((move.from.y * 9 + move.from.x) * 90 + move.to.y * 9 + move.to.x).toString(36) }
export function decode(key: string): Move { const n = parseInt(key, 36); return { from: { x: Math.floor(n / 90) % 9, y: Math.floor(n / 810) }, to: { x: n % 90 % 9, y: Math.floor(n % 90 / 9) } } }
const sort = (moves: Move[]) => [...moves].sort((a, b) => a.from.x - b.from.x || a.from.y - b.from.y || a.to.x - b.to.x || a.to.y - b.to.y)

export function advance(tactic: Tactic, state: GoalState, move: Move): GoalState {
  const result = tryMove(state.game, move)
  if (!result.ok) throw Error(result.error)
  const own = state.game.turn === tactic.side
  const ownMoves = state.ownMoves + Number(own)
  return { game: result.game, ownMoves, plies: state.plies + 1,
    score: state.score + captureDelta(state.game.board[move.to.y][move.to.x], tactic.side),
    allChecking: state.allChecking && (!own || result.check),
    secondCheck: own && ownMoves === 2 ? result.check : state.secondCheck }
}
export function initialState(tactic: Tactic): GoalState {
  return { game: createGame(tactic.board, tactic.side), ownMoves: 0, plies: 0, score: 0, allChecking: true, secondCheck: false }
}

export function validateSetup(tactic: Tactic): void {
  if (tactic.board.length !== 10 || tactic.board.some(row => row.length !== 9)) throw Error('invalid board dimensions')
  const types = new Set(['general', 'advisor', 'elephant', 'horse', 'rook', 'cannon', 'soldier'])
  for (const row of tactic.board) for (const piece of row) if (piece !== null && (!piece || !types.has(piece.type) || !['red', 'black'].includes(piece.side))) throw Error('invalid piece')
  for (const side of ['red', 'black'] as const) {
    const generals = tactic.board.flatMap((row, y) => row.flatMap((piece, x) => piece?.side === side && piece.type === 'general' ? [{ x, y }] : []))
    if (generals.length !== 1 || generals[0].x < 3 || generals[0].x > 5 || (side === 'red' ? generals[0].y < 7 : generals[0].y > 2)) throw Error('invalid generals')
  }
  if (generalsFacing(tactic.board) || isInCheck(tactic.board, opposite(tactic.side)) || evaluateOutcome(tactic.board, tactic.side, 0)) throw Error('invalid initial state')
  if (isInCheck(tactic.board, tactic.side) !== (tactic.topic === 'counter')) throw Error('wrong initial check status')
}

type Proof = { win: boolean; distance: number; line: Move[] }
export function compileTactic(tactic: Tactic, options: { allowUnsolved?: boolean; skipSetup?: boolean } = {}): { data: TacticData; states: number; solved: boolean } {
  if (!options.skipSetup) validateSetup(tactic)
  const memo = new Map<string, Proof>()
  let states = 0
  function solve(state: GoalState): Proof {
    // Full rule history is retained: repetitions and different capture histories are never merged.
    const key = JSON.stringify(state)
    const cached = memo.get(key)
    if (cached) return cached
    if (++states > 1_000_000) throw Error(`${tactic.id}: state budget exceeded`)
    const status = goalStatus(tactic.topic, tactic.side, state)
    if (status !== 'pending') { const value = { win: status === 'success', distance: 0, line: [] }; memo.set(key, value); return value }
    const own = state.game.turn === tactic.side
    const moves = sort(legalMoves(state.game.board, state.game.turn))
    let winner: Proof | undefined
    let loser: Proof | undefined
    for (const move of moves) {
      const next = advance(tactic, state, move)
      const proof = solve(next)
      const result = { win: proof.win, distance: proof.distance + Number(own), line: [move, ...proof.line] }
      if (proof.win && (!winner || (own ? result.distance < winner.distance : result.distance > winner.distance))) winner = result
      if (!proof.win && !loser) loser = result
      // One losing defense proves that an existential move cannot guarantee its objective.
      if (!own && loser) break
    }
    const result = own ? winner ?? loser ?? { win: false, distance: 0, line: [] } : loser ?? winner ?? { win: false, distance: 0, line: [] }
    memo.set(key, result)
    return result
  }
  const root = initialState(tactic)
  const proof = solve(root)
  if (!proof.win) {
    if (options.allowUnsolved) return { data: {}, states, solved: false }
    throw Error(`${tactic.id}: no forced solution`)
  }
  if (tactic.topic === 'checks' && legalMoves(root.game.board, tactic.side).some(move => { const next = advance(tactic, root, move); return next.game.result?.reason === 'checkmate' && next.game.result.winner === tactic.side })) throw Error('root mate in one')
  if (tactic.topic === 'gain') {
    for (const move of legalMoves(root.game.board, tactic.side)) {
      const next = advance(tactic, root, move)
      if (next.game.result) continue
      const defenses = legalMoves(next.game.board, next.game.turn)
      if (defenses.length && defenses.every(defense => { const last = advance(tactic, next, defense); return !last.game.result && last.score >= 4 })) throw Error('root forced gain in one')
    }
  }
  const data: TacticData = {}
  function publish(state: GoalState, path: string[]): void {
    const key = path.join('.')
    if (goalStatus(tactic.topic, tactic.side, state) === 'success') { data[key] = { moves: [] }; return }
    const own = state.game.turn === tactic.side
    const node: TacticData[string] = { moves: [] }
    const failures: Record<string, [TacticFailureReason, string[]]> = {}
    let replyDistance = -1
    for (const move of sort(legalMoves(state.game.board, state.game.turn))) {
      const next = advance(tactic, state, move)
      const branch = solve(next)
      const encoded = encode(move)
      if (branch.win) {
        node.moves.push(encoded)
        if (!own && branch.distance > replyDistance) { node.reply = encoded; replyDistance = branch.distance }
        publish(next, [...path, encoded])
      } else if (own) {
        const reason = tactic.topic === 'checks' && !next.allChecking ? 'must-check' : tactic.topic === 'counter' && next.ownMoves === 2 && !next.secondCheck ? 'second-check' : next.game.result ? 'early-terminal' : 'limit'
        failures[encoded] = [reason, branch.line.map(encode)]
      } else throw Error('incomplete defense proof')
    }
    if (own) node.failures = failures
    data[key] = node
  }
  publish(root, [])
  return { data, states, solved: true }
}

export function verifyTactic(tactic: Tactic, data: TacticData): { valid: boolean; error?: string } {
  try {
    validateSetup(tactic)
    const oracle = referenceEvaluator(tactic)
    const visited = new Set<string>()
    const root = oracle.replay([])
    if (!oracle.proof(root).win) throw Error('no universal solution')
    for (const move of legalMoves(root.game.board, tactic.side)) {
      const after = oracle.next(root, move)
      if (tactic.topic === 'checks' && after.game.result?.reason === 'checkmate' && after.game.result.winner === tactic.side) throw Error('mate in one')
      if (tactic.topic === 'gain' && !after.game.result) {
        const replies = legalMoves(after.game.board, after.game.turn)
        if (replies.length && replies.every(reply => { const last = oracle.next(after, reply); return !last.game.result && last.score >= 4 })) throw Error('gain in one')
      }
    }
    function audit(path: Move[]) {
      const key = path.map(encode).join('.')
      visited.add(key)
      const node = data[key]
      if (!node) throw Error('missing node')
      const state = oracle.replay(path)
      const done = oracle.terminal(state)
      if (done !== null) {
        if (!done || node.moves.length || node.reply || node.failures) throw Error('invalid terminal')
        return
      }
      const own = state.game.turn === tactic.side
      const legal = sort(legalMoves(state.game.board, state.game.turn))
      const passing = own ? legal.filter(move => oracle.proof(oracle.next(state, move)).win) : legal
      if (JSON.stringify(node.moves) !== JSON.stringify(passing.map(encode))) throw Error('missing or false passing move / defense')
      if (!passing.length) throw Error('empty nonterminal proof')
      if (own) {
        if (node.reply) throw Error('learner reply field')
        const failing = legal.filter(move => !node.moves.includes(encode(move)))
        if (JSON.stringify(Object.keys(node.failures ?? {}).sort()) !== JSON.stringify(failing.map(encode).sort())) throw Error('incomplete failure feedback')
        for (const move of failing) {
          const [reason, line] = node.failures![encode(move)]
          if (path.length + 1 + line.length > 6) throw Error('long counterline')
          let end = oracle.next(state, move)
          // Audit the claimed predicate using the independently replayed reference state.
          const breaksChecks = tactic.topic === 'checks' && !end.checking
          const missesCounter = tactic.topic === 'counter' && end.own === 2 && !end.counterCheck
          const terminal = Boolean(end.game.result)
          const reasonMatches = reason === 'must-check' ? breaksChecks
            : reason === 'second-check' ? !breaksChecks && missesCounter
              : reason === 'early-terminal' ? !breaksChecks && !missesCounter && terminal
                : reason === 'limit' && !breaksChecks && !missesCounter && !terminal
          if (!reasonMatches) throw Error('failure reason contradicts submitted position')
          for (const token of line) end = oracle.next(end, decode(token))
          if (oracle.terminal(end) !== false) throw Error('counterline must end in concrete failure')
        }
      } else {
        if (node.failures) throw Error('defender failure field')
        const expected = [...passing].sort((a, b) => oracle.proof(oracle.next(state, b)).distance - oracle.proof(oracle.next(state, a)).distance)[0]
        if (node.reply !== encode(expected)) throw Error('wrong designated reply')
      }
      for (const move of passing) audit([...path, move])
    }
    audit([])
    if (visited.size !== Object.keys(data).length) throw Error('unreachable extra node')
    return { valid: true }
  } catch (error) { return { valid: false, error: String(error) } }
}
