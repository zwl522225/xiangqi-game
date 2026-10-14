import { cloneBoard, createInitialBoard } from './board'
import { inside, pseudoMoves } from './moves'
import { opposite, samePosition } from './types'
import type { Board, Move, Position, Side } from './types'

export type Outcome = {
  winner: Side | null
  reason: 'checkmate' | 'stalemate' | 'natural-limit' | 'resignation' | 'agreement'
}

export type Game = {
  board: Board
  turn: Side
  noCapturePlies: number
  positionKeys: string[]
  repetitionWarning: boolean
  result: Outcome | null
}

export type MoveResult = { ok: true; game: Game; captured: boolean; check: boolean } | { ok: false; error: string }

export function createGame(board: Board = createInitialBoard(), turn: Side = 'red'): Game {
  const copy = cloneBoard(board)
  return {
    board: copy,
    turn,
    noCapturePlies: 0,
    positionKeys: [positionKey(copy, turn)],
    repetitionWarning: false,
    result: null,
  }
}

export function positionKey(board: Board, turn: Side): string {
  return `${turn}:${board.map(row => row.map(piece => piece ? `${piece.side[0]}${piece.type[0]}` : '..').join('')).join('/')}`
}

function generalAt(board: Board, side: Side): Position | null {
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) {
    const piece = board[y][x]
    if (piece?.side === side && piece.type === 'general') return { x, y }
  }
  return null
}

export function generalsFacing(board: Board): boolean {
  const red = generalAt(board, 'red')
  const black = generalAt(board, 'black')
  if (!red || !black || red.x !== black.x) return false
  for (let y = black.y + 1; y < red.y; y++) if (board[y][red.x]) return false
  return true
}

export function isInCheck(board: Board, side: Side): boolean {
  const general = generalAt(board, side)
  if (!general) return true
  if (generalsFacing(board)) return true
  const attacker = opposite(side)
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) {
    if (board[y][x]?.side !== attacker) continue
    if (pseudoMoves(board, { x, y }).some(target => samePosition(target, general))) return true
  }
  return false
}

export function moveBoard(board: Board, move: Move): Board {
  const next = cloneBoard(board)
  next[move.to.y][move.to.x] = next[move.from.y][move.from.x]
  next[move.from.y][move.from.x] = null
  return next
}

export function legalMoves(board: Board, side: Side): Move[] {
  const moves: Move[] = []
  if (!generalAt(board, side)) return moves
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) {
    if (board[y][x]?.side !== side) continue
    const from = { x, y }
    for (const to of pseudoMoves(board, from)) {
      if (board[to.y][to.x]?.type === 'general') continue
      const move = { from, to }
      if (!isInCheck(moveBoard(board, move), side)) moves.push(move)
    }
  }
  return moves
}

export function evaluateOutcome(board: Board, turn: Side, noCapturePlies: number): Outcome | null {
  if (legalMoves(board, turn).length === 0) {
    return { winner: opposite(turn), reason: isInCheck(board, turn) ? 'checkmate' : 'stalemate' }
  }
  if (noCapturePlies >= 120) return { winner: null, reason: 'natural-limit' }
  return null
}

export function tryMove(game: Game, move: Move): MoveResult {
  if (game.result) return { ok: false, error: '棋局已结束，请开始新局' }
  const { from, to } = move
  if (!inside(from.x, from.y) || !inside(to.x, to.y)) return { ok: false, error: '落点不在棋盘上' }
  const piece = game.board[from.y][from.x]
  if (!piece) return { ok: false, error: '起点没有棋子' }
  if (piece.side !== game.turn) return { ok: false, error: '还没轮到这一方走棋' }
  if (!pseudoMoves(game.board, from).some(target => samePosition(target, to)) || game.board[to.y][to.x]?.type === 'general') {
    const dx = to.x - from.x, dy = to.y - from.y
    if (piece.type === 'horse' && ((Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1))) {
      const leg = Math.abs(dx) === 2 ? game.board[from.y][from.x + Math.sign(dx)] : game.board[from.y + Math.sign(dy)][from.x]
      if (leg) return { ok: false, error: '马腿被挡住' }
    }
    if (piece.type === 'elephant' && Math.abs(dx) === 2 && Math.abs(dy) === 2 && game.board[from.y + dy / 2][from.x + dx / 2]) {
      return { ok: false, error: '象眼被堵住' }
    }
    return { ok: false, error: '这枚棋子不能走到这里，请查看走法提示' }
  }
  const board = moveBoard(game.board, move)
  if (isInCheck(board, game.turn)) {
    return { ok: false, error: generalsFacing(board) ? '走后帅将会直接照面' : isInCheck(game.board, game.turn) ? '正在被将军，必须先应将' : '走后己方将帅会受到攻击' }
  }
  const captured = Boolean(game.board[to.y][to.x])
  const noCapturePlies = captured ? 0 : game.noCapturePlies + 1
  const turn = opposite(game.turn)
  const key = positionKey(board, turn)
  const positionKeys = [...game.positionKeys, key]
  return {
    ok: true,
    captured,
    check: isInCheck(board, turn),
    game: {
      board, turn, noCapturePlies, positionKeys,
      repetitionWarning: positionKeys.filter(previous => previous === key).length >= 3,
      result: evaluateOutcome(board, turn, noCapturePlies),
    },
  }
}
