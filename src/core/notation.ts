import type { Board, Move, PieceType, Side } from './types'

const redNames: Record<PieceType, string> = {
  general: '帅', advisor: '仕', elephant: '相', horse: '马', rook: '车', cannon: '炮', soldier: '兵',
}
const blackNames: Record<PieceType, string> = {
  general: '将', advisor: '士', elephant: '象', horse: '马', rook: '车', cannon: '炮', soldier: '卒',
}
const numerals = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']

function number(side: Side, value: number): string {
  return side === 'red' ? numerals[value] : String(value)
}

function file(side: Side, x: number): number {
  return side === 'red' ? 9 - x : x + 1
}

export function coordinateMove(move: Move): string {
  return `(${move.from.x},${move.from.y})→(${move.to.x},${move.to.y})`
}

export function formatMove(board: Board, move: Move): string {
  const piece = board[move.from.y]?.[move.from.x]
  if (!piece) return coordinateMove(move)
  const name = piece.side === 'red' ? redNames[piece.type] : blackNames[piece.type]
  const sameFile: number[] = []
  for (let y = 0; y < 10; y++) {
    const other = board[y][move.from.x]
    if (other?.side === piece.side && other.type === piece.type) sameFile.push(y)
  }
  if (piece.side === 'black') sameFile.reverse()
  const rank = sameFile.indexOf(move.from.y)
  let prefix = `${name}${number(piece.side, file(piece.side, move.from.x))}`
  if (sameFile.length > 1) {
    const position = rank === 0 ? '前' : rank === sameFile.length - 1 ? '后' : sameFile.length === 3 ? '中' : number(piece.side, rank + 1)
    prefix = `${position}${name}`
  }
  if (move.from.y === move.to.y) {
    return `${prefix}平${number(piece.side, file(piece.side, move.to.x))}`
  }
  const advancing = piece.side === 'red' ? move.to.y < move.from.y : move.to.y > move.from.y
  const direction = advancing ? '进' : '退'
  const byFile = piece.type === 'horse' || piece.type === 'elephant' || piece.type === 'advisor'
  const end = byFile ? file(piece.side, move.to.x) : Math.abs(move.to.y - move.from.y)
  return `${prefix}${direction}${number(piece.side, end)}`
}
