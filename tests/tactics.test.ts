import { describe, expect, it } from 'vitest'
import { tactics } from '../src/content/tactics'
import { currentTactic, defaultTactics, tacticsSummary, transitionTactics, type TacticsAction, type TacticsData } from '../src/core/tactics'
import { tacticView, moveKey } from '../src/core/tactics-view'
import { legalMoves } from '../src/core/rules'
import type { Move } from '../src/core/types'

const illegal: Move = { from: { x: 8, y: 8 }, to: { x: 8, y: 7 } }
const act = (data: TacticsData, action: TacticsAction) => transitionTactics(data, action).data
function start(id: string) {
  let data = act(defaultTactics(), { type: 'start', request: { mode: 'topic', topic: tactics.find(t => t.id === id)!.topic } })
  if (currentTactic(data)!.item.id !== id) { data = act(data, { type: 'skip' }); data = act(data, { type: 'next' }) }
  return data
}
function finish(data: TacticsData): TacticsData {
  for (let n = 0; n < 6 && !currentTactic(data)!.item.result; n++) {
    const view = currentTactic(data)!.view
    data = act(data, view.learnerTurn ? { type: 'move', move: view.correctMoves[0] } : { type: 'reply' })
  }
  return data
}

describe('pure tactics rounds', () => {
  it('starts with exactly six bounded empty records', () => {
    expect(defaultTactics().records).toHaveLength(6)
    expect(defaultTactics().round).toBe(null)
  })
  it.each(tactics.map(t => t.id))('completes %s by real replay with own final phase', id => {
    const before = start(id), snapshot = JSON.stringify(before)
    const data = finish(before), current = currentTactic(data)!
    expect(JSON.stringify(before)).toBe(snapshot)
    expect(current.item.result).toBe('independent')
    expect(current.view.complete).toBe(true)
    expect(current.item.path.length).toBe(current.view.tactic.topic === 'checks' ? 5 : 4)
    expect(current.record.everIndependent).toBe(true)
    expect(current.record.everCompleted).toBe(true)
  })
  it('accepts every correct opening alternative and locks opponent stage / duplicate reply', () => {
    const initial = start('checks-red'), moves = currentTactic(initial)!.view.correctMoves
    expect(moves.length).toBeGreaterThan(1)
    for (const move of moves) expect(currentTactic(act(initial, { type: 'move', move }))!.item.path).toEqual([move])
    const data = act(initial, { type: 'move', move: moves[0] })
    expect(act(data, { type: 'move', move: illegal })).toEqual(data)
    const replied = act(data, { type: 'reply' })
    expect(currentTactic(replied)!.item.path).toHaveLength(2)
    expect(act(replied, { type: 'reply' })).toEqual(replied)
  })
  it('distinguishes actual illegal and legal non-goal submissions, preserving position and latest error prefix', () => {
    let data = start('checks-red')
    const bad = transitionTactics(data, { type: 'move', move: illegal })
    expect(bad.message).toBeTruthy()
    data = bad.data
    expect(currentTactic(data)!.lastWrong!.feedback.status).toBe('illegal')
    const view = currentTactic(data)!.view
    const wrong = legalMoves(view.game.board, view.game.turn).find(move => !view.correctMoves.some(good => moveKey(good) === moveKey(move)))!
    expect(wrong).toBeTruthy()
    data = act(data, { type: 'move', move: wrong })
    expect(currentTactic(data)!.lastWrong!.feedback.status).toBe('not-goal')
    expect(currentTactic(data)!.item.path).toEqual([])
    expect(currentTactic(data)!.item.errors).toBe(2)
    expect(currentTactic(data)!.record.review).toBe('pending')
    expect(currentTactic(data)!.record.lastError).toMatchObject({ path: [], move: wrong, version: 1 })
    const invalid = { from: { x: -1, y: 2 }, to: { x: 0, y: 0 } }
    expect(act(data, { type: 'move', move: invalid })).toEqual(data)
  })
  it('retains assistance/error/retry history and limits hint display to current own turn', () => {
    let data = start('gain-red')
    for (let n = 0; n < 5; n++) data = act(data, { type: 'hint' })
    expect(currentTactic(data)!.item.hintLevel).toBe(3)
    data = act(data, { type: 'demonstrate' })
    expect(currentTactic(data)!.item.path).toHaveLength(1)
    expect(currentTactic(data)!.item.hintLevel).toBe(0)
    data = act(data, { type: 'reply' })
    expect(currentTactic(data)!.item.hintLevel).toBe(0)
    data = act(data, { type: 'retry' })
    expect(currentTactic(data)!.item.path).toEqual([])
    expect(currentTactic(finish(data))!.item.result).toBe('assisted')
    data = act(start('gain-red'), { type: 'move', move: illegal })
    expect(currentTactic(finish(act(data, { type: 'retry' })))!.item.result).toBe('assisted')
  })
  it('expands answer from the actual alternative prefix and retains revealed history after retry', () => {
    let data = start('checks-red')
    data = act(data, { type: 'move', move: currentTactic(data)!.view.correctMoves.at(-1)! })
    const prefix = currentTactic(data)!.item.path
    data = act(data, { type: 'answer' })
    expect(currentTactic(data)!.item.path.slice(0, prefix.length)).toEqual(prefix)
    expect(currentTactic(data)!.item.answerFrom).toBe(prefix.length)
    expect(currentTactic(data)!.item.result).toBe('revealed')
    expect(currentTactic(finish(act(data, { type: 'retry' })))!.item.result).toBe('assisted')
  })
  it('only marks refutation assistance after an actual error and keeps that historical board', () => {
    const initial = start('checks-red')
    expect(act(initial, { type: 'refutation' })).toEqual(initial)
    let data = act(initial, { type: 'move', move: illegal })
    data = act(data, { type: 'refutation' })
    expect(currentTactic(data)!.item.refutationViewed).toBe(true)
    data = act(data, { type: 'move', move: currentTactic(data)!.view.correctMoves[0] })
    expect(currentTactic(data)!.lastWrong!.view).toEqual(tacticView('checks-red', []))
  })
  it('preserves monotonic records and only a clean new round resolves pending mistakes', () => {
    let data = act(start('gain-red'), { type: 'move', move: illegal })
    data = finish(data)
    expect(currentTactic(data)!.record.review).toBe('pending')
    data = act(data, { type: 'start', request: { mode: 'mistakes' } })
    expect(data.round!.items.map(item => item.id)).toEqual(['gain-red'])
    data = finish(data)
    expect(currentTactic(data)!.record.review).toBe('reviewed')
    expect(currentTactic(data)!.record.everIndependent).toBe(true)
    data = act(data, { type: 'start', request: { mode: 'mistakes' } })
    expect(tacticsSummary(data)).toMatchObject({ finished: true, total: 0 })
    data = act(data, { type: 'start', request: { mode: 'topic', topic: 'gain' } })
    data = act(data, { type: 'skip' }); data = act(data, { type: 'next' })
    data = act(data, { type: 'move', move: illegal })
    expect(currentTactic(data)!.record.review).toBe('pending')
    expect(currentTactic(data)!.record.everIndependent).toBe(true)
  })
  it('uses pending/uncompleted/stable id selection and bounded errors', () => {
    let data = act(start('gain-red'), { type: 'move', move: illegal })
    data = act(data, { type: 'start', request: { mode: 'recommended' } })
    expect(data.round!.items.map(item => item.id)).toEqual(['gain-red', 'checks-black', 'checks-red'])
    for (let n = 0; n < 1005; n++) data = act(data, { type: 'move', move: illegal })
    expect(currentTactic(data)!.item.errors).toBe(999)
    expect(currentTactic(data)!.record.errors).toBe(999)
  })
  it('does not skip unfinished items or manufacture errors; duplicate next stops on next unanswered item', () => {
    let data = start('checks-black')
    expect(act(data, { type: 'next' })).toEqual(data)
    data = act(data, { type: 'skip' })
    expect(currentTactic(data)!.item.errors).toBe(0)
    expect(currentTactic(data)!.record.review).toBe(null)
    data = act(data, { type: 'next' })
    const next = data
    expect(act(data, { type: 'next' })).toEqual(next)
    data = finish(data); data = act(data, { type: 'next' })
    expect(data.round!.index).toBe(2)
    expect(currentTactic(data)).toBe(null)
    expect(tacticsSummary(data)).toMatchObject({ finished: true, total: 2, counts: { skipped: 1, independent: 1 } })
    expect(act(data, { type: 'next' })).toEqual(data)
  })
})
