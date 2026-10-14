import { describe, expect, it } from 'vitest'
import { createInitialBoard } from '../src/core/board'
import { formatMove, coordinateMove } from '../src/core/notation'
import type { Board } from '../src/core/types'

describe('Chinese move notation', () => {
  it('names red and black opening moves from each side’s perspective', () => {
    const board = createInitialBoard()
    expect(formatMove(board, { from: { x: 7, y: 7 }, to: { x: 4, y: 7 } })).toBe('炮二平五')
    expect(formatMove(board, { from: { x: 7, y: 0 }, to: { x: 6, y: 2 } })).toBe('马8进7')
    expect(formatMove(board, { from: { x: 0, y: 9 }, to: { x: 0, y: 8 } })).toBe('车九进一')
  })

  it('uses front and back for duplicate pieces on a file', () => {
    const board: Board = Array.from({ length: 10 }, () => Array(9).fill(null))
    board[4][0] = { side: 'red', type: 'rook' }
    board[8][0] = { side: 'red', type: 'rook' }
    expect(formatMove(board, { from: { x: 0, y: 4 }, to: { x: 0, y: 3 } })).toBe('前车进一')
    expect(formatMove(board, { from: { x: 0, y: 8 }, to: { x: 0, y: 9 } })).toBe('后车退一')
  })

  it('retains coordinates for review and copying', () => {
    expect(coordinateMove({ from: { x: 7, y: 7 }, to: { x: 4, y: 7 } })).toBe('(7,7)→(4,7)')
  })
})
