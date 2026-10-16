import { describe, expect, it } from 'vitest'
import { addCollection, clearCollection, continueCollection, defaultCollection, MAX_COLLECTION_BYTES, MAX_COLLECTION_ITEMS, normalizeCollection, removeCollection, renameCollection } from '../src/core/collection'
import type { GameCollection } from '../src/core/collection'
import { inspectArchive } from '../src/core/archive-codec'
import type { ArchivedGame, Result } from '../src/core/archive-codec'
import { awardMatchMilestones, setCoachEnabled } from '../src/core/learning'
import { play, undo } from '../src/core/session'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'
import type { Move } from '../src/core/types'

const m = (fx: number, fy: number, tx: number, ty: number): Move => ({ from: { x: fx, y: fy }, to: { x: tx, y: ty } })
const first = m(0, 6, 0, 5), second = m(0, 3, 0, 4)
const archive = (moves: Move[] = [first]): ArchivedGame => ({ format: 'yixiang-game', version: 1, title: '棋局', startMoves: [], moves, ending: null })
const bytes = (data: unknown) => new TextEncoder().encode(JSON.stringify(data)).length
function value<T>(result: Result<T>): T { if (!result.ok) throw new Error(result.error); return result.value }
const entry = (id: string, game = archive()) => ({ id, savedAt: 1, archive: game })

// Shape-valid records intentionally need no replay during loading or collection edits.
function bookWithBytes(target: number): GameCollection {
  const data: GameCollection = { version: 1, items: Array.from({ length: 7 }, (_, index) => entry(String(index), {
    ...archive(Array.from({ length: 600 }, () => structuredClone(first))),
    notes: Object.fromEntries(Array.from({ length: 600 }, (_, n) => [String(n + 1), 'x'])),
  })) }
  let remaining = target - bytes(data)
  for (const item of data.items) for (const key of Object.keys(item.archive.notes!)) {
    const extra = Math.min(499, remaining)
    item.archive.notes![key] += 'x'.repeat(extra)
    remaining -= extra
  }
  if (remaining !== 0) throw new Error('fixture capacity insufficient')
  expect(bytes(data)).toBe(target)
  return data
}

