import { describe, expect, it } from 'vitest'
import { captureDelta, goalStatus } from '../src/core/tactics-goals'
import { createGame, legalMoves, tryMove } from '../src/core/rules'
import type { Board } from '../src/core/types'

describe('bounded tactics goals', () => {
  it('counts only actual captured pieces with the puzzle scoring table', () => {
    expect(captureDelta({ side: 'black', type: 'rook' }, 'red')).toBe(9)
    expect(captureDelta({ side: 'red', type: 'horse' }, 'red')).toBe(-4)
    expect(captureDelta(null, 'red')).toBe(0)
    expect(captureDelta({ side: 'black', type: 'general' }, 'red')).toBe(0)
  })
  it('requires the final defense and rejects early terminal shortcuts and false mate', () => {
    const board: Board = Array.from({ length: 10 }, () => Array(9).fill(null))
    board[9][4] = { side: 'red', type: 'general' }; board[0][3] = { side: 'black', type: 'general' }
    const game = createGame(board)
    const state = { game, ownMoves: 2, plies: 3, score: 9, allChecking: true, secondCheck: true }
    expect(goalStatus('gain', 'red', state)).toBe('pending')
    expect(goalStatus('gain', 'red', { ...state, plies: 4 })).toBe('success')
    expect(goalStatus('gain', 'red', { ...state, plies: 4, score: 3 })).toBe('failure')
    expect(goalStatus('counter', 'red', { ...state, plies: 4, secondCheck: false })).toBe('failure')
    game.result = { winner: 'red', reason: 'stalemate' }
    expect(goalStatus('checks', 'red', state)).toBe('failure')
    game.result = { winner: 'red', reason: 'checkmate' }
    expect(goalStatus('checks', 'red', state)).toBe('success')
    expect(goalStatus('checks', 'red', { ...state, ownMoves: 4 })).toBe('failure')
    expect(goalStatus('gain', 'red', { ...state, plies: 4 })).toBe('failure')
  })
  it('subtracts a real final recapture before deciding whether material was gained', () => {
    const board: Board = Array.from({ length: 10 }, () => Array(9).fill(null))
    board[9][4] = { side: 'red', type: 'general' }; board[0][3] = { side: 'black', type: 'general' }
    board[5][5] = { side: 'red', type: 'horse' }; board[3][5] = { side: 'black', type: 'rook' }
    const result = tryMove(createGame(board, 'black'), { from: { x: 5, y: 3 }, to: { x: 5, y: 5 } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const score = 4 + captureDelta(board[5][5], 'red')
    expect(score).toBe(0)
    expect(goalStatus('gain', 'red', { game: result.game, ownMoves: 2, plies: 4, score, allChecking: false, secondCheck: false })).toBe('failure')
  })
  it('does not call a legally replayed stalemate a checking mate', () => {
    const board: Board = Array.from({ length: 10 }, () => Array(9).fill(null))
    board[9][4] = { side: 'red', type: 'general' }; board[0][3] = { side: 'black', type: 'general' }
    board[8][3] = { side: 'red', type: 'soldier' }
    board[7][3] = { side: 'black', type: 'rook' }; board[8][5] = { side: 'black', type: 'rook' }
    expect(legalMoves(board, 'red').length).toBeGreaterThan(0)
    const result = tryMove(createGame(board, 'black'), { from: { x: 3, y: 7 }, to: { x: 3, y: 8 } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.check).toBe(false)
    expect(result.game.result).toEqual({ winner: 'black', reason: 'stalemate' })
    expect(goalStatus('checks', 'black', { game: result.game, ownMoves: 2, plies: 3, score: 1, allChecking: true, secondCheck: false })).toBe('failure')
  })
})
