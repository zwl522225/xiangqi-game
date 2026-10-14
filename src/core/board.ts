import type { Board, PieceType, Side } from './types'

const backRank: PieceType[] = [
  'rook', 'horse', 'elephant', 'advisor', 'general', 'advisor', 'elephant', 'horse', 'rook',
]

function place(board: Board, x: number, y: number, side: Side, type: PieceType) {
  board[y][x] = { side, type }
}

export function createInitialBoard(): Board {
  const board: Board = Array.from({ length: 10 }, () => Array(9).fill(null))
  for (let x = 0; x < 9; x++) {
    place(board, x, 0, 'black', backRank[x])
    place(board, x, 9, 'red', backRank[x])
  }
  for (const x of [1, 7]) {
    place(board, x, 2, 'black', 'cannon')
    place(board, x, 7, 'red', 'cannon')
  }
  for (const x of [0, 2, 4, 6, 8]) {
    place(board, x, 3, 'black', 'soldier')
    place(board, x, 6, 'red', 'soldier')
  }
  return board
}

export function cloneBoard(board: Board): Board {
  return board.map(row => row.map(piece => piece ? { ...piece } : null))
}