describe('pure game collection', () => {
  it('adds independent copies with caller metadata, preserving all notes and allowing duplicate content', () => {
    const source = { ...archive(), title: '  收藏  ', notes: { '1': '我的笔记' } }
    const empty = defaultCollection()
    const firstBook = value(addCollection(empty, source, { id: 'a', savedAt: 12 }))
    const copy = value(addCollection(firstBook, source, { id: 'b', savedAt: 13 }))
    expect(empty).toEqual({ version: 1, items: [] })
    expect(copy.items.map(item => item.id)).toEqual(['a', 'b'])
    expect(copy.items[0]).toEqual({ id: 'a', savedAt: 12, archive: { ...source, title: '收藏' } })
    copy.items[0].archive.moves[0].from.x = 8
    copy.items[0].archive.notes!['1'] = '编辑'
    expect(source.moves[0].from.x).toBe(0)
    expect(source.notes['1']).toBe('我的笔记')
    expect(firstBook.items[0].archive.notes!['1']).toBe('我的笔记')
    expect(copy.items[1].archive.moves[0].from.x).toBe(0)
    expect(addCollection(firstBook, source, { id: 'a', savedAt: 14 }).ok).toBe(false)
  })

  it('rejects invalid metadata, titles and illegal new histories without mutating the book', () => {
    const book = defaultCollection(), before = structuredClone(book)
    for (const meta of [{ id: '', savedAt: 1 }, { id: ' ', savedAt: 1 }, { id: 'x'.repeat(101), savedAt: 1 },
      { id: 'a', savedAt: -1 }, { id: 'a', savedAt: NaN }, { id: 'a', savedAt: Infinity }, { id: 'a', savedAt: 8640000000000001 }]) {
      expect(addCollection(book, archive(), meta).ok).toBe(false)
    }
    expect(addCollection(book, archive([second]), { id: 'a', savedAt: 1 }).ok).toBe(false)
    expect(addCollection(book, { ...archive(), title: ' ' }, { id: 'a', savedAt: 1 }).ok).toBe(false)
    expect(book).toEqual(before)
  })

  it('keeps 20 entries and rejects the 21st without automatic eviction', () => {
    expect(MAX_COLLECTION_ITEMS).toBe(20)
    let book = defaultCollection()
    for (let i = 0; i < 20; i++) book = value(addCollection(book, archive(), { id: String(i), savedAt: i }))
    const before = structuredClone(book)
    expect(addCollection(book, archive(), { id: '21', savedAt: 21 }).ok).toBe(false)
    expect(book).toEqual(before)
    expect(book.items[0].id).toBe('0')
  })

  it('saves a real 361-ply game with all notes even when its internal archive exceeds the single-file limit', () => {
    const cycle = [m(1, 9, 2, 7), m(1, 0, 2, 2), m(2, 7, 1, 9), m(2, 2, 1, 0)]
    const blackFirst = [cycle[1], cycle[0], cycle[3], cycle[2]]
    const repeated = (line: Move[], count: number) => Array.from({ length: count }, () => line).flat()
    const moves = [...repeated(cycle, 28), first, second, m(0, 5, 0, 4),
      ...repeated(blackFirst, 28), m(2, 3, 2, 4), m(2, 6, 2, 5), m(2, 4, 2, 5),
      ...repeated(cycle, 28), m(6, 6, 6, 5), m(6, 3, 6, 4), m(6, 5, 6, 4), ...repeated(blackFirst, 4)]
    const source = { ...archive(moves), notes: Object.fromEntries(moves.map((_, i) => [String(i + 1), '字'.repeat(500)])) }
    expect(moves).toHaveLength(361)
    expect(bytes(source)).toBeGreaterThan(512 * 1024)
    const book = value(addCollection(defaultCollection(), source, { id: 'long', savedAt: 1 }))
    expect(book.items[0].archive.notes).toEqual(source.notes)
    expect(normalizeCollection(book)).toEqual(book)
    expect(book.items[0].archive).not.toHaveProperty('snapshots')
  })

  it('renames, deletes and clears only the book; successful noops retain the input reference', () => {
    const book: GameCollection = { version: 1, items: [entry('a'), entry('b', archive([second]))] }
    const before = structuredClone(book)
    const renamed = value(renameCollection(book, 'a', '  新标题  '))
    expect(renamed.items[0].archive.title).toBe('新标题')
    expect(renamed.items[0].savedAt).toBe(1)
    expect(book).toEqual(before)
    expect(value(renameCollection(book, 'a', ' 棋局 '))).toBe(book)
    expect(value(renameCollection(book, 'missing', '新标题'))).toBe(book)
    expect(renameCollection(book, 'a', 'x'.repeat(41)).ok).toBe(false)
    expect(value(removeCollection(book, 'missing'))).toBe(book)
    expect(value(removeCollection(book, 'b')).items.map(item => item.id)).toEqual(['a'])
    expect(value(clearCollection(book))).toEqual(defaultCollection())
    const empty = defaultCollection()
    expect(value(clearCollection(empty))).toBe(empty)
    expect(book).toEqual(before)
  })

  it('measures canonical collection UTF-8 at the exact 2MiB boundary and refuses overflow atomically', () => {
    expect(MAX_COLLECTION_BYTES).toBe(2 * 1024 * 1024)
    const added = entry('new')
    const existing = bookWithBytes(MAX_COLLECTION_BYTES - bytes(added) - 1)
    const full = value(addCollection(existing, archive(), { id: 'new', savedAt: 1 }))
    expect(bytes(full)).toBe(MAX_COLLECTION_BYTES)
    expect(normalizeCollection(full)).toEqual(full)
    expect(renameCollection(full, 'new', '棋局多').ok).toBe(false)
    expect(addCollection(full, archive(), { id: 'extra', savedAt: 1 }).ok).toBe(false)
    expect(full.items).toHaveLength(8)
    const oversized = structuredClone(full)
    oversized.items.at(-1)!.archive.title += 'x'
    const recovered = normalizeCollection(oversized)
    expect(bytes(recovered)).toBeLessThanOrEqual(MAX_COLLECTION_BYTES)
    expect(recovered.items).toHaveLength(7)
  })
})

