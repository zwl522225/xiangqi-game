import { describe, expect, it } from 'vitest'
import { cloneBoard, createInitialBoard } from '../src/core/board'

describe('standard board', () => {
  it('starts with 32 pieces in the correct places', () => {
    const board = createInitialBoard()
    expect(board).toHaveLength(10)
    expect(board.every(row => row.length === 9)).toBe(true)
    expect(board.flat().filter(piece => piece?.side === 'red')).toHaveLength(16)
    expect(board.flat().filter(piece => piece?.side === 'black')).toHaveLength(16)
    expect(board[9][4]).toEqual({ side: 'red', type: 'general' })
    expect(board[0][4]).toEqual({ side: 'black', type: 'general' })
    expect(board[7][1]).toEqual({ side: 'red', type: 'cannon' })
  })

  it('clones both rows and pieces', () => {
    const original = createInitialBoard()
    const copy = cloneBoard(original)
    copy[9][4] = null
    copy[0][0]!.type = 'soldier'
    expect(original[9][4]?.type).toBe('general')
    expect(original[0][0]?.type).toBe('rook')
  })
})
