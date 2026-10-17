import { beforeAll, describe, expect, it } from 'vitest'
import { archiveStudy, createStudy, MAX_STUDY_PLIES, playStudy, resetStudy, truncateStudy, undoStudy } from '../src/core/study'
import type { Study, StudyOrigin } from '../src/core/study'
import { inspectArchive } from '../src/core/archive-codec'
import type { Result } from '../src/core/archive-codec'
import { buildCaptureTimeline } from '../src/core/captures'
import { openings } from '../src/content/openings'
import { createGame, tryMove } from '../src/core/rules'
import { acceptDraw, createSession, offerDraw, play, resign, setView } from '../src/core/session'
import type { Session } from '../src/core/session'
import { setNote } from '../src/core/review'
import type { Board, Move } from '../src/core/types'

type Coordinates = [number, number, number, number]
const move = ([x, y, tx, ty]: Coordinates): Move => ({ from: { x, y }, to: { x: tx, y: ty } })
const line: Coordinates[] = [[0, 6, 0, 5], [0, 3, 0, 4], [0, 5, 0, 4], [2, 3, 2, 4], [2, 6, 2, 5], [2, 4, 2, 5]]
const horseCycle: Coordinates[] = [[1, 9, 2, 7], [1, 0, 2, 2], [2, 7, 1, 9], [2, 2, 1, 0]]
const origin: StudyOrigin = { kind: 'match', title: '  实战复盘  ', orientation: 'black' }
function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
function played(moves: Move[], session = createSession()): Session {
  for (const item of moves) {
    const next = play(session, item)
    if (!next.ok) throw new Error(next.error)
    session = next.session
  }
  return session
}
function fork(source = setView(played(line.map(move)), 3)): Study { return value(createStudy(source, origin)) }
function rejected(result: Result<unknown>) {
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error).toMatch(/[\u4e00-\u9fff]/)
  expect(result).not.toHaveProperty('value')
}

