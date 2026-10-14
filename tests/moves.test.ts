import { describe, expect, it } from 'vitest'
import { pseudoMoves } from '../src/core/moves'
import type { Board, PieceType, Position, Side } from '../src/core/types'

const empty = (): Board => Array.from({ length: 10 }, () => Array(9).fill(null))
function put(board: Board, x: number, y: number, type: PieceType, side: Side = 'red') {
  board[y][x] = { type, side }
}
function has(moves: Position[], x: number, y: number) {
  return moves.some(move => move.x === x && move.y === y)
}

describe('piece movement', () => {
  it('rook stops at blockers and may capture the first enemy', () => {
    const board = empty()
    put(board, 4, 5, 'rook'); put(board, 4, 3, 'soldier'); put(board, 7, 5, 'soldier', 'black')
    const moves = pseudoMoves(board, { x: 4, y: 5 })
    expect(has(moves, 4, 4)).toBe(true)
    expect(has(moves, 4, 3)).toBe(false)
    expect(has(moves, 4, 2)).toBe(false)
    expect(has(moves, 7, 5)).toBe(true)
    expect(has(moves, 8, 5)).toBe(false)
  })

  it('cannon needs exactly one screen to capture', () => {
    const board = empty()
    put(board, 4, 5, 'cannon'); put(board, 4, 2, 'rook', 'black')
    expect(has(pseudoMoves(board, { x: 4, y: 5 }), 4, 2)).toBe(false)
    put(board, 4, 4, 'soldier')
    expect(has(pseudoMoves(board, { x: 4, y: 5 }), 4, 2)).toBe(true)
    put(board, 4, 3, 'soldier')
    expect(has(pseudoMoves(board, { x: 4, y: 5 }), 4, 2)).toBe(false)
  })

  it('horse cannot step past an occupied leg', () => {
    const board = empty()
    put(board, 4, 5, 'horse'); put(board, 4, 4, 'soldier')
    expect(has(pseudoMoves(board, { x: 4, y: 5 }), 3, 3)).toBe(false)
    expect(has(pseudoMoves(board, { x: 4, y: 5 }), 6, 4)).toBe(true)
  })

  it('elephant cannot cross the river or jump an occupied eye', () => {
    const board = empty()
    put(board, 4, 7, 'elephant')
    expect(has(pseudoMoves(board, { x: 4, y: 7 }), 2, 5)).toBe(true)
    put(board, 3, 6, 'soldier', 'black')
    expect(has(pseudoMoves(board, { x: 4, y: 7 }), 2, 5)).toBe(false)
    put(board, 4, 5, 'elephant')
    expect(has(pseudoMoves(board, { x: 4, y: 5 }), 2, 3)).toBe(false)
  })

  it('advisor and general stay in their palace', () => {
    const board = empty()
    put(board, 3, 9, 'advisor'); put(board, 4, 7, 'general')
    expect(pseudoMoves(board, { x: 3, y: 9 })).toEqual([{ x: 4, y: 8 }])
    expect(has(pseudoMoves(board, { x: 4, y: 7 }), 4, 6)).toBe(false)
  })

  it('soldier gains sideways movement after crossing but never retreats', () => {
    const board = empty()
    put(board, 4, 6, 'soldier'); put(board, 6, 4, 'soldier')
    expect(pseudoMoves(board, { x: 4, y: 6 })).toEqual([{ x: 4, y: 5 }])
    const moves = pseudoMoves(board, { x: 6, y: 4 })
    expect(has(moves, 5, 4) && has(moves, 7, 4) && has(moves, 6, 3)).toBe(true)
    expect(has(moves, 6, 5)).toBe(false)
  })
})
