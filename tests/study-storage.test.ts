import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearStudy, loadStudy, MAX_STUDY_BYTES, saveStudy } from '../src/core/study-storage'
import type { StudyStorage } from '../src/core/study-storage'
import { createStudy, playStudy } from '../src/core/study'
import type { Study } from '../src/core/study'
import type { Result } from '../src/core/archive-codec'
import { createSession, play, setView } from '../src/core/session'
import type { Session } from '../src/core/session'
import { setNote } from '../src/core/review'
import * as rules from '../src/core/rules'
import type { Move } from '../src/core/types'

const KEY = 'xiangqi-study'
type Coordinates = [number, number, number, number]
const move = ([x, y, tx, ty]: Coordinates): Move => ({ from: { x, y }, to: { x: tx, y: ty } })
const line: Coordinates[] = [[0,6,0,5],[0,3,0,4],[0,5,0,4],[2,3,2,4],[2,6,2,5],[2,4,2,5]]
const cycle: Coordinates[] = [[1,9,2,7],[1,0,2,2],[2,7,1,9],[2,2,1,0]]
function longMoves(): Move[] {
  const blackFirst = [cycle[1], cycle[0], cycle[3], cycle[2]]
  const moves: Coordinates[] = []
  for (const [index, x] of [0, 2, 6, 8, 4].entries()) {
    for (let round = 0; round < 28; round++) moves.push(...(index % 2 === 0 ? cycle : blackFirst))
    moves.push(...(index % 2 === 0 ? [[x,6,x,5],[x,3,x,4],[x,5,x,4]] : [[x,3,x,4],[x,6,x,5],[x,4,x,5]]) as Coordinates[])
  }
  for (let index = 0; index < 26; index++) moves.push(blackFirst[index % 4])
  return moves.map(move)
}
function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
function played(moves: Move[]): Session {
  let session = createSession()
  for (const item of moves) {
    const next = play(session, item)
    if (!next.ok) throw new Error(next.error)
    session = next.session
  }
  return session
}
function fork(source = setView(played(line.map(move)), 3)): Study {
  return value(createStudy(source, { kind: 'match', title: '实战来源', orientation: 'black' }))
}
function trial(): Study {
  let study = fork()
  for (const item of line.slice(3)) study = value(playStudy(study, move(item)))
  return { ...study, session: setView(setNote(study.session, 2, '  本地试走笔记  '), 1) }
}
function memory(raw: string | null = null) {
  const data = new Map<string, string>([['xiangqi-progress', '旧进度'], ['xiangqi-prefs', '旧设置'], ['xiangqi-session', '旧棋局']])
  if (raw !== null) data.set(KEY, raw)
  const storage: StudyStorage = {
    getItem: vi.fn(key => data.get(key) ?? null),
    setItem: vi.fn((key, text) => { data.set(key, text) }),
    removeItem: vi.fn(key => { data.delete(key) }),
  }
  return { data, storage }
}
function envelope(study = trial()) {
  return { version: 1, study: {
    source: study.source, orientation: study.orientation,
    startMoves: study.session.origin!.startMoves,
    moves: study.session.records.map(record => record.move),
    notes: study.session.notes!, viewIndex: study.session.viewIndex,
  } }
}
function invalidRaw(raw: string) {
  const { data, storage } = memory(raw)
  const before = new Map(data)
  const result = loadStudy(storage)
  expect(result.study).toBeNull()
  expect(result.error).toMatch(/[\u4e00-\u9fff]/)
  expect(data).toEqual(before)
  expect(storage.setItem).not.toHaveBeenCalled()
  expect(storage.removeItem).not.toHaveBeenCalled()
}

afterEach(() => { vi.restoreAllMocks() })