describe('bounded collection normalization', () => {
  it('drops malformed entries locally, preserves stable order and semantic-invalid histories for deletion', () => {
    const badSemantic = entry('semantic', archive([second]))
    const raw = { version: 1, items: [null, entry('first'), { ...entry('bad'), archive: { ...archive(), result: '赢' } },
      entry('first'), badSemantic, { ...entry('bad-time'), savedAt: -1 }, entry('last')] }
    const normalized = normalizeCollection(raw)
    expect(normalized.items.map(item => item.id)).toEqual(['first', 'semantic', 'last'])
    expect(inspectArchive(normalized.items[1].archive).ok).toBe(false)
    expect(value(removeCollection(normalized, 'semantic')).items.map(item => item.id)).toEqual(['first', 'last'])
    expect(normalizeCollection(JSON.parse(JSON.stringify(normalized)))).toEqual(normalized)
    normalized.items[0].archive.moves[0].from.x = 8
    expect(raw.items[1]).toEqual(entry('first'))
  })

  it('resets unknown versions and malformed containers and bounds excess count', () => {
    for (const raw of [null, [], 'bad', { version: 2, items: [entry('a')] }, { version: 1, items: null }]) expect(normalizeCollection(raw)).toEqual(defaultCollection())
    const book = normalizeCollection({ version: 1, items: Array.from({ length: 25 }, (_, i) => entry(String(i))) })
    expect(book.items.map(item => item.id)).toEqual(Array.from({ length: 20 }, (_, i) => String(i)))
    expect(normalizeCollection(book)).toEqual(book)
  })
})

