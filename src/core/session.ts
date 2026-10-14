import { createGame, tryMove } from './rules'
import type { Game } from './rules'
import { opposite } from './types'
import type { Move, Side } from './types'
import { coordinateMove, formatMove } from './notation'
import { normalizeNotes } from './review'

export type RecordItem = { move: Move; notation: string; coordinate: string; side: Side; captured: boolean; check: boolean }
export type SessionNotes = Record<string, string>
export type Session = { game: Game; snapshots: Game[]; records: RecordItem[]; viewIndex: number; mode: 'local' | 'ai'; playerSide: Side; drawOfferedBy: Side | null; notes?: SessionNotes }
export type PlayResult = { ok: true; session: Session } | { ok: false; error: string }

export function createSession(mode: 'local' | 'ai' = 'local', playerSide: Side = 'red'): Session {
  const game = createGame()
  return { game, snapshots: [game], records: [], viewIndex: 0, mode, playerSide, drawOfferedBy: null, notes: {} }
}
export function play(session: Session, move: Move): PlayResult {
  if (session.viewIndex !== session.records.length) return { ok: false, error: '请先返回当前局面，再继续走棋' }
  const result = tryMove(session.game, move)
  if (!result.ok) return result
  const record: RecordItem = {
    move, notation: formatMove(session.game.board, move), coordinate: coordinateMove(move),
    side: session.game.turn, captured: result.captured, check: result.check,
  }
  const records = [...session.records, record]
  const snapshots = [...session.snapshots, result.game]
  return {
    ok: true,
    session: { ...session, game: result.game, snapshots, records, viewIndex: records.length, drawOfferedBy: null },
  }
}

export function undo(session: Session): Session {
  if (session.records.length === 0) return session
  let target = session.records.length - 1
  if (session.mode === 'ai') {
    while (target >= 0 && session.snapshots[target].turn !== session.playerSide) target--
    if (target < 0) return session
  }
  const records = session.records.slice(0, target)
  const snapshots = session.snapshots.slice(0, target + 1)
  return { ...session, game: snapshots[target], records, snapshots, viewIndex: target, drawOfferedBy: null, notes: normalizeNotes(session.notes, target) }
}

export function setView(session: Session, index: number): Session {
  return { ...session, viewIndex: Math.max(0, Math.min(session.records.length, Math.trunc(index))) }
}

export function viewGame(session: Session): Game {
  return session.snapshots[session.viewIndex]
}

export function offerDraw(session: Session, side: Side): Session {
  if (session.mode !== 'local' || session.game.result) return session
  return { ...session, drawOfferedBy: side }
}

export function acceptDraw(session: Session, side: Side): Session {
  if (session.mode !== 'local' || session.drawOfferedBy !== opposite(side) || session.game.result) return session
  const game: Game = { ...session.game, result: { winner: null, reason: 'agreement' } }
  return { ...session, game, snapshots: [...session.snapshots.slice(0, -1), game], drawOfferedBy: null }
}

export function resign(session: Session, side: Side): Session {
  if (session.game.result) return session
  const game: Game = { ...session.game, result: { winner: opposite(side), reason: 'resignation' } }
  return { ...session, game, snapshots: [...session.snapshots.slice(0, -1), game], drawOfferedBy: null }
}