describe('isolated compact study draft storage', () => {
  it('roundtrips selected history, local moves, notes, view and orientation without touching the source', () => {
    const source = played(line.map(move))
    const before = structuredClone(source)
    let study = fork(setView(source, 3))
    expect(study.session.game.turn).toBe('black')
    for (const item of line.slice(3)) study = value(playStudy(study, move(item)))
    study = { ...study, session: setView(setNote(study.session, 2, '独立笔记'), 1) }
    const { data, storage } = memory()
    expect(saveStudy(storage, study)).toBe(true)
    expect(JSON.parse(data.get(KEY)!)).toEqual(envelope(study))
    expect(loadStudy(storage)).toEqual({ study, error: '' })
    expect(loadStudy(storage).study!.session).toMatchObject({ mode: 'local', playerSide: 'red', drawOfferedBy: null })
    expect(source).toEqual(before)
    expect(storage.getItem).toHaveBeenCalledWith(KEY)
    expect(data.get('xiangqi-progress')).toBe('旧进度')
    expect(data.get('xiangqi-prefs')).toBe('旧设置')
    expect(data.get('xiangqi-session')).toBe('旧棋局')
  })

  it('supports missing drafts, standard empty positions and nonempty prefixes with zero local moves', () => {
    const absent = memory()
    expect(loadStudy(absent.storage)).toEqual({ study: null, error: '' })
    expect(absent.storage.setItem).not.toHaveBeenCalled()
    for (const study of [fork(createSession()), fork()]) {
      const { storage } = memory()
      expect(saveStudy(storage, study)).toBe(true)
      expect(loadStudy(storage)).toEqual({ study, error: '' })
    }
  })

  it('loads independent copies of every mutable history, origin, metadata and note container', () => {
    const { storage } = memory(JSON.stringify(envelope()))
    const first = loadStudy(storage).study!
    const second = loadStudy(storage).study!
    const before = structuredClone(second)
    first.source.title = '修改'
    first.session.origin!.startMoves[0].from.x = 8
    first.session.records[0].move.from.x = 8
    first.session.notes!['2'] = '改'
    first.session.game.board[5][2] = null
    first.session.game.positionKeys[0] = '伪造'
    first.session.snapshots[0].noCapturePlies = 99
    expect(second).toEqual(before)
    expect(loadStudy(storage).study).toEqual(before)
  })

  it('stores only moves and metadata, deriving all captions and flags when loaded', () => {
    const study = trial()
    study.session.records = study.session.records.map(record => ({ ...record, notation: '假的', coordinate: '伪造', side: 'red', captured: false, check: true }))
    const { data, storage } = memory()
    expect(saveStudy(storage, study)).toBe(true)
    expect(JSON.parse(data.get(KEY)!)).toEqual(envelope(study))
    expect(loadStudy(storage).study!.session.records).toEqual(trial().session.records)
    expect(data.get(KEY)).not.toMatch(/snapshots|positionKeys|notation|captured|drawOfferedBy|playerSide|noCapturePlies/)
  })

  it('normalizes titles and treats source ply as descriptive rather than the origin proof', () => {
    const item = envelope()
    item.study.source = { kind: 'file', title: '  导入来源  ', ply: 1 }
    const { storage } = memory(JSON.stringify(item))
    const result = loadStudy(storage)
    expect(result.error).toBe('')
    expect(result.study!.source).toEqual({ kind: 'file', title: '导入来源', ply: 1 })
    expect(result.study!.session.origin!.startMoves).toHaveLength(3)
    expect(result.study!.session.game).toEqual(trial().session.game)
  })
})

describe('strict draft envelope validation', () => {
  it('rejects malformed JSON, unsupported versions and unknown persisted fields without deleting old data', () => {
    for (const raw of ['{', 'null', '[]']) invalidRaw(raw)
    const base = envelope()
    for (const bad of [
      { ...base, version: 2 }, { ...base, extra: true }, { version: 1 },
      { ...base, study: { ...base.study, game: {} } },
      { ...base, study: { ...base.study, ending: { reason: 'agreement' } } },
      { ...base, study: { ...base.study, source: { ...base.study.source, path: 'private-source.json' } } },
      { ...base, study: { ...base.study, moves: [{ ...move(line[3]), check: true }] } },
      JSON.parse(JSON.stringify(base).replace('"version":1', '"version":1,"__proto__":{}')),
    ]) invalidRaw(JSON.stringify(bad))
  })

  it.each([
    ['kind', 'other'], ['title', ' '], ['title', '字'.repeat(41)], ['title', 5],
    ['ply', -1], ['ply', 4], ['ply', 1.5], ['ply', '1'],
  ])('rejects invalid source %s=%s', (key, value) => {
    const item = envelope()
    Object.assign(item.study.source, { [key]: value })
    invalidRaw(JSON.stringify(item))
  })

  it.each([-1, 4, 0.5, '1', null])('rejects invalid local view %s', viewIndex => {
    invalidRaw(JSON.stringify({ ...envelope(), study: { ...envelope().study, viewIndex } }))
  })

  it('rejects invalid orientation, missing fields, move containers, coordinates and notes', () => {
    const base = envelope().study
    const badMoves = [null, {}, [null], [move([0.5,6,0,5])], [move([0,6,9,5])], [move([0,-1,0,5])], [move([0,6,0,10])], [{ from: { x: 0, y: 6, extra: 1 }, to: { x: 0, y: 5 } }]]
    for (const moves of badMoves) invalidRaw(JSON.stringify({ version: 1, study: { ...base, moves } }))
    for (const orientation of ['blue', null, 1]) invalidRaw(JSON.stringify({ version: 1, study: { ...base, orientation } }))
    for (const notes of [null, [], { '0': '错' }, { '01': '错' }, { '1.0': '错' }, { '4': '错' }, { '1': '' }, { '1': ' ' }, { '1': 1 }, { '1': '字'.repeat(501) }, JSON.parse('{"__proto__":"错"}')]) {
      invalidRaw(JSON.stringify({ version: 1, study: { ...base, notes } }))
    }
    for (const key of Object.keys(base)) {
      const missing = { ...base } as Record<string, unknown>
      delete missing[key]
      invalidRaw(JSON.stringify({ version: 1, study: missing }))
    }
  })

  it('rejects origins over 599 and combined moves over 600 before replay', () => {
    const base = envelope().study
    for (const [startMoves, moves] of [[Array(600).fill(move(line[0])), []], [Array(599).fill(move(line[0])), Array(2).fill(move(line[1]))], [[], Array(601).fill(move(line[0]))]]) {
      invalidRaw(JSON.stringify({ version: 1, study: { ...base, source: { ...base.source, ply: 0 }, notes: {}, viewIndex: 0, startMoves, moves } }))
    }
  })
})

