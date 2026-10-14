import type { Board, Position } from './types'

export function inside(x: number, y: number): boolean {
  return x >= 0 && x < 9 && y >= 0 && y < 10
}

function palace(x: number, y: number, side: 'red' | 'black'): boolean {
  return x >= 3 && x <= 5 && (side === 'red' ? y >= 7 && y <= 9 : y >= 0 && y <= 2)
}

export function pseudoMoves(board: Board, from: Position): Position[] {
  if (!inside(from.x, from.y)) return []
  const piece = board[from.y][from.x]
  if (!piece) return []
  const result: Position[] = []
  const add = (x: number, y: number) => {
    if (inside(x, y) && board[y][x]?.side !== piece.side) result.push({ x, y })
  }
  const orthogonal = [[0, -1], [0, 1], [-1, 0], [1, 0]]

  switch (piece.type) {
    case 'general':
      for (const [dx, dy] of orthogonal) {
        const x = from.x + dx, y = from.y + dy
        if (palace(x, y, piece.side)) add(x, y)
      }
      break
    case 'advisor':
      for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
        const x = from.x + dx, y = from.y + dy
        if (palace(x, y, piece.side)) add(x, y)
      }
      break
    case 'elephant':
      for (const dx of [-2, 2]) for (const dy of [-2, 2]) {
        const x = from.x + dx, y = from.y + dy
        if (!inside(x, y) || (piece.side === 'red' ? y < 5 : y > 4)) continue
        if (!board[from.y + dy / 2][from.x + dx / 2]) add(x, y)
      }
      break
    case 'horse': {
      const steps = [
        { leg: [0, -1], target: [-1, -2] }, { leg: [0, -1], target: [1, -2] },
        { leg: [0, 1], target: [-1, 2] }, { leg: [0, 1], target: [1, 2] },
        { leg: [-1, 0], target: [-2, -1] }, { leg: [-1, 0], target: [-2, 1] },
        { leg: [1, 0], target: [2, -1] }, { leg: [1, 0], target: [2, 1] },
      ]
      for (const step of steps) {
        const [lx, ly] = step.leg
        const [tx, ty] = step.target
        if (inside(from.x + lx, from.y + ly) && !board[from.y + ly][from.x + lx]) {
          add(from.x + tx, from.y + ty)
        }
      }
      break
    }
    case 'rook':
    case 'cannon':
      for (const [dx, dy] of orthogonal) {
        let x = from.x + dx, y = from.y + dy, screens = 0
        while (inside(x, y)) {
          const target = board[y][x]
          if (piece.type === 'rook') {
            if (!target) result.push({ x, y })
            else {
              if (target.side !== piece.side) result.push({ x, y })
              break
            }
          } else if (screens === 0) {
            if (!target) result.push({ x, y })
            else screens = 1
          } else if (target) {
            if (target.side !== piece.side) result.push({ x, y })
            break
          }
          x += dx; y += dy
        }
      }
      break
    case 'soldier': {
      const forward = piece.side === 'red' ? -1 : 1
      add(from.x, from.y + forward)
      const crossed = piece.side === 'red' ? from.y <= 4 : from.y >= 5
      if (crossed) {
        add(from.x - 1, from.y)
        add(from.x + 1, from.y)
      }
      break
    }
  }
  return result
}
