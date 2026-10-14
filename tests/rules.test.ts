import { describe, expect, it } from 'vitest'
import { createGame, evaluateOutcome, isInCheck, legalMoves, positionKey, tryMove } from '../src/core/rules'
import type { Board, PieceType, Side } from '../src/core/types'

const empty = (): Board => Array.from({ length: 10 }, () => Array(9).fill(null))
function put(board: Board, x: number, y: number, type: PieceType, side: Side) {
  board[y][x] = { type, side }
}

describe('legal game rules', () => {
  it('starts red and alternates after a legal move', () => {
    const game = createGame()
    expect(game.turn).toBe('red')
    expect(tryMove(game, { from: { x: 0, y: 3 }, to: { x: 0, y: 4 } }).ok).toBe(false)
    const red = tryMove(game, { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    expect(red.ok).toBe(true)
    if (!red.ok) return
    expect(red.game.turn).toBe('black')
    expect(red.game.board[5][0]?.type).toBe('soldier')
    expect(red.game.board[6][0]).toBe(null)
  })

  it('forbids exposing the generals to one another', () => {
    const board = empty()
    put(board, 4, 9, 'general', 'red'); put(board, 4, 0, 'general', 'black'); put(board, 4, 5, 'rook', 'red')
    const game = createGame(board)
    const result = tryMove(game, { from: { x: 4, y: 5 }, to: { x: 3, y: 5 } })
    expect(result.ok).toBe(false)
    expect(legalMoves(board, 'red').some(move => move.from.x === 4 && move.from.y === 5 && move.to.x === 3)).toBe(false)
  })

  it('requires the checked side to respond and forbids leaving its general attacked', () => {
    const board = empty()
    put(board, 4, 9, 'general', 'red'); put(board, 3, 0, 'general', 'black')
    put(board, 4, 5, 'rook', 'black'); put(board, 0, 6, 'rook', 'red')
    expect(isInCheck(board, 'red')).toBe(true)
    expect(tryMove(createGame(board), { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } }).ok).toBe(false)
  })

  it('distinguishes checkmate from stalemate, both losses', () => {
    const board = empty()
    put(board, 4, 9, 'general', 'red'); put(board, 3, 0, 'general', 'black')
    put(board, 3, 8, 'rook', 'black'); put(board, 5, 8, 'rook', 'black')
    expect(evaluateOutcome(board, 'red', 0)).toEqual({ winner: 'black', reason: 'stalemate' })
    put(board, 4, 7, 'rook', 'black')
    expect(evaluateOutcome(board, 'red', 0)).toEqual({ winner: 'black', reason: 'checkmate' })
  })

  it('draws after 120 plies without a capture', () => {
    const game = createGame()
    game.noCapturePlies = 119
    const result = tryMove(game, { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    expect(result.ok && result.game.result).toEqual({ winner: null, reason: 'natural-limit' })
  })

  it('warns on a third occurrence without claiming an automatic draw', () => {
    const game = createGame()
    const next = createGame()
    next.board[5][0] = next.board[6][0]
    next.board[6][0] = null
    const key = positionKey(next.board, 'black')
    game.positionKeys = [positionKey(game.board, 'red'), key, key]
    const result = tryMove(game, { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    expect(result.ok && result.game.repetitionWarning).toBe(true)
    expect(result.ok && result.game.result).toBe(null)
  })

  it('explains a blocked horse leg when an attempted horse move is rejected', () => {
    const board = empty()
    put(board, 4, 9, 'general', 'red'); put(board, 3, 0, 'general', 'black')
    put(board, 1, 9, 'horse', 'red'); put(board, 1, 8, 'soldier', 'red')
    expect(tryMove(createGame(board), { from: { x: 1, y: 9 }, to: { x: 0, y: 7 } })).toEqual({ ok: false, error: '马腿被挡住' })
  })
})
