import { openings } from '../content/openings'
import { defaultOpeningTraining, openingTrainingView, type OpeningGroup, type OpeningRound, type OpeningTrainingData } from './opening-training'

export const OPENING_TRAINING_KEY = 'xiangqi-opening-training'
export const MAX_OPENING_TRAINING_BYTES = 32 * 1024
export type OpeningTrainingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type OpeningTrainingLoad = { data: OpeningTrainingData; error: string; blocked: boolean }

const READ_ERROR = '开局跟练存档无法读取或已损坏；原存档已保留，请显式重置后再保存。'
const envelopeFields = ['version', 'groups', 'active']
const groupFields = ['openingId', 'openingVersion', 'side', 'completed', 'unassisted']
const roundFields = ['openingId', 'openingVersion', 'side', 'ply', 'errors', 'hinted', 'demonstrated', 'hintLevel']

function reject(): never { throw new Error('开局跟练存档字段不合法') }

/** Read only own data fields, so accessors and toJSON cannot run during encoding. */
function object(value: unknown, fields: string[], strict: boolean): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject()
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) reject()
  if (strict && Reflect.ownKeys(value).some(key => typeof key !== 'string' || !fields.includes(key))) reject()
  const result: Record<string, unknown> = {}
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field)
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) reject()
    result[field] = descriptor.value
  }
  return result
}

function boundedInteger(value: unknown, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > maximum) reject()
  return value as number
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') reject()
  return value
}
function identity(item: Record<string, unknown>): Pick<OpeningGroup, 'openingId' | 'openingVersion' | 'side'> {
  const opening = openings.find(entry => entry.id === item.openingId && entry.version === item.openingVersion)
  if (!opening || (item.side !== 'red' && item.side !== 'black')) reject()
  return { openingId: opening.id, openingVersion: opening.version, side: item.side }
}
function group(value: unknown, strict: boolean): OpeningGroup {
  const item = object(value, groupFields, strict)
  const result = { ...identity(item), completed: boolean(item.completed), unassisted: boolean(item.unassisted) }
  if (result.unassisted && !result.completed) reject()
  return result
}
function round(value: unknown, strict: boolean): OpeningRound {
  const item = object(value, roundFields, strict)
  const active = {
    ...identity(item), ply: boundedInteger(item.ply, 8), errors: boundedInteger(item.errors, 999),
    hinted: boolean(item.hinted), demonstrated: boolean(item.demonstrated), hintLevel: boundedInteger(item.hintLevel, 3),
  }
  const view = openingTrainingView(active)
  if (!view || (active.hintLevel > 0 && (!view.learnerTurn || !active.hinted))) reject()
  return active
}

/** Damage is isolated by group; a duplicate invalidates every copy of that group. */
function normalize(value: unknown, strict: boolean): OpeningTrainingLoad {
  const item = object(value, envelopeFields, strict)
  if (item.version !== 1) reject()
  const data = defaultOpeningTraining()
  let blocked = false
  if (!Array.isArray(item.groups) || item.groups.length !== data.groups.length) reject()
  const keys = Reflect.ownKeys(item.groups)
  if (keys.length !== item.groups.length + 1 || keys.some(key => key !== 'length'
    && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= data.groups.length))) reject()
  const seen = new Set<number>()
  for (let index = 0; index < item.groups.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(item.groups, String(index))
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) { blocked = true; continue }
    const entry: unknown = descriptor.value
    let slot = -1
    try {
      // Resolve the pair before validation so invalid or incompatible duplicates cannot win.
      const pair = object(entry, ['openingId', 'side'], false)
      slot = data.groups.findIndex(candidate => candidate.openingId === pair.openingId && candidate.side === pair.side)
      if (slot < 0) reject()
      if (seen.has(slot)) {
        data.groups[slot] = defaultOpeningTraining().groups[slot]
        reject()
      }
      seen.add(slot)
      data.groups[slot] = group(entry, strict)
    } catch { blocked = true }
  }
  if (seen.size !== data.groups.length) blocked = true
  if (item.active !== null) {
    try { data.active = round(item.active, strict) } catch { blocked = true }
  }
  return { data, error: blocked ? READ_ERROR : '', blocked }
}

function checkBytes(raw: string): void {
  if (typeof raw !== 'string' || raw.length > MAX_OPENING_TRAINING_BYTES
    || new TextEncoder().encode(raw).length > MAX_OPENING_TRAINING_BYTES) reject()
}

export function loadOpeningTraining(storage: OpeningTrainingStorage): OpeningTrainingLoad {
  try {
    const raw = storage.getItem(OPENING_TRAINING_KEY)
    if (raw === null) return { data: defaultOpeningTraining(), error: '', blocked: false }
    checkBytes(raw)
    return normalize(JSON.parse(raw), true)
  } catch { return { data: defaultOpeningTraining(), error: READ_ERROR, blocked: true } }
}

export function saveOpeningTraining(storage: OpeningTrainingStorage, data: OpeningTrainingData): boolean {
  try {
    const normalized = normalize(data, false)
    if (normalized.blocked) return false
    const raw = JSON.stringify(normalized.data)
    checkBytes(raw)
    storage.setItem(OPENING_TRAINING_KEY, raw)
    return true
  } catch { return false }
}

export function clearOpeningTraining(storage: OpeningTrainingStorage): boolean {
  try { storage.removeItem(OPENING_TRAINING_KEY); return true } catch { return false }
}
