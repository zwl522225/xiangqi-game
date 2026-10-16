import { inferLegacyStart, sameGame } from './archive-origin'
import { createGame, tryMove } from './rules'
import { acceptDraw, createSession, offerDraw, play, resign } from './session'
import type { Session, SessionNotes } from './session'
import type { Move, Position, Side } from './types'

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
export type ArchivedGame = {
  format: 'yixiang-game'
  version: 1
  title: string
  startMoves: Move[]
  moves: Move[]
  ending: null | { reason: 'resignation'; side: Side } | { reason: 'agreement' }
  notes?: SessionNotes
}
export type InspectedArchive = { archive: ArchivedGame; session: Session }
export const MAX_GAME_FILE_BYTES = 512 * 1024
const MAX_PLIES = 600

function reject(message: string): never { throw new Error(message) }
function safe<T>(operation: () => T): Result<T> {
  try { return { ok: true, value: operation() } }
  catch (error) { return { ok: false, error: error instanceof Error && /[\u4e00-\u9fff]/.test(error.message) ? error.message : '棋局数据格式不正确，无法读取' } }
}
function unwrap<T>(result: Result<T>): T { return result.ok ? result.value : reject(result.error) }

function object(value: unknown, allowed: string[], required = allowed): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) reject('棋局字段必须是对象')
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) reject('棋局对象来源不合法')
  const keys = Reflect.ownKeys(value)
  if (keys.some(key => typeof key !== 'string' || !allowed.includes(key))) reject('棋局含有不支持的字段')
  if (required.some(key => !Object.hasOwn(value, key))) reject('棋局缺少必要字段')
  if (keys.some(key => !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'))) reject('棋局字段不能是访问器')
  return value as Record<string, unknown>
}
function position(value: unknown): Position {
  const item = object(value, ['x', 'y'])
  if (!Number.isInteger(item.x) || !Number.isInteger(item.y) || (item.x as number) < 0 || (item.x as number) > 8 || (item.y as number) < 0 || (item.y as number) > 9) reject('棋盘坐标必须是范围内的整数')
  return { x: item.x as number, y: item.y as number }
}
function moveList(value: unknown): Move[] {
  if (!Array.isArray(value) || value.length > MAX_PLIES) reject('着法必须是数组，且最多600着')
  return Array.from(value, entry => {
    const item = object(entry, ['from', 'to'])
    return { from: position(item.from), to: position(item.to) }
  })
}
function notes(value: unknown, length: number): SessionNotes {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) reject('笔记必须是对象')
  const keys = Reflect.ownKeys(value)
  if (keys.length > length) reject('笔记索引超出本局着法范围')
  const item = object(value, keys.filter((key): key is string => typeof key === 'string'))
  const result: SessionNotes = {}
  for (const key of keys) {
    if (typeof key !== 'string' || !/^[1-9]\d*$/.test(key) || Number(key) > length) reject('笔记索引必须是本局1至末着的整数')
    const text = item[key]
    if (typeof text !== 'string' || !text.trim() || text.length > 500) reject('每条笔记须为1至500字的非空文本')
    result[key] = text
  }
  return result
}
function ending(value: unknown): ArchivedGame['ending'] {
  if (value === null) return null
  // Read reason only after rejecting accessors and unknown keys.
  const item = object(value, ['reason', 'side'], ['reason'])
  if (item.reason === 'agreement') {
    object(value, ['reason'])
    return { reason: 'agreement' }
  }
  if (item.reason === 'resignation' && (item.side === 'red' || item.side === 'black')) return { reason: 'resignation', side: item.side }
  reject('结局只接受明确认输或双方议和；自动结果须由规则计算')
}

function canonical(value: unknown, includeNotes: boolean): ArchivedGame {
  const item = object(value, ['format', 'version', 'title', 'startMoves', 'moves', 'ending', 'notes'], ['format', 'version', 'title', 'startMoves', 'moves', 'ending'])
  if (item.format !== 'yixiang-game' || item.version !== 1) reject('不支持的棋局格式或版本')
  if (typeof item.title !== 'string' || !item.title.trim() || item.title.trim().length > 40) reject('标题须为1至40字')
  const startMoves = moveList(item.startMoves), moves = moveList(item.moves)
  if (startMoves.length + moves.length < 1 || startMoves.length + moves.length > MAX_PLIES) reject('起始着法与本局着法合计须为1至600着')
  const result: ArchivedGame = { format: 'yixiang-game', version: 1, title: item.title.trim(), startMoves, moves, ending: ending(item.ending) }
  if (includeNotes && Object.hasOwn(item, 'notes')) result.notes = notes(item.notes, moves.length)
  return result
}

