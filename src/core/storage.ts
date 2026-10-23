import { terminalMatchKey } from './milestone-restore'
import { createSession } from './session'
import type { Session } from './session'
import { positionKey } from './rules'
import { normalizeNotes } from './review'
import { checkSessionOrigin } from './archive-codec'
import { defaultCollection, normalizeCollection } from './collection'
import type { GameCollection } from './collection'
import { defaultPractice, normalizePractice } from './practice'
import type { PracticeData } from './practice'
import type { Game } from './rules'
import type { Board, PieceType, Side } from './types'

export type LearningMatch = {
  active: boolean
  standardStart: boolean
  coachEnabled: boolean
  coachEverUsed: boolean
  checkpointSeen: boolean
  // Older v2 saves omit this field; omission means no recorded tool move.
  toolMoveUsed?: boolean
}
export type Progress = {
  session: Session
  completedLessons: string[]
  solvedPuzzles: string[]
  practicedUnits: string[]
  masteredUnits: string[]
  assistedVariants: string[]
  milestones: { firstMatch: boolean; independentMatch: boolean }
  learningMatch: LearningMatch | null
  practice?: PracticeData
  collection?: GameCollection
}
export type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function defaultProgress(): Progress {
  return {
    session: createSession(), completedLessons: [], solvedPuzzles: [],
    practicedUnits: [], masteredUnits: [], assistedVariants: [],
    milestones: { firstMatch: false, independentMatch: false }, learningMatch: null,
    practice: defaultPractice(),
    collection: defaultCollection(),
  }
}
const key = 'xiangqi-progress'
const types: PieceType[] = ['general', 'advisor', 'elephant', 'horse', 'rook', 'cannon', 'soldier']
const side = (value: unknown): value is Side => value === 'red' || value === 'black'
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')
const learningMatch = (value: unknown): value is LearningMatch => object(value) &&
  typeof value.active === 'boolean' && typeof value.standardStart === 'boolean' &&
  typeof value.coachEnabled === 'boolean' && typeof value.coachEverUsed === 'boolean' &&
  typeof value.checkpointSeen === 'boolean' && (!value.coachEnabled || value.coachEverUsed) &&
  (value.toolMoveUsed === undefined || typeof value.toolMoveUsed === 'boolean')
const position = (value: unknown): boolean => object(value) && Number.isInteger(value.x) && Number(value.x) >= 0 && Number(value.x) <= 8 && Number.isInteger(value.y) && Number(value.y) >= 0 && Number(value.y) <= 9
const move = (value: unknown): boolean => object(value) && position(value.from) && position(value.to)
const outcomeReasons = ['checkmate', 'stalemate', 'natural-limit', 'resignation', 'agreement']

function validBoard(value: unknown): value is Board {
  if (!Array.isArray(value) || value.length !== 10) return false
  const generals = { red: 0, black: 0 }
  const count = { red: 0, black: 0 }
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== 9) return false
    for (const piece of row) {
      if (piece === null) continue
      if (!object(piece) || !side(piece.side) || !types.includes(piece.type as PieceType)) return false
      count[piece.side]++
      if (piece.type === 'general') generals[piece.side]++
    }
  }
  return generals.red === 1 && generals.black === 1 && count.red <= 16 && count.black <= 16
}

function validGame(value: unknown): value is Game {
  if (!object(value) || !validBoard(value.board) || !side(value.turn)) return false
  if (!Number.isInteger(value.noCapturePlies) || Number(value.noCapturePlies) < 0 || Number(value.noCapturePlies) > 120) return false
  if (typeof value.repetitionWarning !== 'boolean' || !Array.isArray(value.positionKeys) || value.positionKeys.length === 0) return false
  if (!value.positionKeys.every(item => typeof item === 'string')) return false
  if (value.positionKeys.at(-1) !== positionKey(value.board, value.turn)) return false
  if (value.result !== null && (!object(value.result) || !(value.result.winner === null || side(value.result.winner)) || !outcomeReasons.includes(value.result.reason as string))) return false
  return true
}

