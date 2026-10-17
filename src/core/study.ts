import { archiveSession, checkSessionOrigin } from './archive-codec'
import type { ArchivedGame, Result } from './archive-codec'
import { inferLegacyStart, sameGame } from './archive-origin'
import { normalizeNotes } from './review'
import { createGame, tryMove } from './rules'
import { createSession, play, undo } from './session'
import type { Session } from './session'
import type { Move, Side } from './types'

export type StudySource = { kind: 'match' | 'collection' | 'file'; title: string; ply: number }
export type Study = { source: StudySource; orientation: Side; session: Session }
export type StudyOrigin = { kind: StudySource['kind']; title: string; orientation: Side }
export const MAX_STUDY_PLIES = 600

function reject(message: string): never { throw new Error(message) }
function safe<T>(operation: () => T): Result<T> {
  try { return { ok: true, value: operation() } }
  catch (error) {
    return { ok: false, error: error instanceof Error && /[\u4e00-\u9fff]/.test(error.message) ? error.message : '试走来源数据不完整，无法读取' }
  }
}
function unwrap<T>(result: Result<T>): T { return result.ok ? result.value : reject(result.error) }

/** Prove only the selected prefix; the source's later game is deliberately irrelevant. */
export function createStudy(source: Session, origin: StudyOrigin): Result<Study> {
  return safe(() => {
    if (!origin || !['match', 'collection', 'file'].includes(origin.kind)) reject('试走来源类型不正确')
    if (typeof origin.title !== 'string' || !origin.title.trim() || origin.title.trim().length > 40) reject('来源标题须为1至40字')
    if (origin.orientation !== 'red' && origin.orientation !== 'black') reject('棋盘朝向不正确')
    if (!source || !Array.isArray(source.records) || !Array.isArray(source.snapshots)) reject('来源棋局历史或快照不完整')
    const selected = source.viewIndex
    if (!Number.isInteger(selected) || selected < 0 || selected > source.records.length || source.snapshots.length <= selected) reject('请选择有效的复盘位置')
    // Manual endings are absent from move replay, so refuse the selected terminal
    // snapshot before comparing it with a replayed nonterminal rule state.
    if (source.snapshots[selected]?.result) reject('所选局面已结束，请选择更早的位置')
    let startMoves: Move[]
    if (Object.hasOwn(source, 'origin')) {
      startMoves = unwrap(checkSessionOrigin(source.origin)).startMoves
    } else {
      const inferred = inferLegacyStart(source.snapshots[0])
      if (inferred === null) reject('无法证明起始局面的真实历史；仅支持标准开局和已知棋路前缀')
      // Normalize and copy legacy content moves with the same coordinate validation.
      startMoves = unwrap(checkSessionOrigin({ version: 1, startMoves: inferred })).startMoves
    }
    if (startMoves.length + selected >= MAX_STUDY_PLIES) reject('来源位置已达试走着数上限，请选择更早的位置')
    const selectedMoves: Move[] = []
    for (let index = 0; index < selected; index++) selectedMoves.push(source.records[index]?.move)
    const moves = unwrap(checkSessionOrigin({ version: 1, startMoves: selectedMoves })).startMoves
    let game = createGame()
    for (let index = 0; index < startMoves.length; index++) {
      const next = tryMove(game, startMoves[index])
      if (!next.ok) reject(`第${index + 1}着起始着法无效：${next.error}`)
      game = next.game
    }
    if (!sameGame(source.snapshots[0], game)) reject('起始快照与真实历史不符')
    for (let index = 0; index < moves.length; index++) {
      const next = tryMove(game, moves[index])
      if (!next.ok) reject(`本局第${index + 1}着无效：${next.error}`)
      game = next.game
      if (!sameGame(source.snapshots[index + 1], game)) reject(`本局第${index + 1}着的快照与真实历史不符`)
    }
    if (game.result) reject('所选局面已结束，请选择更早的位置')
    const session: Session = {
      ...createSession(), game, snapshots: [game],
      origin: { version: 1, startMoves: [...startMoves, ...moves] },
    }
    return { source: { kind: origin.kind, title: origin.title.trim(), ply: selected }, orientation: origin.orientation, session }
  })
}

export function playStudy(study: Study, move: Move): Result<Study> {
  return safe(() => {
    if ((study.session.origin?.startMoves.length ?? 0) + study.session.records.length >= MAX_STUDY_PLIES) reject('试走已达600着上限，请悔棋或选择更早的位置')
    const copied = unwrap(checkSessionOrigin({ version: 1, startMoves: [move] })).startMoves[0]
    const next = play(study.session, copied)
    if (!next.ok) reject(next.error)
    return { ...study, session: next.session }
  })
}

export function undoStudy(study: Study): Study {
  const session = undo(study.session)
  return session === study.session ? study : { ...study, session }
}

export function resetStudy(study: Study): Study {
  return {
    ...study,
    session: { ...study.session, game: study.session.snapshots[0], snapshots: [study.session.snapshots[0]], records: [], viewIndex: 0, notes: {}, drawOfferedBy: null },
  }
}

export function truncateStudy(study: Study): Study {
  const { session } = study
  if (session.viewIndex === session.records.length) return study
  const index = session.viewIndex
  return {
    ...study,
    session: { ...session, game: session.snapshots[index], snapshots: session.snapshots.slice(0, index + 1), records: session.records.slice(0, index), notes: normalizeNotes(session.notes, index), drawOfferedBy: null },
  }
}

export function archiveStudy(study: Study, title: string): Result<ArchivedGame> {
  if (study.session.records.length < 1) return { ok: false, error: '请至少试走一着再保存收藏' }
  return archiveSession(study.session, title)
}
