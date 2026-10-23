import type { Session } from './session'

/** Local restore bookkeeping, not a signature or a game validator.
 * Session is already validated by storage/the rules engine. Include every move;
 * review position and notes are deliberately outside the played-game identity.
 */
export function terminalMatchKey(session: Session): string | null {
  const result = session.game.result
  if (!result) return null
  const first = session.snapshots[0]
  return JSON.stringify([1, session.mode, session.playerSide,
    first.board.map(row => row.map(piece => piece ? [piece.side, piece.type] : null)), first.turn,
    session.records.map(({ move }) => [move.from.x, move.from.y, move.to.x, move.to.y]),
    [result.winner, result.reason]])
}