describe('prove and fork the selected history prefix', () => {
  it('uses the viewed third ply, preserves turn and real history, and starts local captures and notes empty', () => {
    const source = { ...setView(played(line.map(move), createSession('ai', 'black')), 3), notes: { '3': '原局笔记' }, drawOfferedBy: 'red' as const }
    const before = structuredClone(source)
    const study = fork(source)
    expect(study.source).toEqual({ kind: 'match', title: '实战复盘', ply: 3 })
    expect(study.orientation).toBe('black')
    expect(study.session).toMatchObject({ game: source.snapshots[3], records: [], snapshots: [source.snapshots[3]], viewIndex: 0, notes: {}, mode: 'local', playerSide: 'red', drawOfferedBy: null, origin: { version: 1, startMoves: line.slice(0, 3).map(move) } })
    expect(study.session.game.turn).toBe('black')
    const frame = buildCaptureTimeline(study.session)[0]
    expect(frame.ok && frame.lost.black.soldier).toBe(0)
    expect(source).toEqual(before)
  })

  it('proves explicit imported origins and every known legacy opening prefix', () => {
    const imported = value(inspectArchive({ format: 'yixiang-game', version: 1, title: '来源', startMoves: line.slice(0, 3).map(move), moves: line.slice(3).map(move), ending: null })).session
    expect(fork(setView(imported, 1)).session.origin?.startMoves).toEqual(line.slice(0, 4).map(move))
    for (const opening of openings) for (let count = 1; count <= opening.steps.length; count++) {
      const moves = opening.steps.slice(0, count).map(step => step.move)
      const game = played(moves).game
      const study = fork({ ...createSession(), game, snapshots: [game] })
      expect(study.session.origin?.startMoves).toEqual(moves)
      expect(study.session.game).toEqual(game)
    }
  })

  it('ignores stored notation, coordinate, side, capture and check captions as evidence', () => {
    const source = setView(played(line.map(move)), 3)
    const forged = { ...source, records: source.records.map(record => ({ ...record, notation: '假将死', coordinate: '假', side: 'black' as const, captured: false, check: true })) }
    expect(fork(forged)).toEqual(fork(source))
  })

  it('reads only the required prefix even when later history, snapshots and final game are broken', () => {
    const source = played(line.map(move))
    const expected = fork(setView(source, 3))
    source.records[3] = null as unknown as typeof source.records[number]
    source.snapshots.length = 4
    source.game = null as unknown as typeof source.game
    expect(fork(setView(source, 3))).toEqual(expected)
  })

  it.each([-1, 7, 1.5, NaN, Infinity])('rejects invalid selected index %s', viewIndex => {
    rejected(createStudy({ ...played(line.map(move)), viewIndex }, origin))
  })

  it('validates source metadata, malformed containers and coordinate integers without throwing', () => {
    for (const metadata of [null, { ...origin, kind: 'other' }, { ...origin, title: '' }, { ...origin, title: ' ' }, { ...origin, title: '字'.repeat(41) }, { ...origin, orientation: 'blue' }]) {
      rejected(createStudy(createSession(), metadata as StudyOrigin))
    }
    for (const source of [null, {}, { ...createSession(), records: null }, { ...createSession(), snapshots: [] }]) rejected(createStudy(source as Session, origin))
    for (const coordinates of [[0.5, 6, 0, 5], [0, 6, 9, 5], [0, 6, 0, 10], [0, -1, 0, 5]]) {
      const source = played([move(line[0])])
      source.records[0].move = move(coordinates as Coordinates)
      rejected(createStudy(source, origin))
    }
    for (const kind of ['match', 'collection', 'file'] as const) expect(value(createStudy(createSession(), { ...origin, kind })).source.kind).toBe(kind)
  })

  it.each(['move', 'snapshot', 'sparse-board', 'sparse-row', 'counter', 'keys', 'sparse-keys', 'turn', 'repetition', 'result'] as const)('rejects a required bad %s with a Chinese result', field => {
    const source = structuredClone(played(line.slice(0, 3).map(move)))
    const game = source.snapshots[2]
    if (field === 'move') source.records[1].move = move([8, 8, 8, 7])
    else if (field === 'snapshot') source.snapshots[2] = null as unknown as typeof game
    else if (field === 'sparse-board') game.board = Array(10)
    else if (field === 'sparse-row') delete game.board[4][4]
    else if (field === 'counter') game.noCapturePlies++
    else if (field === 'keys') game.positionKeys.push('伪造')
    else if (field === 'sparse-keys') delete game.positionKeys[0]
    else if (field === 'turn') game.turn = 'black'
    else if (field === 'repetition') game.repetitionWarning = !game.repetitionWarning
    else game.result = { reason: 'checkmate', winner: 'black' }
    rejected(createStudy(source, origin))
  })

  it('rejects unknown/reset starting history and invalid or nonmatching origins', () => {
    const game = played([move(line[0])]).game
    const unknown = { ...createSession(), game, snapshots: [game] }
    rejected(createStudy(unknown, origin))
    const openingGame = played(openings[0].steps.map(step => step.move)).game
    const reset = createGame(openingGame.board, openingGame.turn)
    rejected(createStudy({ ...createSession(), game: reset, snapshots: [reset] }, origin))
    rejected(createStudy({ ...createSession(), origin: { version: 1, startMoves: [move(line[0])] } }, origin))
    rejected(createStudy({ ...createSession(), origin: { version: 2, startMoves: [] } } as unknown as Session, origin))
  })

  it('guides selected resignation and agreement targets to an earlier position, with or without explicit origins', () => {
    for (const count of [0, 3, 6]) for (const explicitOrigin of [false, true]) {
      const source = played(line.slice(0, count).map(move))
      const session = explicitOrigin ? { ...source, origin: { version: 1 as const, startMoves: [] } } : source
      for (const ended of [resign(session, 'black'), acceptDraw(offerDraw(session, 'red'), 'black')]) {
        expect(createStudy(ended, origin)).toEqual({ ok: false, error: '所选局面已结束，请选择更早的位置' })
      }
    }
    const imported = value(inspectArchive({ format: 'yixiang-game', version: 1, title: '来源', startMoves: line.slice(0, 3).map(move), moves: line.slice(3).map(move), ending: null })).session
    for (const ended of [resign(imported, 'red'), acceptDraw(offerDraw(imported, 'black'), 'red')]) {
      expect(createStudy(ended, origin)).toEqual({ ok: false, error: '所选局面已结束，请选择更早的位置' })
    }
  })

  it('forks earlier nonterminal positions of ended sources while still refusing damaged required history', () => {
    const source = played(line.map(move))
    const expected = fork(setView(source, 3))
    for (const ended of [resign(source, 'black'), acceptDraw(offerDraw(source, 'red'), 'black')]) {
      const viewed = setView(ended, 3)
      expect(fork(viewed)).toEqual(expected)
      const damaged = structuredClone(viewed)
      damaged.snapshots[2].noCapturePlies++
      rejected(createStudy(damaged, origin))
    }
  })

  it('rejects actual checkmate and stalemate target states', () => {
    const mate: Coordinates[] = [[1,7,0,7],[7,2,3,2],[7,9,6,7],[1,2,1,1],[6,7,7,9],[1,1,4,1],[7,9,6,7],[2,0,4,2],[6,7,7,9],[3,2,3,1],[7,9,6,7],[2,3,2,4],[6,7,7,9],[1,0,0,2],[7,9,6,7],[0,2,2,3],[6,7,7,9],[2,3,4,4],[7,9,6,7],[0,3,0,4],[6,7,7,9],[0,4,0,5],[7,9,6,7],[0,5,1,5],[0,7,0,0]]
    const session = played(mate.map(move))
    expect(session.game.result?.reason).toBe('checkmate')
    rejected(createStudy(session, origin))
    const board: Board = Array.from({ length: 10 }, () => Array(9).fill(null))
    board[9][4] = { side: 'red', type: 'general' }; board[0][3] = { side: 'black', type: 'general' }
    board[8][3] = { side: 'black', type: 'rook' }; board[7][5] = { side: 'black', type: 'rook' }
    const ending = tryMove(createGame(board, 'black'), move([5, 7, 5, 8]))
    expect(ending.ok && ending.game.result?.reason).toBe('stalemate')
    if (!ending.ok) throw new Error(ending.error)
    rejected(createStudy({ ...createSession(), game: ending.game, snapshots: [ending.game] }, origin))
  })
})

