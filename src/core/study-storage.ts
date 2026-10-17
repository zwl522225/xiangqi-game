import { createGame, tryMove } from './rules'
import { createSession, play } from './session'
import type { Session, SessionNotes } from './session'
import { MAX_STUDY_PLIES } from './study'
import type { Study, StudySource } from './study'
import type { Move, Position, Side } from './types'

export type StudyStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
export type StudyLoad = { study: Study | null; error: string }
export const MAX_STUDY_BYTES = 512 * 1024
const KEY = 'xiangqi-study'
type Draft = {
  source: StudySource
  orientation: Side
  startMoves: Move[]
  moves: Move[]
  notes: SessionNotes
  viewIndex: number
}

function reject(message: string): never { throw new Error(message) }

function object(value: unknown, allowed: string[], required = allowed): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) reject('试走字段必须是对象')
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) reject('试走对象来源不合法')
  const keys = Reflect.ownKeys(value)
  if (keys.some(key => typeof key !== 'string' || !allowed.includes(key))) reject('试走含有不支持的字段')
  if (required.some(key => !Object.hasOwn(value, key))) reject('试走缺少必要字段')
  if (keys.some(key => !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'))) reject('试走字段不能是访问器')
  return value as Record<string, unknown>
}

function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) reject('试走着法数组超出允许范围')
  const keys = Reflect.ownKeys(value)
  if (keys.length !== value.length + 1 || keys.some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) reject('试走数组不能缺项或含额外字段')
  if (keys.some(key => !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'))) reject('试走数组不能含访问器')
  return value
}

function position(value: unknown): Position {
  const item = object(value, ['x', 'y'])
  if (!Number.isInteger(item.x) || !Number.isInteger(item.y) || (item.x as number) < 0 || (item.x as number) > 8 || (item.y as number) < 0 || (item.y as number) > 9) reject('棋盘坐标必须是范围内的整数')
  return { x: item.x as number, y: item.y as number }
}

function moves(value: unknown, maximum: number): Move[] {
  return Array.from(array(value, maximum), entry => {
    const item = object(entry, ['from', 'to'])
    return { from: position(item.from), to: position(item.to) }
  })
}

function notes(value: unknown, length: number): SessionNotes {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) reject('试走笔记必须是对象')
  const keys = Reflect.ownKeys(value)
  if (keys.length > length) reject('试走笔记索引超出本地着法范围')
  const item = object(value, keys.filter((key): key is string => typeof key === 'string'))
  const result: SessionNotes = {}
  for (const key of keys) {
    if (typeof key !== 'string' || !/^[1-9]\d*$/.test(key) || Number(key) > length) reject('笔记索引必须是本地1至末着的整数')
    const text = item[key]
    if (typeof text !== 'string' || !text.trim() || text.length > 500) reject('每条试走笔记须为1至500字的非空文本')
    result[key] = text
  }
  return result
}

/** Normalize bounded compact data; this path deliberately never replays rules. */
function draft(value: unknown): Draft {
  const item = object(value, ['source', 'orientation', 'startMoves', 'moves', 'notes', 'viewIndex'])
  const startMoves = moves(item.startMoves, MAX_STUDY_PLIES - 1)
  const localMoves = moves(item.moves, MAX_STUDY_PLIES)
  if (startMoves.length + localMoves.length > MAX_STUDY_PLIES) reject('来源与试走着法合计不能超过600着')
  const source = object(item.source, ['kind', 'title', 'ply'])
  if (source.kind !== 'match' && source.kind !== 'collection' && source.kind !== 'file') reject('试走来源类型不正确')
  if (typeof source.title !== 'string' || !source.title.trim() || source.title.trim().length > 40) reject('试走来源标题须为1至40字')
  if (!Number.isInteger(source.ply) || (source.ply as number) < 0 || (source.ply as number) > startMoves.length) reject('试走来源着数超出真实前缀范围')
  if (item.orientation !== 'red' && item.orientation !== 'black') reject('试走棋盘朝向不正确')
  if (!Number.isInteger(item.viewIndex) || (item.viewIndex as number) < 0 || (item.viewIndex as number) > localMoves.length) reject('试走复盘位置超出本地着法范围')
  return {
    source: { kind: source.kind, title: source.title.trim(), ply: source.ply as number },
    orientation: item.orientation, startMoves, moves: localMoves,
    notes: notes(item.notes, localMoves.length), viewIndex: item.viewIndex as number,
  }
}

function checkBytes(text: string): void {
  if (typeof text !== 'string' || text.length > MAX_STUDY_BYTES || new TextEncoder().encode(text).length > MAX_STUDY_BYTES) reject('试走草稿不能超过512KiB')
}

function restore(saved: Draft): Study {
  let game = createGame()
  for (const [index, move] of saved.startMoves.entries()) {
    const next = tryMove(game, move)
    if (!next.ok) reject(`第${index + 1}着来源着法无效：${next.error}`)
    game = next.game
  }
  if (game.result) reject('试走来源局面已经结束，请选择更早的位置')
  let session: Session = {
    ...createSession(), game, snapshots: [game],
    origin: { version: 1, startMoves: saved.startMoves },
  }
  for (const [index, move] of saved.moves.entries()) {
    const next = play(session, move)
    if (!next.ok) reject(`本地第${index + 1}着试走无效：${next.error}`)
    session = next.session
  }
  session = { ...session, notes: { ...saved.notes }, viewIndex: saved.viewIndex }
  return { source: saved.source, orientation: saved.orientation, session }
}

export function loadStudy(storage: StudyStorage): StudyLoad {
  try {
    const raw = storage.getItem(KEY)
    if (raw === null) return { study: null, error: '' }
    checkBytes(raw)
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { reject('试走草稿不是有效的JSON文本') }
    const envelope = object(parsed, ['version', 'study'])
    if (envelope.version !== 1) reject('不支持的试走草稿版本')
    return { study: restore(draft(envelope.study)), error: '' }
  } catch (error) {
    return { study: null, error: error instanceof Error && /[\u4e00-\u9fff]/.test(error.message) ? error.message : '无法读取试走草稿，请检查本地存储' }
  }
}

/** Callers supply studies generated by the study core or restored above. */
export function saveStudy(storage: StudyStorage, study: Study): boolean {
  try {
    const item = object(study, ['source', 'orientation', 'session'])
    const session = object(item.session, ['game', 'snapshots', 'records', 'viewIndex', 'mode', 'playerSide', 'drawOfferedBy', 'notes', 'origin'], ['records', 'viewIndex', 'origin'])
    const origin = object(session.origin, ['version', 'startMoves'])
    if (origin.version !== 1) reject('试走起始来源版本不受支持')
    const localMoves = Array.from(array(session.records, MAX_STUDY_PLIES), record => object(record, ['move', 'notation', 'coordinate', 'side', 'captured', 'check'], ['move']).move)
    const normalized = draft({
      source: item.source, orientation: item.orientation,
      startMoves: origin.startMoves, moves: localMoves,
      notes: session.notes === undefined ? {} : session.notes, viewIndex: session.viewIndex,
    })
    const raw = JSON.stringify({ version: 1, study: normalized })
    checkBytes(raw)
    storage.setItem(KEY, raw)
    return true
  } catch { return false }
}

export function clearStudy(storage: StudyStorage): boolean {
  try { storage.removeItem(KEY); return true } catch { return false }
}