function validSession(value: unknown): value is Session {
  if (!object(value) || !validGame(value.game) || !Array.isArray(value.snapshots) || !Array.isArray(value.records)) return false
  if (value.snapshots.length !== value.records.length + 1 || !value.snapshots.every(validGame)) return false
  if (!Number.isInteger(value.viewIndex) || Number(value.viewIndex) < 0 || Number(value.viewIndex) > value.records.length) return false
  if (value.mode !== 'local' && value.mode !== 'ai') return false
  if (!side(value.playerSide) || !(value.drawOfferedBy === null || side(value.drawOfferedBy))) return false
  if (positionKey(value.game.board, value.game.turn) !== positionKey((value.snapshots.at(-1) as Game).board, (value.snapshots.at(-1) as Game).turn)) return false
  const snapshots = value.snapshots as Game[]
  return value.records.every((record, index) => object(record) && move(record.move) &&
    typeof record.notation === 'string' && typeof record.coordinate === 'string' &&
    side(record.side) && record.side === snapshots[index].turn &&
    typeof record.captured === 'boolean' && typeof record.check === 'boolean')
}

function parseStoredProgress(envelope: unknown): Progress {
  if (!object(envelope) || (envelope.version !== 1 && envelope.version !== 2) || !object(envelope.progress)) throw new Error('存档结构无法读取')
  const progress = envelope.progress
  if (!validSession(progress.session)) throw new Error('存档结构无法读取')
  if (!strings(progress.completedLessons) || !strings(progress.solvedPuzzles)) throw new Error('存档结构无法读取')
  const session = { ...progress.session, notes: normalizeNotes(progress.session.notes, progress.session.records.length) }
  if (Object.hasOwn(session, 'origin')) {
    const origin = checkSessionOrigin(session.origin)
    if (origin.ok) session.origin = origin.value
    else delete session.origin
  }
  const oldFields = {
    session, completedLessons: progress.completedLessons, solvedPuzzles: progress.solvedPuzzles,
    collection: normalizeCollection(progress.collection),
  }
  if (envelope.version === 1) return { ...defaultProgress(), ...oldFields }
  if (!strings(progress.practicedUnits) || !strings(progress.masteredUnits) || !strings(progress.assistedVariants)) throw new Error('存档结构无法读取')
  if (!object(progress.milestones) || typeof progress.milestones.firstMatch !== 'boolean' ||
    typeof progress.milestones.independentMatch !== 'boolean' ||
    (progress.milestones.independentMatch && !progress.milestones.firstMatch)) throw new Error('存档结构无法读取')
  if (progress.learningMatch !== null && !learningMatch(progress.learningMatch)) throw new Error('存档结构无法读取')
  return {
    ...oldFields, practicedUnits: progress.practicedUnits, masteredUnits: progress.masteredUnits,
    assistedVariants: progress.assistedVariants,
    milestones: { firstMatch: progress.milestones.firstMatch, independentMatch: progress.milestones.independentMatch },
    learningMatch: progress.learningMatch,
    practice: normalizePractice(progress.practice),
  }
}

/** Read-only diagnosis: a missing save is fresh; a failed load protects its unknown original. */
export type ProgressLoad = { progress: Progress; blocked: boolean; restoredTerminalMatch?: string }
export function loadProgressWithStatus(storage: StorageLike): ProgressLoad {
  try {
    const raw = storage.getItem(key)
    if (raw === null) return { progress: defaultProgress(), blocked: false }
    const envelope: unknown = JSON.parse(raw), progress = parseStoredProgress(envelope)
    const marker = object(envelope) && envelope.version === 2 ? envelope.restoredTerminalMatch : undefined
    return typeof marker === 'string' && marker === terminalMatchKey(progress.session)
      ? { progress, blocked: false, restoredTerminalMatch: marker }
      : { progress, blocked: false }
  } catch {
    return { progress: defaultProgress(), blocked: true }
  }
}

export function loadProgress(storage: StorageLike): Progress {
  return loadProgressWithStatus(storage).progress
}

export function saveProgress(storage: StorageLike, progress: Progress, restoredTerminalMatch?: string | null): boolean {
  try {
    const metadata = typeof restoredTerminalMatch === 'string' && restoredTerminalMatch === terminalMatchKey(progress.session)
      ? { restoredTerminalMatch } : {}
    storage.setItem(key, JSON.stringify({ version: 2, progress, ...metadata }))
    return true
  } catch {
    return false
  }
}