describe('real replay and natural endings', () => {
  it('restores a proved 599-ply base and one local move at the exact 600-ply cap', () => {
    const history = longMoves().slice(0, 600)
    let game = rules.createGame()
    let base = game
    for (const [index, item] of history.entries()) {
      const next = rules.tryMove(game, item)
      if (!next.ok) throw new Error(next.error)
      game = next.game
      if (index === 598) base = game
    }
    const { storage } = memory(JSON.stringify({ version: 1, study: {
      source: { kind: 'collection', title: '六百着边界', ply: 599 }, orientation: 'red',
      startMoves: history.slice(0, 599), moves: history.slice(599), notes: { '1': '最后一着' }, viewIndex: 0,
    } }))
    const result = loadStudy(storage)
    expect(result.error).toBe('')
    expect(result.study!.session.snapshots).toEqual([base, game])
    expect(result.study!.session.game).toEqual(game)
    expect(result.study!.session.origin!.startMoves).toHaveLength(599)
    expect(result.study!.session.records).toHaveLength(1)
    expect(result.study!.session.viewIndex).toBe(0)
    expect(saveStudy(storage, result.study!)).toBe(true)
  })

  it('rejects illegal source and local moves instead of trusting provenance descriptions', () => {
    const base = envelope().study
    for (const bad of [
      { ...base, startMoves: [move(line[1])], source: { ...base.source, ply: 0 } },
      { ...base, moves: [move(line[0])], notes: {}, viewIndex: 0 },
    ]) invalidRaw(JSON.stringify({ version: 1, study: bad }))
  })

  it('restores 119 quiet plies and the 120th local automatic draw with full rule history', () => {
    const quiet = played(Array.from({ length: 119 }, (_, index) => move(cycle[index % 4])))
    const initial = fork(quiet)
    const drawn = value(playStudy(initial, move(cycle[3])))
    const { storage } = memory()
    expect(saveStudy(storage, drawn)).toBe(true)
    const result = loadStudy(storage)
    expect(result).toEqual({ study: drawn, error: '' })
    expect(result.study!.session.game).toMatchObject({ noCapturePlies: 120, repetitionWarning: true, result: { winner: null, reason: 'natural-limit' } })
    expect(result.study!.session.game.positionKeys).toHaveLength(121)
    const bad = envelope(drawn)
    bad.study.moves.push(move(cycle[0]))
    invalidRaw(JSON.stringify(bad))
    bad.study.startMoves.push(...bad.study.moves.slice(0, 1))
    bad.study.moves = []
    bad.study.viewIndex = 0
    invalidRaw(JSON.stringify(bad))
  })
})

