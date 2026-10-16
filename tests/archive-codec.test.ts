import { describe, expect, it } from 'vitest'
import { archiveSession, checkArchiveShape, checkSessionOrigin, inspectArchive, readGameFile, writeGameFile } from '../src/core/archive-codec'
import type { ArchivedGame, Result } from '../src/core/archive-codec'
import { openings } from '../src/content/openings'
import { createGame, legalMoves } from '../src/core/rules'
import { acceptDraw, createSession, offerDraw, play, resign, setView } from '../src/core/session'
import type { Session } from '../src/core/session'
import type { Move } from '../src/core/types'

const m = (fx: number, fy: number, tx: number, ty: number): Move => ({ from: { x: fx, y: fy }, to: { x: tx, y: ty } })
const first = m(0, 6, 0, 5)
const second = m(0, 3, 0, 4)
function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
function played(moves: Move[], session = createSession()): Session {
  for (const move of moves) {
    const result = play(session, move)
    if (!result.ok) throw new Error(result.error)
    session = result.session
  }
  return session
}
const archive = (moves: Move[] = [first]): ArchivedGame => ({ format: 'yixiang-game', version: 1, title: '棋局', startMoves: [], moves, ending: null })
const horseCycle = [m(1, 9, 2, 7), m(1, 0, 2, 2), m(2, 7, 1, 9), m(2, 2, 1, 0)]

