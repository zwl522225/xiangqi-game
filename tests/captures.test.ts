import { describe, expect, it } from 'vitest'
import { buildCaptureTimeline } from '../src/core/captures'
import type { CaptureCounts, CaptureFrame } from '../src/core/captures'
import { inspectArchive } from '../src/core/archive-codec'
import { createGame } from '../src/core/rules'
import { acceptDraw, createSession, offerDraw, play, resign, setView, undo } from '../src/core/session'
import type { Session } from '../src/core/session'
import type { Board, Move } from '../src/core/types'

type Coordinates = [number, number, number, number]
const move = ([x, y, tx, ty]: Coordinates): Move => ({ from: { x, y }, to: { x: tx, y: ty } })
const collision: Coordinates[] = [[0, 6, 0, 5], [0, 3, 0, 4], [0, 5, 0, 4]]
function played(moves: Coordinates[], initial = createSession()): Session {
  return moves.reduce((session, coordinates) => {
    const result = play(session, move(coordinates))
    if (!result.ok) throw new Error(result.error)
    return result.session
  }, initial)
}
function counts(frame: CaptureFrame): CaptureCounts {
  expect(frame.ok).toBe(true)
  if (!frame.ok) throw new Error(frame.error)
  return frame.lost
}
const zero = () => ({ general: 0, advisor: 0, elephant: 0, horse: 0, rook: 0, cannon: 0, soldier: 0 })
function expectUnknown(frame: CaptureFrame) {
  expect(frame.ok).toBe(false)
  if (!frame.ok) expect(frame.error).toMatch(/[\u4e00-\u9fff]/)
  expect(frame).not.toHaveProperty('lost')
}

