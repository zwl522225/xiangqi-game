import { describe, expect, it } from 'vitest'
import { endgames } from '../src/content/endgames'
import { defaultEndgameLessons, endgameFinished, endgamePosition, transitionEndgameLessons } from '../src/core/endgame-lessons'
import type { EndgameAction, EndgameData } from '../src/core/endgame-lessons'
import { legalMoves, tryMove } from '../src/core/rules'
import type { Move } from '../src/core/types'

const lesson = endgames[0]
const act = (data: EndgameData, action: EndgameAction) => transitionEndgameLessons(data, action).data
const start = (id = lesson.id) => act(defaultEndgameLessons(), { type: 'start', id })
function finish(data: EndgameData) {
  const current = endgames.find(item => item.id === data.round!.id)!
  while (!endgameFinished(data)) {
    const ply = data.round!.ply
    data = act(data, ply % 2 ? { type: 'reply' } : { type: 'submit', move: current.line[ply] })
  }
  return data
}

describe('independent endgame lesson state machine', () => {
  it('creates bounded separate records and starts either learner color without modifying defaults', () => {
    const initial = defaultEndgameLessons()
    expect(initial).toEqual({ version: 1, round: null, records: Object.fromEntries(endgames.map(item => [item.id, { version: 1, completed: false, independent: false }])) })
    for (const item of endgames) {
      const data = act(initial, { type: 'start', id: item.id })
      expect(data.round).toEqual({ id: item.id, version: 1, ply: 0, errors: 0, hadError: false, hintLevel: 0, helpUsed: false, demoUsed: false, explanationViewed: false })
      expect(endgamePosition(item, 0).turn).toBe(item.side)
      expect(endgameFinished(data)).toBe(false)
    }
    expect(initial.round).toBeNull()
    expect(act(initial, { type: 'start', id: 'unknown' })).toBe(initial)
    expect(defaultEndgameLessons()).not.toBe(initial)
  })

  it('strictly reconstructs route prefixes with fresh history and rejects invalid prefixes/routes', () => {
    for (const item of endgames) {
      for (let ply = 0; ply <= item.line.length; ply++) {
        const position = endgamePosition(item, ply)
        expect(position.positionKeys).toHaveLength(ply + 1)
        expect(position.result?.reason ?? null).toBe(ply === item.line.length ? 'checkmate' : null)
      }
      const position = endgamePosition(item, 0)
      position.board[0][0] = { side: 'red', type: 'rook' }
      expect(item.board[0][0]).toBeNull()
      for (const invalid of [-1, 0.5, NaN, Infinity, item.line.length + 1]) expect(() => endgamePosition(item, invalid)).toThrow()
    }
    const bad = structuredClone(lesson)
    bad.line[0] = { from: { x: 8, y: 9 }, to: { x: 7, y: 9 } }
    expect(() => endgamePosition(bad, 1)).toThrow()
    const early = { ...lesson, line: [...lesson.line, ...lesson.line.slice(0, 2)] }
    expect(() => endgamePosition(early, early.line.length)).toThrow()
    expect(() => endgamePosition({ ...lesson, line: lesson.line.slice(0, 1) }, 1)).toThrow()
  })

  it('advances exactly one submitted own move or one requested reply with notation from the before-board', () => {
    const original = start()
    expect(act(original, { type: 'reply' })).toBe(original)
    const submitted = transitionEndgameLessons(original, { type: 'submit', move: lesson.line[0] })
    expect(submitted.data.round!.ply).toBe(1)
    expect(submitted.message).toContain('兵四进一')
    expect(submitted.message).toContain(lesson.explanations[0])
    expect(original.round!.ply).toBe(0)
    const afterReply = act(submitted.data, { type: 'reply' })
    expect(afterReply.round!.ply).toBe(2)
    expect(act(afterReply, { type: 'reply' })).toBe(afterReply)
    expect(endgamePosition(lesson, afterReply.round!.ply).result).toBeNull()
  })

  it('locks submissions, hints, and demos during the opponent phase', () => {
    const data = act(start(), { type: 'submit', move: lesson.line[0] })
    for (const action of [{ type: 'submit', move: lesson.line[2] }, { type: 'hint' }, { type: 'demo' }] as EndgameAction[]) {
      expect(act(data, action)).toBe(data)
    }
  })

  it('separates illegal submissions from legal off-route moves and preserves the actual board', () => {
    const initial = start()
    const bad: Move = { from: { x: 7, y: 9 }, to: { x: 7, y: 8 } }
    const illegal = transitionEndgameLessons(initial, { type: 'submit', move: bad })
    expect(illegal.message).toContain('起点没有棋子')
    const position = endgamePosition(lesson, 0)
    const other = legalMoves(position.board, position.turn).find(move => JSON.stringify(move) !== JSON.stringify(lesson.line[0]))!
    const offRoute = transitionEndgameLessons(illegal.data, { type: 'submit', move: other })
    expect(offRoute.message).toContain('这是合法走法，但不在本课当前路线中')
    expect(offRoute.message).toContain('本课未判断这条变化的最终结果')
    expect(offRoute.message).not.toMatch(/输棋|棋理错误/)
    expect(offRoute.data.round).toMatchObject({ ply: 0, errors: 2, hadError: true })
    expect(endgamePosition(lesson, offRoute.data.round!.ply)).toEqual(position)
    expect(initial.round!.errors).toBe(0)
    expect(finish(offRoute.data).records[lesson.id]).toEqual({ version: 1, completed: true, independent: false })
  })

  it('bounds error counts at 999 while retaining hadError, including malformed board coordinates', () => {
    let data = start()
    data = { ...data, round: { ...data.round!, errors: 999, hadError: true } }
    for (const move of [
      { from: { x: -1, y: 0 }, to: { x: 0, y: 0 } },
      { from: { x: 0.5, y: 1 }, to: { x: 0, y: 2 } },
      { from: { x: NaN, y: 1 }, to: { x: 0, y: 2 } },
    ]) {
      data = act(data, { type: 'submit', move })
      expect(data.round).toMatchObject({ ply: 0, errors: 999, hadError: true })
    }
    expect(finish(data).records[lesson.id].independent).toBe(false)
  })

  it('reveals three own-turn hints and resets the level on progress without clearing assistance', () => {
    let data = start()
    for (let level = 1; level <= 4; level++) {
      const result = transitionEndgameLessons(data, { type: 'hint' })
      data = result.data
      expect(data.round).toMatchObject({ ply: 0, helpUsed: true, hintLevel: Math.min(3, level) })
      expect(result.message).toBe(lesson.hints[0][Math.min(3, level) - 1])
    }
    data = act(act(data, { type: 'submit', move: lesson.line[0] }), { type: 'reply' })
    expect(data.round).toMatchObject({ ply: 2, hintLevel: 0, helpUsed: true })
    const second = transitionEndgameLessons(data, { type: 'hint' })
    expect(second.message).toBe(lesson.hints[1][0])
    expect(finish(second.data).records[lesson.id].independent).toBe(false)
  })

  it('demonstrates only one own move and never answers the opponent or the rest of the route', () => {
    const initial = start()
    const one = act(initial, { type: 'demo' })
    expect(one.round).toMatchObject({ ply: 1, demoUsed: true, helpUsed: false })
    expect(act(one, { type: 'demo' })).toBe(one)
    const afterReply = act(one, { type: 'reply' })
    const done = act(afterReply, { type: 'demo' })
    expect(done.round!.ply).toBe(3)
    expect(endgameFinished(done)).toBe(true)
    expect(done.records[lesson.id]).toEqual({ version: 1, completed: true, independent: false })
  })

  it('marks same-topic explanation immediately without moving the board, including the opponent phase', () => {
    const own = start()
    expect(act(own, { type: 'explanation', topic: 'cannon' })).toBe(own)
    const explained = act(own, { type: 'explanation', topic: lesson.topic })
    expect(explained.round).toMatchObject({ ply: 0, explanationViewed: true })
    const opponent = act(start(), { type: 'submit', move: lesson.line[0] })
    const fromOpponent = act(opponent, { type: 'explanation', topic: lesson.topic })
    expect(fromOpponent.round).toMatchObject({ ply: 1, explanationViewed: true })
    expect(finish(fromOpponent).records[lesson.id].independent).toBe(false)
    expect(endgamePosition(lesson, explained.round!.ply)).toEqual(endgamePosition(lesson, 0))
  })

  it('records actual independent checkmate for all six lessons, then makes every non-start action a no-op', () => {
    for (const item of endgames) {
      const done = finish(start(item.id))
      expect(done.records[item.id]).toEqual({ version: 1, completed: true, independent: true })
      expect(done.round!.ply).toBe(item.line.length)
      const game = endgamePosition(item, done.round!.ply)
      expect(game.result).toEqual({ winner: item.side, reason: 'checkmate' })
      for (const action of [{ type: 'reply' }, { type: 'hint' }, { type: 'demo' }, { type: 'explanation', topic: item.topic }, { type: 'submit', move: item.line[0] }] as EndgameAction[]) {
        expect(act(done, action)).toBe(done)
      }
    }
  })

  it('keeps completion records monotonic while restart replaces the current round with fresh flags', () => {
    let data = finish(start())
    const records = structuredClone(data.records)
    data = act(data, { type: 'start', id: lesson.id })
    expect(data.round).toMatchObject({ ply: 0, errors: 0, hadError: false, hintLevel: 0, helpUsed: false, demoUsed: false, explanationViewed: false })
    expect(data.records).toEqual(records)
    data = finish(act(data, { type: 'hint' }))
    expect(data.records[lesson.id]).toEqual(records[lesson.id])
    data = act(act(data, { type: 'start', id: lesson.id }), { type: 'explanation', topic: lesson.topic })
    data = act(data, { type: 'start', id: endgames[1].id })
    expect(data.round).toMatchObject({ id: endgames[1].id, ply: 0, explanationViewed: false })
    expect(data.records).toEqual(records)
  })

  it('does nothing without a round and does not mistake a forged prefix for a finished lesson', () => {
    const empty = defaultEndgameLessons()
    expect(endgameFinished(empty)).toBe(false)
    for (const action of [{ type: 'reply' }, { type: 'hint' }, { type: 'demo' }, { type: 'explanation', topic: lesson.topic }, { type: 'submit', move: lesson.line[0] }] as EndgameAction[]) expect(act(empty, action)).toBe(empty)
    const active = start()
    expect(endgameFinished({ ...active, round: { ...active.round!, id: 'unknown', ply: 3 } })).toBe(false)
    expect(endgameFinished({ ...active, round: { ...active.round!, ply: 2 } })).toBe(false)
    expect(tryMove(endgamePosition(lesson, 0), lesson.line[0]).ok).toBe(true)
  })
})
