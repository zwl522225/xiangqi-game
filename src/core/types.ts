export type Side = 'red' | 'black'
export type PieceType = 'general' | 'advisor' | 'elephant' | 'horse' | 'rook' | 'cannon' | 'soldier'
export type Piece = { side: Side; type: PieceType }
export type Board = (Piece | null)[][]
export type Position = { x: number; y: number }
export type Move = { from: Position; to: Position }

export function opposite(side: Side): Side {
  return side === 'red' ? 'black' : 'red'
}

export function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y
}
