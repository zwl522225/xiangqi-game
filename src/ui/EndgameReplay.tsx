import type { EndgameLesson } from '../content/endgames'
import { endgamePosition } from '../core/endgame-lessons'
import { createSession, play, type Session } from '../core/session'

/** A view-local replay. Counts begin at the lesson setup, including a branch's real prefix. */
export function endgameReplay(lesson: EndgameLesson, ply: number, defense = false): Session {
  const game = endgamePosition(lesson, 0)
  let session: Session = { ...createSession(), game, snapshots: [game], playerSide: lesson.side }
  const moves = defense && lesson.defense
    ? [...lesson.line.slice(0, lesson.defense.fromPly), ...lesson.defense.moves.slice(0, ply)]
    : lesson.line.slice(0, ply)
  for (const move of moves) {
    const next = play(session, move)
    if (!next.ok) throw Error('残局只读路线无法重放')
    session = next.session
  }
  return session
}

export function EndgamePlayedLine({ session, explanations }: { session: Session; explanations: string[] }) {
  return <ol className="endgame-played-line" aria-label="实际已走路线">{session.records.map((record, index) =>
    <li key={index}>{record.notation}：{explanations[index]}{record.check ? '（实际将军）' : ''}</li>)}</ol>
}