describe('bounded writes and storage failures', () => {
  it('saves view, note and rotation changes without replaying rules history', () => {
    const study = trial()
    const create = vi.spyOn(rules, 'createGame')
    const replay = vi.spyOn(rules, 'tryMove')
    const { storage } = memory()
    expect(saveStudy(storage, { ...study, orientation: 'red' })).toBe(true)
    expect(saveStudy(storage, { ...study, session: setView(study.session, 0) })).toBe(true)
    expect(saveStudy(storage, { ...study, session: setNote(study.session, 1, '追加') })).toBe(true)
    expect(create).not.toHaveBeenCalled()
    expect(replay).not.toHaveBeenCalled()
    expect(loadStudy(storage).error).toBe('')
    expect(replay).toHaveBeenCalled()
  })

  it('rejects sparse and accessor inputs without invoking accessors or replacing old data', () => {
    const base = trial()
    const getter = vi.fn(() => move(line[3]))
    const accessorMoves = [move(line[0])]
    Object.defineProperty(accessorMoves, '0', { get: getter })
    const extraMoves = Object.assign([move(line[0])], { caption: '不支持' })
    const accessorNotes = Object.defineProperty({}, '1', { get: vi.fn(() => '笔记'), enumerable: true })
    const bad: Study[] = [
      { ...base, session: { ...base.session, origin: { version: 1, startMoves: Array(1) } } },
      { ...base, session: { ...base.session, origin: { version: 1, startMoves: accessorMoves } } },
      { ...base, session: { ...base.session, origin: { version: 1, startMoves: extraMoves } } },
      { ...base, session: { ...base.session, records: Array(1) } },
      { ...base, session: { ...base.session, notes: accessorNotes } },
      { ...base, source: Object.defineProperty({ ...base.source }, 'title', { get: vi.fn(() => '标题') }) },
      { ...base, session: { ...base.session, notes: { '0': '无效' } } },
      { ...base, orientation: 'blue' } as unknown as Study,
    ]
    for (const study of bad) {
      const { data, storage } = memory('旧试走')
      const before = new Map(data)
      expect(saveStudy(storage, study)).toBe(false)
      expect(data).toEqual(before)
      expect(storage.setItem).not.toHaveBeenCalled()
    }
    expect(getter).not.toHaveBeenCalled()
    expect(Object.getOwnPropertyDescriptor(accessorNotes, '1')!.get).not.toHaveBeenCalled()
  })

  it('handles read, write and remove failures without clearing the old draft or other keys', () => {
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      const { data, storage } = memory('旧试走')
      const before = new Map(data)
      vi.mocked(storage[method]).mockImplementation(() => { throw new Error('denied') })
      if (method === 'getItem') expect(loadStudy(storage)).toEqual({ study: null, error: expect.stringMatching(/[\u4e00-\u9fff]/) })
      if (method === 'setItem') expect(saveStudy(storage, trial())).toBe(false)
      if (method === 'removeItem') expect(clearStudy(storage)).toBe(false)
      expect(data).toEqual(before)
    }
  })

  it('retains the old draft when encoding fails', () => {
    const study = trial()
    const { data, storage } = memory('旧试走')
    const before = new Map(data)
    vi.spyOn(JSON, 'stringify').mockImplementation(() => { throw new Error('encode failed') })
    expect(saveStudy(storage, study)).toBe(false)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(data).toEqual(before)
  })

  it('accepts exactly 512KiB of valid moves and notes, refusing one extra UTF-8 byte without dropping data', () => {
    let study = fork(createSession())
    for (const item of longMoves().slice(0, 360)) study = value(playStudy(study, item))
    const notes = Object.fromEntries(study.session.records.map((_, index) => [String(index + 1), 'a']))
    study = { ...study, session: { ...study.session, notes } }
    let remaining = MAX_STUDY_BYTES - new TextEncoder().encode(JSON.stringify(envelope(study))).length
    for (const key of Object.keys(notes)) {
      const count = Math.min(499, Math.floor(remaining / 3))
      notes[key] += '字'.repeat(count)
      remaining -= count * 3
    }
    notes['360'] += 'a'.repeat(remaining)
    expect(Object.values(notes).every(text => text.length > 0 && text.length <= 500)).toBe(true)
    const raw = JSON.stringify(envelope(study))
    expect(new TextEncoder().encode(raw).length).toBe(MAX_STUDY_BYTES)
    expect(raw.length).toBeLessThan(MAX_STUDY_BYTES)
    const { data, storage } = memory('旧试走')
    expect(saveStudy(storage, study)).toBe(true)
    expect(data.get(KEY)).toBe(raw)
    expect(loadStudy(storage)).toEqual({ study, error: '' })
    notes['360'] += 'a'
    const before = new Map(data)
    expect(saveStudy(storage, study)).toBe(false)
    expect(data).toEqual(before)
    invalidRaw(JSON.stringify(envelope(study)))
  })

  it('clears exactly the new study key and treats a missing draft as already clear', () => {
    const { data, storage } = memory('旧试走')
    expect(clearStudy(storage)).toBe(true)
    expect(data.has(KEY)).toBe(false)
    expect(clearStudy(storage)).toBe(true)
    expect([...data.keys()]).toEqual(['xiangqi-progress', 'xiangqi-prefs', 'xiangqi-session'])
    expect(storage.removeItem).toHaveBeenCalledWith(KEY)
    expect(storage.getItem).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('gates raw UTF-8 size before parsing or replay and preserves oversized old data', () => {
    expect(MAX_STUDY_BYTES).toBe(512 * 1024)
    const raw = '字'.repeat(180000)
    expect(raw.length).toBeLessThan(MAX_STUDY_BYTES)
    const parse = vi.spyOn(JSON, 'parse')
    const replay = vi.spyOn(rules, 'tryMove')
    invalidRaw(raw)
    expect(parse).not.toHaveBeenCalled()
    expect(replay).not.toHaveBeenCalled()
  })
})