/** Cheap, bounded structure validation only; it deliberately does not replay moves. */
export function checkArchiveShape(value: unknown): Result<ArchivedGame> { return safe(() => canonical(value, true)) }

/** Origin metadata is normalized without replaying it when restoring an existing session. */
export function checkSessionOrigin(value: unknown): Result<NonNullable<Session['origin']>> {
  return safe(() => {
    const origin = object(value, ['version', 'startMoves'])
    if (origin.version !== 1) reject('起始来源版本不受支持')
    return { version: 1, startMoves: moveList(origin.startMoves) }
  })
}

export function inspectArchive(value: unknown): Result<InspectedArchive> {
  return safe(() => {
    const archive = canonical(value, true)
    let game = createGame()
    for (let index = 0; index < archive.startMoves.length; index++) {
      const result = tryMove(game, archive.startMoves[index])
      if (!result.ok) reject(`第${index + 1}着（起始着法）无效：${result.error}`)
      game = result.game
    }
    let session: Session = { ...createSession(), game, snapshots: [game], origin: { version: 1, startMoves: archive.startMoves }, notes: archive.notes ? { ...archive.notes } : {} }
    for (let index = 0; index < archive.moves.length; index++) {
      const result = play(session, archive.moves[index])
      if (!result.ok) reject(`第${archive.startMoves.length + index + 1}着（本局第${index + 1}着）无效：${result.error}`)
      session = result.session
    }
    if (archive.ending) {
      if (session.game.result) reject('棋局已由规则判定结束，不能再声明认输或议和')
      session = archive.ending.reason === 'resignation' ? resign(session, archive.ending.side) : acceptDraw(offerDraw(session, 'red'), 'black')
    }
    return { archive, session }
  })
}

export function readGameFile(text: string): Result<InspectedArchive> {
  return safe(() => {
    if (typeof text !== 'string' || text.length > MAX_GAME_FILE_BYTES || new TextEncoder().encode(text).length > MAX_GAME_FILE_BYTES) reject('棋局文件不能超过512KiB')
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { reject('棋局文件不是有效的JSON文本') }
    return unwrap(inspectArchive(parsed))
  })
}

/** Exporting without notes never validates or copies the excluded note payload. */
export function writeGameFile(archive: ArchivedGame, includeNotes = false): Result<string> {
  return safe(() => {
    const selected = canonical(archive, includeNotes)
    const text = JSON.stringify(selected)
    if (new TextEncoder().encode(text).length > MAX_GAME_FILE_BYTES) reject('导出的棋局文件不能超过512KiB，请减少笔记或选择不含笔记')
    unwrap(inspectArchive(selected))
    return text
  })
}

export function archiveSession(session: Session, title: string): Result<ArchivedGame> {
  return safe(() => {
    if (!session || !Array.isArray(session.records) || !Array.isArray(session.snapshots) || session.records.length > MAX_PLIES || session.snapshots.length !== session.records.length + 1) reject('棋局历史或快照不完整')
    let startMoves: Move[]
    if (Object.hasOwn(session, 'origin')) {
      startMoves = unwrap(checkSessionOrigin(session.origin)).startMoves
    } else {
      const first = session.snapshots[0]
      const onlyManualEnding = session.records.length === 0 && (first?.result?.reason === 'resignation' || first?.result?.reason === 'agreement')
      const inferred = inferLegacyStart(onlyManualEnding ? { ...first, result: null } : first)
      if (inferred === null) reject('无法证明起始局面的真实历史；仅支持标准开局和已知棋路前缀')
      startMoves = inferred
    }
    const outcome = session.game.result
    let declared: ArchivedGame['ending'] = null
    if (outcome?.reason === 'resignation') {
      if (outcome.winner !== 'red' && outcome.winner !== 'black') reject('认输结局的胜方无效')
      declared = { reason: 'resignation', side: outcome.winner === 'red' ? 'black' : 'red' }
    } else if (outcome?.reason === 'agreement') {
      if (outcome.winner !== null) reject('议和不能指定胜方')
      declared = { reason: 'agreement' }
    }
    const archive = canonical({ format: 'yixiang-game', version: 1, title, startMoves, moves: session.records.map(record => record.move), ending: declared, ...(session.notes === undefined ? {} : { notes: session.notes }) }, true)
    const replay = unwrap(inspectArchive(archive)).session
    for (let index = 0; index < replay.snapshots.length; index++) {
      if (!sameGame(session.snapshots[index], replay.snapshots[index])) reject(`本局第${index}着的快照与真实历史不符`)
    }
    if (!sameGame(session.game, replay.game)) reject('当前棋局与真实历史不符')
    return archive
  })
}