describe('local trial operations and archive', () => {
  it('plays real legal moves, rejects wrong turn/view, and undoes exactly one local ply', () => {
    const initial = fork()
    rejected(playStudy(initial, move(line[4])))
    const one = value(playStudy(initial, move(line[3])))
    const two = value(playStudy(one, move(line[4])))
    expect(two.session.records).toHaveLength(2)
    expect(undoStudy(two)).toEqual(one)
    expect(undoStudy(one)).toEqual(initial)
    expect(undoStudy(initial)).toBe(initial)
    rejected(playStudy({ ...two, session: setView(two.session, 0) }, move(line[5])))
  })

  it('resets to the proved first snapshot without resetting counters, origin or provenance', () => {
    const initial = fork()
    const one = value(playStudy(initial, move(line[3])))
    const noted = { ...one, session: { ...setNote(one.session, 1, '试走'), drawOfferedBy: 'black' as const } }
    const before = structuredClone(noted)
    expect(resetStudy(noted)).toEqual(initial)
    expect(noted).toEqual(before)
  })

  it('truncates at the viewed position, keeps only valid notes and permits a new branch', () => {
    let study = fork()
    for (const item of line.slice(3)) study = value(playStudy(study, move(item)))
    expect(truncateStudy(study)).toBe(study)
    const viewed = { ...study, session: { ...setView(study.session, 1), notes: { '1': '保留', '2': '删除', '0': '无效', '01': '无效' }, drawOfferedBy: 'red' as const } }
    const before = structuredClone(viewed)
    const cut = truncateStudy(viewed)
    expect(cut.session).toMatchObject({ records: study.session.records.slice(0, 1), snapshots: study.session.snapshots.slice(0, 2), game: study.session.snapshots[1], viewIndex: 1, notes: { '1': '保留' }, drawOfferedBy: null, origin: study.session.origin })
    expect(value(playStudy(cut, move([6, 6, 6, 5]))).session.records).toHaveLength(2)
    expect(truncateStudy({ ...study, session: setView(study.session, 0) })).toEqual(fork())
    expect(viewed).toEqual(before)
  })

  it('archives only after a local trial move, validates the result and isolates every mutable input', () => {
    const source = setView(played(line.map(move)), 3)
    const before = structuredClone(source)
    const initial = fork(source)
    rejected(archiveStudy(initial, '空试走'))
    const inputMove = move(line[3])
    const one = value(playStudy(initial, inputMove))
    inputMove.to.x = 8
    const noted = { ...one, session: setNote(one.session, 1, '试走笔记') }
    const saved = value(archiveStudy(noted, '  试走收藏  '))
    expect(saved).toMatchObject({ title: '试走收藏', startMoves: line.slice(0, 3).map(move), moves: [move(line[3])], notes: { '1': '试走笔记' } })
    expect(value(inspectArchive(saved)).session.game).toEqual(noted.session.game)
    rejected(archiveStudy(noted, ' '))
    rejected(archiveStudy({ ...noted, session: { ...noted.session, game: createGame() } }, '伪造'))
    saved.startMoves[0].from.x = 8; saved.moves[0].to.x = 8; saved.notes!['1'] = '改'
    expect(noted.session.origin?.startMoves).toEqual(line.slice(0, 3).map(move))
    expect(noted.session.records[0].move).toEqual(move(line[3]))
    expect(noted.session.notes).toEqual({ '1': '试走笔记' })
    initial.session.game.board[4][0] = null
    initial.session.game.positionKeys[0] = '改'
    initial.session.origin!.startMoves[0].to.x = 8
    expect(source).toEqual(before)
  })
})