describe('safe collection continuation', () => {
  it.each(['local', 'ai'] as const)('restores %s with black chosen, notes and proven setup while leaving all other progress unchanged', mode => {
    const source = { ...archive([second]), startMoves: [first], notes: { '1': '保留笔记' } }
    const progress = { ...defaultProgress(), completedLessons: ['board'], solvedPuzzles: ['mate'], practicedUnits: ['horse'], masteredUnits: ['horse'], assistedVariants: ['hint'], collection: { version: 1 as const, items: [entry('saved', source)] } }
    const before = structuredClone(progress)
    const next = value(continueCollection(progress, source, { mode, playerSide: 'black' }))
    expect(next.session).toMatchObject({ mode, playerSide: 'black', viewIndex: 1, drawOfferedBy: null, notes: source.notes, origin: { version: 1, startMoves: [first] } })
    expect(next.session.game).toEqual(value(inspectArchive(source)).session.game)
    expect(next.learningMatch).toEqual({ active: mode === 'ai', standardStart: false, coachEnabled: false, coachEverUsed: false, checkpointSeen: false, toolMoveUsed: false })
    expect({ ...next, session: before.session, learningMatch: before.learningMatch }).toEqual(before)
    next.session.origin!.startMoves[0].from.x = 8
    next.session.notes!['1'] = '变更'
    next.session.game.board[0][0] = null
    expect(progress).toEqual(before)
    expect(source.startMoves[0].from.x).toBe(0)
    expect(source.notes['1']).toBe('保留笔记')
  })

  it('never mistakes setup-only restoration for a new standard learning match', () => {
    const next = value(continueCollection(defaultProgress(), { ...archive([]), startMoves: [first] }, { mode: 'ai', playerSide: 'red' }))
    expect(next.session.records).toHaveLength(0)
    expect(next.learningMatch?.standardStart).toBe(false)
    expect(setCoachEnabled(next, true).learningMatch).toMatchObject({ coachEnabled: true, coachEverUsed: true, standardStart: false })
  })

  it('rejects terminal or forged archives and invalid options without altering the current state', () => {
    const progress = defaultProgress(), before = structuredClone(progress)
    const horseCycle = [m(1, 9, 2, 7), m(1, 0, 2, 2), m(2, 7, 1, 9), m(2, 2, 1, 0)]
    const mate = [[1,7,0,7],[7,2,3,2],[7,9,6,7],[1,2,1,1],[6,7,7,9],[1,1,4,1],[7,9,6,7],[2,0,4,2],[6,7,7,9],[3,2,3,1],[7,9,6,7],[2,3,2,4],[6,7,7,9],[1,0,0,2],[7,9,6,7],[0,2,2,3],[6,7,7,9],[2,3,4,4],[7,9,6,7],[0,3,0,4],[6,7,7,9],[0,4,0,5],[7,9,6,7],[0,5,1,5],[0,7,0,0]].map(([fx,fy,tx,ty]) => m(fx,fy,tx,ty))
    for (const game of [{ ...archive(), ending: { reason: 'resignation', side: 'black' } }, { ...archive(), ending: { reason: 'agreement' } },
      archive(Array.from({ length: 30 }, () => horseCycle).flat()), archive(mate), archive([second]), { ...archive(), winner: 'red' }]) {
      expect(continueCollection(progress, game, { mode: 'ai', playerSide: 'red' }).ok).toBe(false)
    }
    for (const options of [{ mode: 'online', playerSide: 'red' }, { mode: 'ai', playerSide: 'blue' }, null]) {
      expect(continueCollection(progress, archive(), options as never).ok).toBe(false)
    }
    expect(progress).toEqual(before)
  })

  it('retains ineligibility through reload, undo, tool history and a true 119-to-120 natural-limit finish', () => {
    const horseCycle = [m(1, 9, 2, 7), m(1, 0, 2, 2), m(2, 7, 1, 9), m(2, 2, 1, 0)]
    const moves = Array.from({ length: 30 }, () => horseCycle).flat()
    let progress = value(continueCollection(defaultProgress(), archive(moves.slice(0, 119)), { mode: 'ai', playerSide: 'black' }))
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    expect(saveProgress(storage, progress)).toBe(true)
    progress = loadProgress(storage)
    const undone = { ...progress, session: undo(progress.session) }
    expect(undone.learningMatch?.standardStart).toBe(false)
    expect(undone.session.origin).toEqual({ version: 1, startMoves: [] })
    progress = undone
    while (progress.session.records.length < 119) {
      const replayed = play(progress.session, moves[progress.session.records.length])
      if (!replayed.ok) throw new Error(replayed.error)
      progress = { ...progress, session: replayed.session }
    }
    expect(progress.session.game.result).toBeNull()
    const finished = play(progress.session, horseCycle[3])
    if (!finished.ok) throw new Error(finished.error)
    progress = { ...progress, session: finished.session }
    expect(progress.session.game.result).toEqual({ winner: null, reason: 'natural-limit' })
    expect(awardMatchMilestones(progress, progress.session).milestones).toEqual({ firstMatch: false, independentMatch: false })
    const tool = { ...progress, learningMatch: { ...progress.learningMatch!, toolMoveUsed: true } }
    expect(awardMatchMilestones(tool, tool.session).milestones).toEqual({ firstMatch: false, independentMatch: false })
    expect(saveProgress(storage, tool)).toBe(true)
    const reloaded = loadProgress(storage)
    expect(reloaded.learningMatch).toMatchObject({ standardStart: false, toolMoveUsed: true })
    expect(awardMatchMilestones(reloaded, reloaded.session).milestones.firstMatch).toBe(false)
  })
})