describe('actual captures for each local-history prefix', () => {
  it('starts with all seven types at zero and counts the actual third-ply capture by lost side', () => {
    const frames = buildCaptureTimeline(played(collision))
    expect(frames).toHaveLength(4)
    expect(frames[0]).toEqual({ ok: true, lost: { red: zero(), black: zero() } })
    expect(frames[1]).toEqual(frames[0])
    expect(frames[2]).toEqual(frames[0])
    expect(counts(frames[3])).toEqual({ red: zero(), black: { ...zero(), soldier: 1 } })
  })

  it('accumulates both sides and different piece types from a real custom starting board', () => {
    const board: Board = Array.from({ length: 10 }, () => Array(9).fill(null))
    board[9][5] = { side: 'red', type: 'general' }
    board[0][3] = { side: 'black', type: 'general' }
    board[5][0] = { side: 'red', type: 'rook' }
    board[5][2] = { side: 'black', type: 'horse' }
    board[4][8] = { side: 'black', type: 'rook' }
    board[6][8] = { side: 'red', type: 'elephant' }
    board[3][2] = { side: 'black', type: 'soldier' }
    const game = createGame(board)
    const session = played([[0, 5, 2, 5], [8, 4, 8, 6], [2, 5, 2, 3]], { ...createSession(), game, snapshots: [game] })
    expect(counts(buildCaptureTimeline(session)[3])).toEqual({ red: { ...zero(), elephant: 1 }, black: { ...zero(), horse: 1, soldier: 1 } })
  })

  it('ignores forged captured flags, notation and check flags in either direction', () => {
    const session = played(collision)
    const expected = buildCaptureTimeline(session)
    for (const captured of [false, true]) {
      const forged = { ...session, records: session.records.map(record => ({ ...record, captured, notation: '吃车！', check: true })) }
      expect(buildCaptureTimeline(forged)).toEqual(expected)
    }
  })

  it('follows view prefixes, undo and a new session without changing the history', () => {
    const session = played(collision)
    const frames = buildCaptureTimeline(session)
    const viewed = setView(session, 2)
    expect(counts(buildCaptureTimeline(viewed)[viewed.viewIndex]).black.soldier).toBe(0)
    expect(buildCaptureTimeline(viewed)).toEqual(frames)
    expect(buildCaptureTimeline(undo(session))).toEqual(frames.slice(0, 3))
    expect(buildCaptureTimeline(createSession())).toEqual([frames[0]])
  })

  it.each(['move', 'board', 'turn', 'noCapturePlies', 'positionKeys', 'repetitionWarning', 'result'] as const)('keeps earlier prefixes but marks a bad %s and all later prefixes unknown', field => {
    const session = structuredClone(played(collision))
    if (field === 'move') session.records[1].move = move([8, 8, 8, 7])
    else if (field === 'board') session.snapshots[2].board[3][0] = { side: 'black', type: 'soldier' }
    else if (field === 'turn') session.snapshots[2].turn = 'black'
    else if (field === 'noCapturePlies') session.snapshots[2].noCapturePlies++
    else if (field === 'positionKeys') session.snapshots[2].positionKeys.push('forged')
    else if (field === 'repetitionWarning') session.snapshots[2].repetitionWarning = !session.snapshots[2].repetitionWarning
    else session.snapshots[2].result = { reason: 'checkmate', winner: 'black' }
    const frames = buildCaptureTimeline(session)
    expect(frames).toHaveLength(4)
    expect(counts(frames[1])).toEqual({ red: zero(), black: zero() })
    expectUnknown(frames[2])
    expectUnknown(frames[3])
  })

  it.each([
    null, {}, { records: null, snapshots: [] },
    { records: [], snapshots: [] }, { records: [], snapshots: [null] },
    { records: [], snapshots: [{}] },
    { records: [], snapshots: [createGame(), createGame()] },
    { records: [null], snapshots: [createGame()] },
  ])('returns unknown without throwing or inventing zero for malformed history: %j', malformed => {
    let frames: CaptureFrame[] = []
    expect(() => { frames = buildCaptureTimeline(malformed as unknown as Session) }).not.toThrow()
    expect(frames.length).toBeGreaterThan(0)
    frames.forEach(expectUnknown)
  })

  it('marks a malformed empty square in an after snapshot unknown rather than reporting zero', () => {
    const session = played([[0, 6, 0, 5]])
    session.snapshots[1].board[4][2] = {} as NonNullable<Board[number][number]>
    const frames = buildCaptureTimeline(session)
    expect(frames[0]).toEqual({ ok: true, lost: { red: zero(), black: zero() } })
    expectUnknown(frames[1])
  })

  it('does not throw when a later real move targets a malformed empty square in an earlier snapshot', () => {
    const session = played([[0, 6, 0, 5], [2, 3, 2, 4]])
    session.snapshots[1].board[4][2] = {} as NonNullable<Board[number][number]>
    session.snapshots[2].noCapturePlies = 0
    let frames: CaptureFrame[] = []
    expect(() => { frames = buildCaptureTimeline(session) }).not.toThrow()
    expect(frames).toHaveLength(3)
    expect(frames[0]).toEqual({ ok: true, lost: { red: zero(), black: zero() } })
    expectUnknown(frames[1])
    expectUnknown(frames[2])
  })

  it('accepts manual resignation and agreement at the final snapshot, including a zero-move game', () => {
    for (const session of [createSession(), played(collision)]) {
      const expected = buildCaptureTimeline(session)
      expect(buildCaptureTimeline(resign(session, 'black'))).toEqual(expected)
      expect(buildCaptureTimeline(acceptDraw(offerDraw(session, 'red'), 'black'))).toEqual(expected)
    }
  })

  it('starts a legally imported local history at zero after captures in startMoves', () => {
    const imported = inspectArchive({ format: 'yixiang-game', version: 1, title: '前缀吃子', startMoves: collision.map(move), moves: [move([2, 3, 2, 4])], ending: null })
    expect(imported.ok).toBe(true)
    if (!imported.ok) throw new Error(imported.error)
    expect(buildCaptureTimeline(imported.value.session)).toEqual([
      { ok: true, lost: { red: zero(), black: zero() } },
      { ok: true, lost: { red: zero(), black: zero() } },
    ])
  })

  it('does not mutate input or share writable counts between prefixes or calls', () => {
    const session = played(collision)
    const before = structuredClone(session)
    const frames = buildCaptureTimeline(session)
    expect(session).toEqual(before)
    counts(frames[1]).red.soldier = 77
    counts(frames[1]).black.horse = 88
    expect(counts(frames[0])).toEqual({ red: zero(), black: zero() })
    expect(counts(frames[2])).toEqual({ red: zero(), black: zero() })
    expect(counts(frames[3]).red.soldier).toBe(0)
    expect(counts(buildCaptureTimeline(session)[1])).toEqual({ red: zero(), black: zero() })
    expect(session).toEqual(before)
  })

  it('replays a legal 601-ply session without imposing the file-format limit', () => {
    const redFirst: Coordinates[] = [[1, 9, 2, 7], [1, 0, 2, 2], [2, 7, 1, 9], [2, 2, 1, 0]]
    const blackFirst = [redFirst[1], redFirst[0], redFirst[3], redFirst[2]]
    const moves: Coordinates[] = []
    for (const [index, x] of [0, 2, 6, 8, 4].entries()) {
      const waiting = index % 2 === 0 ? redFirst : blackFirst
      for (let round = 0; round < 28; round++) moves.push(...waiting)
      moves.push(...(index % 2 === 0 ? [[x, 6, x, 5], [x, 3, x, 4], [x, 5, x, 4]] : [[x, 3, x, 4], [x, 6, x, 5], [x, 4, x, 5]]) as Coordinates[])
    }
    for (let index = 0; index < 26; index++) moves.push(blackFirst[index % 4])
    const session = played(moves)
    expect(session.records).toHaveLength(601)
    expect(session.game.result).toBeNull()
    const frames = buildCaptureTimeline(session)
    expect(frames).toHaveLength(602)
    expect(frames.every(frame => frame.ok)).toBe(true)
    expect(counts(frames[601])).toEqual({ red: { ...zero(), soldier: 2 }, black: { ...zero(), soldier: 3 } })
  })
})