describe('game archive codec', () => {
  it('normalizes origin cheaply without accepting unknown fields, versions or invalid coordinates', () => {
    expect(value(checkSessionOrigin({ version: 1, startMoves: [] }))).toEqual({ version: 1, startMoves: [] })
    expect(checkSessionOrigin({ version: 1, startMoves: Array(600).fill(first) }).ok).toBe(true)
    for (const input of [null, { version: 2, startMoves: [] }, { version: 1, startMoves: [], result: null },
      { version: 1, startMoves: Array(601).fill(first) }, { version: 1, startMoves: [m(0, 0, -1, 0)] }]) {
      expect(checkSessionOrigin(input).ok).toBe(false)
    }
    const source = { version: 1, startMoves: [second] }
    const copy = value(checkSessionOrigin(source))
    copy.startMoves[0].from.x = 8
    expect(source.startMoves[0].from.x).toBe(0)
  })

  it.each(['local', 'ai'] as const)('replays a full %s history while viewing the beginning, preserving explicit notes', mode => {
    const session = { ...setView(played([first, second], createSession(mode, 'black')), 0), notes: { '2': '  看清下一步。  ' } }
    const before = structuredClone(session)
    const saved = value(archiveSession(session, '  我的棋局  '))
    expect(saved.title).toBe('我的棋局')
    expect(saved.moves).toHaveLength(2)
    expect(saved.notes).toEqual(session.notes)
    const restored = value(inspectArchive(saved)).session
    expect(restored.game).toEqual(session.game)
    expect(restored.records).toEqual(session.records)
    expect(restored.viewIndex).toBe(2)
    expect(restored.mode).toBe('local')
    expect(restored.playerSide).toBe('red')
    expect(restored.drawOfferedBy).toBe(null)
    expect(restored.origin).toEqual({ version: 1, startMoves: [] })
    expect(session).toEqual(before)
  })

  it('recognizes every legal prefix of all four legacy openings and preserves its history counters', () => {
    for (const opening of openings) for (let length = 1; length <= opening.steps.length; length++) {
      const startMoves = opening.steps.slice(0, length).map(step => step.move)
      const setup = played(startMoves)
      const legacy = { ...createSession(), game: setup.game, snapshots: [setup.game] }
      const saved = value(archiveSession(legacy, opening.title))
      expect(saved.startMoves).toEqual(startMoves)
      expect(saved.moves).toEqual([])
      const imported = value(inspectArchive(saved)).session
      expect(imported.snapshots[0]).toEqual(setup.game)
      const next = legalMoves(imported.game.board, imported.game.turn)[0]
      const continued = { ...played([next], imported), notes: { '1': '接着练习' } }
      expect(value(inspectArchive(value(archiveSession(continued, opening.title)))).session.game).toEqual(continued.game)
    }
  })

  it('rejects an unproved starting board, reset counters, broken origin, and changed history', () => {
    expect(archiveSession(createSession(), '空局').ok).toBe(false)
    const known = played(openings[0].steps.map(step => step.move))
    const legacy = { ...createSession(), game: known.game, snapshots: [known.game] }
    const reset = createGame(known.game.board, known.game.turn)
    expect(archiveSession({ ...legacy, game: reset, snapshots: [reset] }, '计数重置').ok).toBe(false)
    const unknown = played([first])
    expect(archiveSession({ ...createSession(), game: unknown.game, snapshots: [unknown.game] }, '未知局面').ok).toBe(false)
    expect(archiveSession({ ...unknown, origin: { version: 1, startMoves: [first] } }, '来源错').ok).toBe(false)
    expect(archiveSession({ ...unknown, origin: { version: 2, startMoves: [] } } as unknown as Session, '版本错').ok).toBe(false)
    const altered = structuredClone(played([first, second]))
    altered.snapshots[1].noCapturePlies = 99
    expect(archiveSession(altered, '历史错').ok).toBe(false)
    const finalAltered = structuredClone(unknown)
    finalAltered.game = { ...finalAltered.game, repetitionWarning: true }
    expect(archiveSession(finalAltered, '末局错').ok).toBe(false)
    const sparse = structuredClone(unknown)
    sparse.snapshots[0].board = Array(10)
    expect(archiveSession(sparse, '稀疏棋盘').ok).toBe(false)
    const sparseKeys = structuredClone(unknown)
    sparseKeys.snapshots[0].positionKeys = Array(1)
    expect(archiveSession(sparseKeys, '缺失历史').ok).toBe(false)
  })

  it('rebuilds record captions, capture and check flags from the engine', () => {
    const moves = [m(7, 7, 4, 7), m(3, 0, 4, 1), m(4, 7, 4, 3), m(4, 1, 3, 2), first]
    const session = played(moves)
    expect(session.records[2].captured).toBe(true)
    expect(session.records[2].check).toBe(true)
    const corruptedCaptions = { ...session, records: session.records.map(record => ({ ...record, notation: '<img src=x>', coordinate: '假的', side: 'black' as const, captured: false, check: false })) }
    const restored = value(inspectArchive(value(archiveSession(corruptedCaptions, '真实记录')))).session
    expect(restored.records).toEqual(session.records)
  })

  it('replays 120 real quiet plies, repetition and automatic natural-limit, rejecting later moves or manual overrides', () => {
    const moves = Array.from({ length: 30 }, () => horseCycle).flat()
    const restored = value(inspectArchive(archive(moves))).session
    expect(restored.game.noCapturePlies).toBe(120)
    expect(restored.game.repetitionWarning).toBe(true)
    expect(restored.game.result).toEqual({ winner: null, reason: 'natural-limit' })
    expect(value(archiveSession(restored, '自然限着')).ending).toBe(null)
    const extra = inspectArchive(archive([...moves, horseCycle[0]]))
    expect(extra.ok).toBe(false)
    if (!extra.ok) expect(extra.error).toContain('121')
    expect(inspectArchive({ ...archive(moves), ending: { reason: 'agreement' } }).ok).toBe(false)
    expect(inspectArchive({ ...archive([]), startMoves: moves, moves: [horseCycle[0]] }).ok).toBe(false)
  })

  it.each(['red', 'black'] as const)('roundtrips a %s resignation and agreed draw with authoritative final snapshots', side => {
    const source = played([first, second])
    const resigned = resign(source, side)
    const saved = value(archiveSession(resigned, '认输'))
    expect(saved.ending).toEqual({ reason: 'resignation', side })
    expect(value(inspectArchive(saved)).session).toMatchObject({ game: resigned.game, snapshots: resigned.snapshots })
    const drawn = acceptDraw(offerDraw(source, 'red'), 'black')
    expect(value(archiveSession(drawn, '议和')).ending).toEqual({ reason: 'agreement' })
    const forged = { ...source, game: { ...source.game, result: { winner: 'red' as const, reason: 'checkmate' as const } } }
    expect(archiveSession(forged, '假将死').ok).toBe(false)
    const early = structuredClone(resigned)
    early.snapshots[1].result = { winner: 'black', reason: 'resignation' }
    expect(archiveSession(early, '提前认输').ok).toBe(false)
    const missingEnding = structuredClone(resigned)
    missingEnding.snapshots[2] = { ...missingEnding.snapshots[2], result: undefined } as unknown as typeof missingEnding.game
    expect(archiveSession(missingEnding, '丢失结局').ok).toBe(false)
  })

  it('recognizes legacy opening provenance when the final manual ending is its only snapshot', () => {
    const setup = played(openings[0].steps.map(step => step.move))
    const legacy = { ...createSession(), game: setup.game, snapshots: [setup.game] }
    const saved = value(archiveSession(resign(legacy, 'black'), '棋路认输'))
    expect(saved.startMoves).toEqual(openings[0].steps.map(step => step.move))
    expect(saved.moves).toEqual([])
    expect(value(inspectArchive(saved)).session.game.result).toEqual({ winner: 'red', reason: 'resignation' })
  })

  it('replays an actual 25-ply smothered mate and refuses moves and declarations after it', () => {
    const line = [[1,7,0,7],[7,2,3,2],[7,9,6,7],[1,2,1,1],[6,7,7,9],[1,1,4,1],[7,9,6,7],[2,0,4,2],[6,7,7,9],[3,2,3,1],[7,9,6,7],[2,3,2,4],[6,7,7,9],[1,0,0,2],[7,9,6,7],[0,2,2,3],[6,7,7,9],[2,3,4,4],[7,9,6,7],[0,3,0,4],[6,7,7,9],[0,4,0,5],[7,9,6,7],[0,5,1,5],[0,7,0,0]]
    const moves = line.map(([fx, fy, tx, ty]) => m(fx, fy, tx, ty))
    const session = value(inspectArchive(archive(moves))).session
    expect(session.game.result).toEqual({ winner: 'red', reason: 'checkmate' })
    expect(session.records.at(-1)).toMatchObject({ captured: true, check: true })
    expect(value(archiveSession(session, '闷宫')).ending).toBe(null)
    expect(inspectArchive(archive([...moves, second])).ok).toBe(false)
    expect(inspectArchive({ ...archive(moves), ending: { reason: 'resignation', side: 'red' } }).ok).toBe(false)
    expect(inspectArchive({ ...archive([]), startMoves: moves, moves: [second] }).ok).toBe(false)
  })

  it('reports the total ply for illegal moves before and after the setup boundary', () => {
    const bad = m(0, 3, 0, 4)
    for (const input of [archive([bad]), archive([first, first]), { ...archive([first]), startMoves: [first] }]) {
      const result = inspectArchive(input)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/第[12]着.+/)
    }
  })

  it('strictly validates title, versions, whitelisted fields and coordinates without throwing', () => {
    const invalid: unknown[] = [null, [], { ...archive(), version: 2 }, { ...archive(), title: ' ' }, { ...archive(), title: '字'.repeat(41) },
      { ...archive(), result: null }, { ...archive(), caption: '赢了' }, { ...archive(), learning: {} },
      { ...archive(), ending: { reason: 'checkmate', winner: 'red' } }, { ...archive(), ending: { reason: 'resignation', side: 'blue' } },
      { ...archive(), ending: { reason: 'agreement', side: 'red' } }, { ...archive(), moves: [{ ...first, check: true }] },
      { ...archive(), moves: [{ from: { x: 0.5, y: 6 }, to: { x: 0, y: 5 } }] },
      { ...archive(), moves: [m(9, 6, 0, 5)] }, { ...archive(), moves: [m(0, 10, 0, 5)] },
      { ...archive(), moves: [{ from: { ...first.from, url: 'https://x' }, to: first.to }] },
      JSON.parse(JSON.stringify(archive()).replace('"title"', '"__proto__":{},"title"')),
    ]
    const cyclic: Record<string, unknown> = { ...archive() }; cyclic.extra = cyclic; invalid.push(cyclic)
    for (const input of invalid) {
      const result = checkArchiveShape(input)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/[\u4e00-\u9fff]/)
    }
    expect(checkArchiveShape(archive(Array(600).fill(first))).ok).toBe(true)
    expect(checkArchiveShape(archive(Array(601).fill(first))).ok).toBe(false)
    expect(checkArchiveShape(archive([])).ok).toBe(false)
  })

  it('strictly validates move-indexed notes and returns independent canonical clones', () => {
    for (const notes of [{ '0': '错' }, { '1.0': '错' }, { '2': '越界' }, { '1': '' }, { '1': '  ' }, { '1': 123 }, { '1': '字'.repeat(501) }, JSON.parse('{"__proto__":"坏"}')]) {
      expect(checkArchiveShape({ ...archive(), notes }).ok).toBe(false)
    }
    const source = { ...archive(), notes: { '1': '<a href="file:///etc">文字</a>' } }
    const clone = value(checkArchiveShape(source))
    clone.moves[0].from.x = 8
    clone.notes!['1'] = '改'
    expect(source.moves[0].from.x).toBe(0)
    expect(source.notes['1']).toContain('file:///')
  })

  it('defaults to notes-free export and permits large internal notes only when the exported file fits', () => {
    const repeated = (cycle: Move[], count: number) => Array.from({ length: count }, () => cycle).flat()
    const blackFirst = [horseCycle[1], horseCycle[0], horseCycle[3], horseCycle[2]]
    const moves = [...repeated(horseCycle, 28), first, second, m(0, 5, 0, 4),
      ...repeated(blackFirst, 28), m(2, 3, 2, 4), m(2, 6, 2, 5), m(2, 4, 2, 5),
      ...repeated(horseCycle, 28), m(6, 6, 6, 5), m(6, 3, 6, 4), m(6, 5, 6, 4),
      ...repeated(blackFirst, 4)]
    const source = { ...archive(moves), notes: Object.fromEntries(moves.map((_, index) => [String(index + 1), '字'.repeat(500)])) }
    expect(checkArchiveShape(source).ok).toBe(true)
    expect(writeGameFile(source).ok).toBe(true)
    expect(writeGameFile(source, true).ok).toBe(false)
    const small = { ...archive(), notes: { '1': '笔记' } }
    expect(JSON.parse(value(writeGameFile(small))).notes).toBeUndefined()
    expect(JSON.parse(value(writeGameFile(small, true))).notes).toEqual(small.notes)
    expect(small.notes['1']).toBe('笔记')
  })

  it('refuses to export illegal history even when its structure is valid', () => {
    expect(writeGameFile(archive([second])).ok).toBe(false)
    expect(writeGameFile({ ...archive(), ending: { reason: 'resignation', side: 'black' } }).ok).toBe(true)
  })

  it('checks raw UTF-8 file size before parsing and safely rejects malformed JSON', () => {
    const json = JSON.stringify(archive())
    const exact = json + ' '.repeat(512 * 1024 - new TextEncoder().encode(json).length)
    expect(readGameFile(exact).ok).toBe(true)
    expect(readGameFile(exact + ' ').ok).toBe(false)
    expect(readGameFile('字'.repeat(180000)).ok).toBe(false)
    expect(readGameFile('{').ok).toBe(false)
    const imported = value(readGameFile(value(writeGameFile(archive()))))
    expect(imported.session.records).toHaveLength(1)
  })
})
