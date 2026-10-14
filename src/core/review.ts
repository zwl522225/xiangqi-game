import { formatMove } from './notation'
import { tryMove } from './rules'
import type { Outcome } from './rules'
import type { Session, SessionNotes } from './session'
import type { Piece, Position, Side } from './types'

export type MoveDescription = {
  index: number
  side: Side
  piece: Piece
  from: Position
  to: Position
  notation: string
  captured: Piece | null
  check: boolean
  outcome: Outcome | null
}

const validIndex = (index: number, count: number) => Number.isInteger(index) && index >= 1 && index <= count

export function normalizeNotes(value: unknown, count: number): SessionNotes {
  const notes: SessionNotes = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return notes
  for (const [key, text] of Object.entries(value)) {
    const index = Number(key)
    if (String(index) === key && validIndex(index, count) && typeof text === 'string' && text.length > 0 && text.length <= 500) notes[key] = text
  }
  return notes
}

export function setNote(session: Session, index: number, text: string): Session {
  if (!validIndex(index, session.records.length)) return session
  const notes = normalizeNotes(session.notes, session.records.length)
  const capped = text.slice(0, 500)
  if (capped) notes[String(index)] = capped
  else delete notes[String(index)]
  return { ...session, notes }
}

export function describeMove(session: Session, index: number): MoveDescription | null {
  if (!validIndex(index, session.records.length)) return null
  const before = session.snapshots[index - 1]
  const after = session.snapshots[index]
  const record = session.records[index - 1]
  if (!before || !after || !record?.move) return null
  // Replay the real move; stored captions and flags are not evidence of its effects.
  try {
    const result = tryMove(before, record.move)
    if (!result.ok) return null
    const actual = result.game
    const actualOutcome = actual.result, storedOutcome = after.result
    if (actual.turn !== after.turn || actual.noCapturePlies !== after.noCapturePlies || actual.repetitionWarning !== after.repetitionWarning ||
      actual.positionKeys.length !== after.positionKeys.length || actual.positionKeys.some((key, ply) => key !== after.positionKeys[ply]) ||
      actual.board.length !== after.board.length || actual.board.some((row, y) => row.length !== after.board[y]?.length || row.some((piece, x) => {
        const storedPiece = after.board[y][x]
        return piece?.side !== storedPiece?.side || piece?.type !== storedPiece?.type
      }))) return null
    const externalEnd = index === session.records.length && !actualOutcome &&
      (storedOutcome?.reason === 'resignation' || storedOutcome?.reason === 'agreement')
    if (!externalEnd && (actualOutcome?.reason !== storedOutcome?.reason || actualOutcome?.winner !== storedOutcome?.winner)) return null
    const { from, to } = record.move
    const piece = before.board[from.y][from.x]
    if (!piece) return null
    return {
      index, side: piece.side, piece: { ...piece }, from: { ...from }, to: { ...to },
      notation: formatMove(before.board, record.move), captured: before.board[to.y][to.x] ? { ...before.board[to.y][to.x]! } : null,
      check: result.check, outcome: actualOutcome ? { ...actualOutcome } : null,
    }
  } catch { return null }
}
