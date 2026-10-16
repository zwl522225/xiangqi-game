import { checkArchiveShape, inspectArchive } from './archive-codec'
import type { ArchivedGame, Result } from './archive-codec'
import type { Progress } from './storage'
import type { Side } from './types'

export type CollectionEntry = { id: string; savedAt: number; archive: ArchivedGame }
export type GameCollection = { version: 1; items: CollectionEntry[] }
export type CollectionMetadata = { id: string; savedAt: number }
export type ContinueOptions = { mode: 'local' | 'ai'; playerSide: Side }
export const MAX_COLLECTION_ITEMS = 20
export const MAX_COLLECTION_BYTES = 2 * 1024 * 1024
// Recovery work is bounded even if local storage contains a very large broken array.
const MAX_RECOVERY_ENTRIES = 200

export function defaultCollection(): GameCollection { return { version: 1, items: [] } }
function fail(error: string): never { throw new Error(error) }
function result<T>(operation: () => T): Result<T> {
  try { return { ok: true, value: operation() } }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : '收藏数据不正确' } }
}
function unwrap<T>(checked: Result<T>): T { return checked.ok ? checked.value : fail(checked.error) }
function fields(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('收藏字段必须是对象')
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) fail('收藏对象来源不正确')
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.length !== keys.length || ownKeys.some(key => typeof key !== 'string' || !keys.includes(key)) ||
    keys.some(key => !Object.hasOwn(value, key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'))) fail('收藏字段不正确')
  return value as Record<string, unknown>
}
function metadata(value: unknown): CollectionMetadata {
  const item = fields(value, ['id', 'savedAt'])
  if (typeof item.id !== 'string' || !item.id.trim() || item.id.length > 100) fail('收藏标识须为1至100字的非空文本')
  if (typeof item.savedAt !== 'number' || !Number.isSafeInteger(item.savedAt) || item.savedAt < 0 || item.savedAt > 8640000000000000) fail('收藏时间必须是有效时间戳')
  return { id: item.id, savedAt: item.savedAt }
}
function entry(value: unknown): CollectionEntry {
  const item = fields(value, ['id', 'savedAt', 'archive'])
  return { ...metadata({ id: item.id, savedAt: item.savedAt }), archive: unwrap(checkArchiveShape(item.archive)) }
}
function byteLength(value: unknown): number { return new TextEncoder().encode(JSON.stringify(value)).length }
function withinCapacity(data: GameCollection): GameCollection {
  if (data.items.length > MAX_COLLECTION_ITEMS) fail('收藏最多保存20盘，请先删除不需要的棋局')
  if (byteLength(data) > MAX_COLLECTION_BYTES) fail('收藏总容量不能超过2MiB，请先删除不需要的棋局')
  return data
}
function checkedCollection(value: unknown): GameCollection {
  const data = fields(value, ['version', 'items'])
  if (data.version !== 1 || !Array.isArray(data.items)) fail('不支持的收藏格式或版本')
  if (data.items.length > MAX_COLLECTION_ITEMS) fail('收藏最多保存20盘')
  const items = Array.from(data.items, entry)
  if (new Set(items.map(item => item.id)).size !== items.length) fail('收藏标识重复')
  return withinCapacity({ version: 1, items })
}

/** Load-time recovery checks structure only. Opening a record must inspect its archive. */
export function normalizeCollection(value: unknown): GameCollection {
  const recovered = defaultCollection()
  try {
    const data = fields(value, ['version', 'items'])
    if (data.version !== 1 || !Array.isArray(data.items)) return recovered
    const ids = new Set<string>()
    let size = byteLength(recovered)
    for (const raw of data.items.slice(0, MAX_RECOVERY_ENTRIES)) {
      if (recovered.items.length === MAX_COLLECTION_ITEMS) break
      const parsed = result(() => entry(raw))
      if (!parsed.ok || ids.has(parsed.value.id)) continue
      const extra = byteLength(parsed.value) + (recovered.items.length ? 1 : 0)
      if (size + extra > MAX_COLLECTION_BYTES) continue
      recovered.items.push(parsed.value)
      ids.add(parsed.value.id)
      size += extra
    }
  } catch { /* A broken collection must never discard other progress. */ }
  return recovered
}

export function addCollection(data: GameCollection, archive: unknown, meta: CollectionMetadata): Result<GameCollection> {
  return result(() => {
    const next = checkedCollection(data)
    const supplied = metadata(meta)
    if (next.items.some(item => item.id === supplied.id)) fail('收藏标识已存在，请使用新的标识')
    if (next.items.length === MAX_COLLECTION_ITEMS) fail('收藏最多保存20盘，请先删除不需要的棋局')
    const inspected = unwrap(inspectArchive(archive))
    return withinCapacity({ version: 1, items: [...next.items, { ...supplied, archive: inspected.archive }] })
  })
}

export function renameCollection(data: GameCollection, id: string, title: string): Result<GameCollection> {
  return result(() => {
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 40) fail('标题须为1至40字')
    const next = checkedCollection(data)
    const selected = next.items.find(item => item.id === id)
    if (!selected || selected.archive.title === title.trim()) return data
    selected.archive.title = title.trim()
    return withinCapacity(next)
  })
}

export function removeCollection(data: GameCollection, id: string): Result<GameCollection> {
  return result(() => {
    const next = checkedCollection(data)
    if (!next.items.some(item => item.id === id)) return data
    return { version: 1, items: next.items.filter(item => item.id !== id) }
  })
}

export function clearCollection(data: GameCollection): Result<GameCollection> {
  return result(() => checkedCollection(data).items.length ? defaultCollection() : data)
}

/** Restores a practice game, with provenance proved by replay rather than caller flags. */
export function continueCollection(progress: Progress, archive: unknown, options: ContinueOptions): Result<Progress> {
  return result(() => {
    const selected = fields(options, ['mode', 'playerSide'])
    if ((selected.mode !== 'local' && selected.mode !== 'ai') || (selected.playerSide !== 'red' && selected.playerSide !== 'black')) fail('请选择有效的对弈模式和执棋方')
    const { session } = unwrap(inspectArchive(archive))
    if (session.game.result) fail('棋局已经结束，不能从此处续练')
    return {
      ...progress,
      session: { ...session, mode: selected.mode, playerSide: selected.playerSide, viewIndex: session.records.length, drawOfferedBy: null },
      learningMatch: { active: selected.mode === 'ai', standardStart: false, coachEnabled: false, coachEverUsed: false, checkpointSeen: false, toolMoveUsed: false },
    }
  })
}
