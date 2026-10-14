import type { Board, PieceType, Side } from '../core/types'

type Placement = [number, number, Side, PieceType]

export function position(...pieces: Placement[]): Board {
  const board: Board = Array.from({ length: 10 }, () => Array(9).fill(null))
  for (const [x, y, side, type] of pieces) board[y][x] = { side, type }
  return board
}

export const captureBoard = position(
  [4, 9, 'red', 'general'], [3, 0, 'black', 'general'],
  [4, 5, 'red', 'rook'], [4, 3, 'black', 'rook'],
)

export const defendBoard = position(
  [4, 9, 'red', 'general'], [3, 0, 'black', 'general'],
  [4, 5, 'black', 'rook'], [0, 8, 'red', 'rook'],
)

export const mateBoard = position(
  [4, 9, 'red', 'general'], [4, 0, 'black', 'general'],
  [5, 0, 'black', 'rook'], [3, 1, 'red', 'rook'], [4, 2, 'red', 'rook'],
)

export const stalemateBoard = position(
  [3, 9, 'red', 'general'], [4, 0, 'black', 'general'],
  [3, 2, 'red', 'rook'], [5, 1, 'red', 'rook'],
)

export const cannonBoard = position(
  [4, 9, 'red', 'general'], [3, 0, 'black', 'general'],
  [1, 5, 'red', 'cannon'], [3, 5, 'black', 'soldier'], [5, 5, 'black', 'rook'],
)
