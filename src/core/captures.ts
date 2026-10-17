import { describeMove } from './review'
import type { Game } from './rules'
import type { Session } from './session'
import type { PieceType, Side } from './types'

export type CaptureCounts = Record<Side, Record<PieceType, number>>
export type CaptureFrame = { ok: true; lost: CaptureCounts } | { ok: false; error: string }
export type CaptureTimeline = CaptureFrame[]

const pieceTypes: PieceType[] = ['general', 'advisor', 'elephant', 'horse', 'rook', 'cannon', 'soldier']
const zeroSide = (): Record<PieceType, number> => ({ general: 0, advisor: 0, elephant: 0, horse: 0, rook: 0, cannon: 0, soldier: 0 })
const unknownFrame = (): CaptureFrame => ({ ok: false, error: '本段吃子记录暂无法核对' })

// Validate every snapshot before replay: an invalid object in an empty square
// must not be mistaken for an empty cell or a captured piece.
function validSnapshot(game: Game | undefined): boolean {
  return Boolean(game && (game.turn === 'red' || game.turn === 'black') &&
    Number.isInteger(game.noCapturePlies) && game.noCapturePlies >= 0 &&
    typeof game.repetitionWarning === 'boolean' &&
    Array.isArray(game.positionKeys) && game.positionKeys.length > 0 &&
    Array.from(game.positionKeys).every(key => typeof key === 'string') &&
    (game.result === null || (game.result &&
      ['checkmate', 'stalemate', 'natural-limit', 'resignation', 'agreement'].includes(game.result.reason) &&
      (game.result.winner === null || game.result.winner === 'red' || game.result.winner === 'black'))) &&
    Array.isArray(game.board) && game.board.length === 10 && Array.from(game.board).every(row =>
      Array.isArray(row) && row.length === 9 && Array.from(row).every(piece => piece === null ||
        (piece && (piece.side === 'red' || piece.side === 'black') && pieceTypes.includes(piece.type)))))
}

export function buildCaptureTimeline(session: Session): CaptureTimeline {
  const count = Array.isArray(session?.records) ? session.records.length : 0
  if (!Array.isArray(session?.records) || !Array.isArray(session.snapshots) ||
    session.snapshots.length !== count + 1 || !validSnapshot(session.snapshots[0])) {
    return Array.from({ length: count + 1 }, unknownFrame)
  }
  // Only local records count, even when archive startMoves already lost pieces.
  const frames: CaptureTimeline = [{ ok: true, lost: { red: zeroSide(), black: zeroSide() } }]
  for (let index = 1; index <= count; index++) {
    const previous = frames[index - 1]
    // Once a prefix cannot be proved, no later total can be complete.
    const description = previous.ok && validSnapshot(session.snapshots[index]) ? describeMove(session, index) : null
    if (!previous.ok || !description) {
      frames.push(unknownFrame())
      continue
    }
    const lost: CaptureCounts = { red: { ...previous.lost.red }, black: { ...previous.lost.black } }
    const captured = description.captured
    if (captured) lost[captured.side][captured.type]++
    frames.push({ ok: true, lost })
  }
  return frames
}
