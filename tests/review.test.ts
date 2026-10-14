import { describe, expect, it } from 'vitest'
import { describeMove, setNote } from '../src/core/review'
import { acceptDraw, createSession, offerDraw, play, resign, setView, undo } from '../src/core/session'
import type { Session } from '../src/core/session'
import { createGame } from '../src/core/rules'
import type { Board, Move } from '../src/core/types'

const soldier: Move = { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } }
function played(session: Session, move: Move): Session {
  const result = play(session, move)
  if (!result.ok) throw new Error(result.error)
  return result.session
}
function custom(board: Board, turn: 'red' | 'black' = 'red'): Session {
  const game = createGame(board, turn)
  return { ...createSession(), game, snapshots: [game] }
}
const empty = (): Board => Array.from({ length: 10 }, () => Array(9).fill(null))

describe('facts from the selected actual move', () => {
  it('describes the moving piece and true coordinates, ignoring record flags and captions', () => {
    const session = played(createSession(), soldier)
    session.records[0] = { ...session.records[0], notation: '错误', captured: true, check: true }
    expect(describeMove(session, 1)).toEqual({ index: 1, side: 'red', piece: { side: 'red', type: 'soldier' }, from: soldier.from, to: soldier.to, notation: '兵九进一', captured: null, check: false, outcome: null })
    for (const index of [0, -1, 2, 1.5, NaN]) expect(describeMove(session, index)).toBeNull()
  })
  it('reports the actual captured piece and check', () => {
    const board = empty()
    board[9][5] = { side: 'red', type: 'general' }; board[0][3] = { side: 'black', type: 'general' }
    board[5][0] = { side: 'red', type: 'rook' }; board[5][3] = { side: 'black', type: 'horse' }
    const session = played(custom(board), { from: { x: 0, y: 5 }, to: { x: 3, y: 5 } })
    expect(describeMove(session, 1)).toMatchObject({ captured: { side: 'black', type: 'horse' }, check: true, outcome: null })
  })
  it.each(['checkmate', 'stalemate'] as const)('reports an engine-produced %s', reason => {
    const board = empty()
    board[9][4] = { side: 'red', type: 'general' }; board[0][3] = { side: 'black', type: 'general' }
    board[8][3] = { side: 'black', type: 'rook' }; board[7][5] = { side: 'black', type: 'rook' }
    if (reason === 'checkmate') board[7][4] = { side: 'black', type: 'rook' }
    const session = played(custom(board, 'black'), { from: { x: 5, y: 7 }, to: { x: 5, y: 8 } })
    expect(session.game.result?.reason).toBe(reason)
    expect(describeMove(session, 1)?.outcome).toEqual({ winner: 'black', reason })
  })
  it('reports a genuine natural limit but no later resignation or agreement', () => {
    const initial = createSession(); initial.game.noCapturePlies = 119
    expect(describeMove(played(initial, soldier), 1)?.outcome).toEqual({ winner: null, reason: 'natural-limit' })
    const session = played(createSession(), soldier)
    expect(describeMove(resign(session, 'black'), 1)?.outcome).toBeNull()
    expect(describeMove(acceptDraw(offerDraw(session, 'black'), 'red'), 1)?.outcome).toBeNull()
    const two = played(session, { from: { x: 0, y: 3 }, to: { x: 0, y: 4 } })
    expect(describeMove(resign(two, 'red'), 1)?.outcome).toBeNull()
  })
  it('declines to explain inconsistent snapshots and illegal history', () => {
    const session = played(createSession(), soldier)
    const bad = { ...session, snapshots: [session.snapshots[0], createGame()] }
    expect(describeMove(bad, 1)).toBeNull()
    expect(describeMove({ ...session, records: [{ ...session.records[0], move: { from: { x: 8, y: 8 }, to: { x: 8, y: 7 } } }] }, 1)).toBeNull()
  })
  it('accepts semantically identical snapshot objects with different property order', () => {
    const session = played(createSession(), soldier)
    const after = session.snapshots[1]
    const reordered = {
      result: after.result, repetitionWarning: after.repetitionWarning, positionKeys: after.positionKeys,
      noCapturePlies: after.noCapturePlies, turn: after.turn,
      board: after.board.map(row => row.map(piece => piece ? { type: piece.type, side: piece.side } : null)),
    }
    expect(describeMove({ ...session, snapshots: [session.snapshots[0], reordered] }, 1)?.notation).toBe('兵九进一')
  })
})

describe('notes belong to actual plies', () => {
  it('saves and clears only notes, caps text, and rejects invalid indices', () => {
    const session = played(createSession(), soldier)
    const noted = setNote(session, 1, '观察中路')
    expect(noted.notes).toEqual({ '1': '观察中路' })
    for (const field of ['game', 'records', 'snapshots', 'viewIndex'] as const) expect(noted[field]).toBe(session[field])
    expect(setNote(noted, 1, '').notes).toEqual({})
    expect(setNote(noted, 1, 'x'.repeat(501)).notes?.['1']).toHaveLength(500)
    for (const index of [0, 2, 1.2, NaN]) expect(setNote(noted, index, 'bad')).toBe(noted)
  })
  it('preserves notes through play and view, truncates undo, and starts empty', () => {
    const first = setNote(played(createSession(), soldier), 1, '第一着')
    const second = setNote(played(first, { from: { x: 0, y: 3 }, to: { x: 0, y: 4 } }), 2, '第二着')
    expect(second.notes?.['1']).toBe('第一着')
    expect(setView(second, 0).notes).toBe(second.notes)
    expect(undo(second).notes).toEqual({ '1': '第一着' })
    expect(createSession().notes).toEqual({})
    expect(undo({ ...second, mode: 'ai', playerSide: 'red' }).notes).toEqual({})
  })
})