describe('real rule counters and total-ply boundary', () => {
  let quiet: Session
  let long: Session
  beforeAll(() => {
    quiet = played(Array.from({ length: 120 }, (_, index) => move(horseCycle[index % 4])))
    const blackFirst = [horseCycle[1], horseCycle[0], horseCycle[3], horseCycle[2]]
    const moves: Coordinates[] = []
    for (const [index, x] of [0, 2, 6, 8, 4].entries()) {
      const waiting = index % 2 === 0 ? horseCycle : blackFirst
      for (let round = 0; round < 28; round++) moves.push(...waiting)
      moves.push(...(index % 2 === 0 ? [[x, 6, x, 5], [x, 3, x, 4], [x, 5, x, 4]] : [[x, 3, x, 4], [x, 6, x, 5], [x, 4, x, 5]]) as Coordinates[])
    }
    for (let index = 0; index < 26; index++) moves.push(blackFirst[index % 4])
    long = played(moves.map(move))
  })

  it('keeps 119 real quiet plies and repetition so the next local move really draws', () => {
    const study = fork(setView(quiet, 119))
    expect(study.session.game.noCapturePlies).toBe(119)
    expect(study.session.game.positionKeys).toHaveLength(120)
    expect(study.session.game.repetitionWarning).toBe(true)
    const drawn = value(playStudy(study, move(horseCycle[3])))
    expect(drawn.session.game.result).toEqual({ winner: null, reason: 'natural-limit' })
    rejected(playStudy(drawn, move(horseCycle[0])))
    expect(undoStudy(drawn)).toEqual(study)
    expect(truncateStudy({ ...drawn, session: setView(drawn.session, 0) })).toEqual(study)
    expect(value(inspectArchive(value(archiveStudy(drawn, '自然限着试走')))).session.game).toEqual(quiet.game)
    rejected(createStudy(quiet, origin))
  })

  it('allows a real 601-ply source to fork at 599, reach 600 once, archive, and then stop', () => {
    expect(MAX_STUDY_PLIES).toBe(600)
    expect(long.records).toHaveLength(601)
    expect(long.game.result).toBeNull()
    const before = structuredClone(long)
    const study = fork(setView(long, 599))
    expect(study.session.origin?.startMoves).toHaveLength(599)
    const final = value(playStudy(study, long.records[599].move))
    expect(final.session.records).toHaveLength(1)
    expect(final.session.game).toEqual(long.snapshots[600])
    rejected(playStudy(final, long.records[600].move))
    const saved = value(archiveStudy(final, '六百着'))
    expect(saved.startMoves.length + saved.moves.length).toBe(600)
    expect(undoStudy(final)).toEqual(study)
    rejected(createStudy(setView(long, 600), origin))
    rejected(createStudy(long, origin))
    expect(long).toEqual(before)
  })
})
