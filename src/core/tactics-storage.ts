import { tactics } from '../content/tactics'
import { defaultTactics, type TacticsData, type TacticsError, type TacticsItem, type TacticsRecord, type TacticsRequest, type TacticsRound } from './tactics'
import { moveKey, tacticFeedback, tacticView } from './tactics-view'
import type { Move } from './types'
export const TACTICS_KEY = 'xiangqi-tactics-training'
export const MAX_TACTICS_BYTES = 64 * 1024
export type TacticsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type TacticsLoad = { data: TacticsData; error: string; blocked: boolean }
const READ_ERROR = '多步战术存档无法恢复；原存档已保留，可显式重置本项记录后再保存。'
const recordFields = ['id', 'version', 'everCompleted', 'everIndependent', 'review', 'errors', 'lastError']
const itemFields = ['id', 'version', 'path', 'errors', 'hintLevel', 'hinted', 'demonstrated', 'refutationViewed', 'retried', 'revealed', 'answerFrom', 'result']
function reject(): never { throw Error('多步战术存档字段或重放不一致') }

/** Snapshot own data descriptors into new plain objects before reading or serializing.
 * Accessors, custom prototypes, extra keys, sparse arrays and toJSON are rejected. */
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject()
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) reject()
  const keys = Reflect.ownKeys(value)
  if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key))) reject()
  const result: Record<string, unknown> = {}
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field)
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) reject()
    result[field] = descriptor.value
  }
  return result
}
function integer(value: unknown, maximum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > maximum) reject()
  return value
}
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') reject(); return value }
function array<T>(value: unknown, maximum: number, parse: (entry: unknown) => T): T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) reject()
  const length = Object.getOwnPropertyDescriptor(value, 'length')
  if (!length || !Object.hasOwn(length, 'value')) reject()
  const count = integer(length.value, maximum)
  const keys = Reflect.ownKeys(value)
  if (keys.length !== count + 1 || keys.some(k => k !== 'length' && (typeof k !== 'string' || !/^(0|[1-9]\d*)$/.test(k) || Number(k) >= count))) reject()
  const result: T[] = []
  for (let n = 0; n < count; n++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(n))
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) reject()
    result.push(parse(descriptor.value))
  }
  return result
}
function identity(item: Record<string, unknown>): { id: string; version: 1 } {
  const tactic = tactics.find(t => t.id === item.id && t.version === item.version)
  if (!tactic) reject()
  return { id: tactic.id, version: 1 }
}
function move(value: unknown): Move {
  const item = object(value, ['from', 'to'])
  const position = (value: unknown) => {
    const p = object(value, ['x', 'y'])
    return { x: integer(p.x, 8), y: integer(p.y, 9) }
  }
  return { from: position(item.from), to: position(item.to) }
}
/** Replay published edges and enforce the designated reply used by this training flow. */
function replay(id: string, path: Move[]) {
  let view = tacticView(id, [])!
  for (let n = 0; n < path.length; n++) {
    if (view.complete || (!view.learnerTurn && (!view.reply || moveKey(view.reply) !== moveKey(path[n])))) reject()
    const next = tacticView(id, path.slice(0, n + 1))
    if (!next) reject()
    view = next
  }
  return view
}
function recentError(value: unknown, id: string): TacticsError {
  const item = object(value, ['version', 'path', 'move'])
  if (item.version !== 1) reject()
  const error: TacticsError = { version: 1, path: array(item.path, 6, move), move: move(item.move) }
  const view = replay(id, error.path)
  if (!view.learnerTurn || tacticFeedback(id, error.path, error.move).status === 'success') reject()
  return error
}
function record(value: unknown): TacticsRecord {
  const item = object(value, recordFields), pair = identity(item)
  if (item.review !== null && item.review !== 'pending' && item.review !== 'reviewed') reject()
  const result: TacticsRecord = { ...pair, everCompleted: boolean(item.everCompleted), everIndependent: boolean(item.everIndependent),
    review: item.review, errors: integer(item.errors, 999), lastError: item.lastError === null ? null : recentError(item.lastError, pair.id) }
  if (result.everIndependent && !result.everCompleted) reject()
  if (result.errors === 0 ? result.lastError !== null || result.review !== null : !result.lastError || result.review === null) reject()
  if (result.review === 'reviewed' && !result.everIndependent) reject()
  return result
}
function request(value: unknown): TacticsRequest {
  // Inspect just the own mode descriptor before selecting its exact field set.
  if (!value || typeof value !== 'object') reject()
  const descriptor = Object.getOwnPropertyDescriptor(value, 'mode')
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) reject()
  if (descriptor.value === 'topic') {
    const item = object(value, ['mode', 'topic'])
    if (item.topic !== 'checks' && item.topic !== 'gain' && item.topic !== 'counter') reject()
    return { mode: 'topic', topic: item.topic }
  }
  const item = object(value, ['mode'])
  if (item.mode !== 'recommended' && item.mode !== 'mistakes') reject()
  return { mode: item.mode }
}
function roundItem(value: unknown, records: TacticsRecord[]): TacticsItem {
  const raw = object(value, itemFields), pair = identity(raw)
  if (raw.result !== null && raw.result !== 'independent' && raw.result !== 'assisted' && raw.result !== 'revealed' && raw.result !== 'skipped') reject()
  const item: TacticsItem = { ...pair, path: array(raw.path, 6, move), errors: integer(raw.errors, 999),
    hintLevel: integer(raw.hintLevel, 3), hinted: boolean(raw.hinted), demonstrated: boolean(raw.demonstrated),
    refutationViewed: boolean(raw.refutationViewed), retried: boolean(raw.retried), revealed: boolean(raw.revealed),
    answerFrom: raw.answerFrom === null ? null : integer(raw.answerFrom, 6), result: raw.result }
  const view = replay(item.id, item.path), rec = records.find(r => r.id === item.id)!
  const help = item.errors > 0 || item.hinted || item.demonstrated || item.refutationViewed || item.retried || item.revealed
  if (item.errors > rec.errors || (item.errors > 0 && (!rec.lastError || rec.review !== 'pending'))) reject()
  if (item.errors > 0 && !item.retried && rec.lastError!.path.some((m, n) => !item.path[n] || moveKey(item.path[n]) !== moveKey(m))) reject()
  if (item.refutationViewed && item.errors === 0) reject()
  if (item.hintLevel > 0 && (!item.hinted || !view.learnerTurn || item.result !== null)) reject()
  if (item.hinted && item.hintLevel === 0 && item.path.length === 0 && !item.retried && item.result === null) reject()
  if (item.demonstrated && item.path.length === 0 && !item.retried) reject()
  if (item.revealed && item.answerFrom === null && !item.retried) reject()
  if (view.complete !== (item.result === 'independent' || item.result === 'assisted' || item.result === 'revealed')) reject()
  if (item.result === 'independent' && (help || !rec.everIndependent || !rec.everCompleted || rec.review === 'pending')) reject()
  if (item.result === 'assisted' && (!help || !rec.everCompleted)) reject()
  if (item.result === 'revealed' && (!item.revealed || item.answerFrom === null)) reject()
  if (item.answerFrom !== null) {
    if (!item.revealed || item.result !== 'revealed' || item.answerFrom >= item.path.length) reject()
    let suffix = replay(item.id, item.path.slice(0, item.answerFrom))
    if (suffix.complete) reject()
    for (let n = item.answerFrom; n < item.path.length; n++) {
      const expected = suffix.learnerTurn ? suffix.correctMoves[0] : suffix.reply
      if (!expected || moveKey(expected) !== moveKey(item.path[n])) reject()
      suffix = replay(item.id, item.path.slice(0, n + 1))
    }
  }
  return item
}
function round(value: unknown, records: TacticsRecord[]): TacticsRound {
  const raw = object(value, ['request', 'index', 'items'])
  const result: TacticsRound = { request: request(raw.request), items: array(raw.items, 3, item => roundItem(item, records)), index: integer(raw.index, 3) }
  if (result.index > result.items.length || new Set(result.items.map(i => i.id)).size !== result.items.length) reject()
  if (result.request.mode === 'topic') {
    const topic = result.request.topic
    const expected = tactics.filter(t => t.topic === topic).map(t => t.id).sort()
    if (result.items.length !== expected.length || result.items.some((item, n) => item.id !== expected[n])) reject()
  } else if (!result.items.length && (result.request.mode !== 'mistakes' || records.some(r => r.review === 'pending'))) reject()
  if (result.request.mode === 'recommended' && result.items.length !== 3) reject()
  if (result.request.mode === 'mistakes' && result.items.some((item, n) => records.find(r => r.id === item.id)!.review === null
    || (n > 0 && item.id <= result.items[n - 1].id))) reject()
  for (let n = 0; n < result.items.length; n++) {
    const item = result.items[n]
    if (n < result.index && item.result === null) reject()
    if (n > result.index && (item.path.length || item.errors || item.hintLevel || item.hinted || item.demonstrated || item.refutationViewed || item.retried || item.revealed || item.answerFrom !== null || item.result !== null)) reject()
  }
  return result
}
function normalize(value: unknown): TacticsData {
  const raw = object(value, ['version', 'records', 'round'])
  if (raw.version !== 1) reject()
  const records = array(raw.records, 6, record)
  if (records.length !== 6 || new Set(records.map(r => r.id)).size !== 6) reject()
  return { version: 1, records, round: raw.round === null ? null : round(raw.round, records) }
}
function bytes(raw: string) {
  if (typeof raw !== 'string' || raw.length > MAX_TACTICS_BYTES || new TextEncoder().encode(raw).length > MAX_TACTICS_BYTES) reject()
}
export function loadTactics(storage: TacticsStorage): TacticsLoad {
  try {
    const raw = storage.getItem(TACTICS_KEY)
    if (raw === null) return { data: defaultTactics(), error: '', blocked: false }
    bytes(raw)
    return { data: normalize(JSON.parse(raw)), error: '', blocked: false }
  } catch { return { data: defaultTactics(), error: READ_ERROR, blocked: true } }
}
export function saveTactics(storage: TacticsStorage, data: TacticsData): boolean {
  try {
    const raw = JSON.stringify(normalize(data))
    bytes(raw)
    storage.setItem(TACTICS_KEY, raw)
    return true
  } catch { return false }
}
export function clearTactics(storage: TacticsStorage): boolean {
  try { storage.removeItem(TACTICS_KEY); return true } catch { return false }
}
