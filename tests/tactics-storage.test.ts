import { describe, expect, it, vi } from 'vitest'
import { currentTactic, defaultTactics, transitionTactics, type TacticsAction, type TacticsData } from '../src/core/tactics'
import { clearTactics, loadTactics, MAX_TACTICS_BYTES, saveTactics, TACTICS_KEY, type TacticsStorage } from '../src/core/tactics-storage'
import { legalMoves } from '../src/core/rules'
import { moveKey } from '../src/core/tactics-view'

function memory(raw: string | null = null) {
  const values = new Map<string, string>(raw === null ? [] : [[TACTICS_KEY, raw]])
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { values.set(key, value) }), removeItem: vi.fn((key: string) => { values.delete(key) }) }
}
const act = (data: TacticsData, action: TacticsAction) => transitionTactics(data, action).data
const start = () => act(defaultTactics(), { type: 'start', request: { mode: 'topic', topic: 'checks' } })
const copy = <T,>(data: T): T => JSON.parse(JSON.stringify(data))

describe('strict bounded tactics storage', () => {
  it('exports a dedicated key and exact 64 KiB UTF-8 budget; absent reads do not write', () => {
    expect(TACTICS_KEY).toBe('xiangqi-tactics-training')
    expect(MAX_TACTICS_BYTES).toBe(64 * 1024)
    const storage = memory()
    expect(loadTactics(storage)).toEqual({ data: defaultTactics(), error: '', blocked: false })
    expect(storage.setItem).not.toHaveBeenCalled()
  })
  it('roundtrips every real interaction phase and result with no board snapshots', () => {
    const storage = memory()
    const check = (data: TacticsData) => {
      expect(saveTactics(storage, data)).toBe(true)
      expect(loadTactics(storage)).toEqual({ data, error: '', blocked: false })
      expect(storage.values.get(TACTICS_KEY)).not.toContain('board')
    }
    let data = start(); check(data)
    data = act(data, { type: 'hint' }); check(data)
    data = act(data, { type: 'demonstrate' }); check(data)
    data = act(data, { type: 'reply' }); check(data)
    const view = currentTactic(data)!.view
    const wrong = legalMoves(view.game.board, view.game.turn).find(m => !view.correctMoves.some(g => moveKey(g) === moveKey(m)))!
    data = act(data, { type: 'move', move: wrong }); check(data)
    data = act(data, { type: 'refutation' }); check(data)
    data = act(data, { type: 'retry' }); check(data)
    data = act(data, { type: 'answer' }); check(data)
    data = act(data, { type: 'retry' }); check(data)
    while (!currentTactic(data)!.item.result) {
      const v = currentTactic(data)!.view
      data = act(data, v.learnerTurn ? { type: 'move', move: v.correctMoves[0] } : { type: 'reply' }); check(data)
    }
    expect(currentTactic(data)!.item.result).toBe('assisted')
    data = act(data, { type: 'next' }); check(data)
    data = act(data, { type: 'skip' }); check(data)
    data = act(data, { type: 'next' }); check(data)
    data = act(data, { type: 'start', request: { mode: 'mistakes' } }); check(data)
    data = act(defaultTactics(), { type: 'start', request: { mode: 'mistakes' } }); check(data)
    data = start()
    while (!currentTactic(data)!.item.result) {
      const v = currentTactic(data)!.view
      data = act(data, v.learnerTurn ? { type: 'move', move: v.correctMoves[0] } : { type: 'reply' })
    }
    check(data)
  })
  it.each([
    ['unknown record id', (d: any) => { d.records[0].id = 'other' }],
    ['duplicate record id', (d: any) => { d.records[0] = d.records[1] }],
    ['content version', (d: any) => { d.records[0].version = 2 }],
    ['envelope version', (d: any) => { d.version = 2 }],
    ['extraneous field', (d: any) => { d.round.items[0].board = [] }],
    ['unknown round id', (d: any) => { d.round.items[0].id = 'other' }],
    ['duplicate round id', (d: any) => { d.round.items[1] = d.round.items[0] }],
    ['negative counter', (d: any) => { d.records[0].errors = -1 }],
    ['unbounded counter', (d: any) => { d.round.items[0].errors = 1000 }],
    ['fraction', (d: any) => { d.round.index = 0.5 }],
    ['unfinished skipped by index', (d: any) => { d.round.index = 1 }],
    ['mutated future item', (d: any) => { d.round.items[1].hinted = true }],
    ['false completion', (d: any) => { d.round.items[0].result = 'independent' }],
    ['hint without history', (d: any) => { d.round.items[0].hintLevel = 1 }],
    ['refutation without error', (d: any) => { d.round.items[0].refutationViewed = true }],
    ['answer boundary without reveal', (d: any) => { d.round.items[0].answerFrom = 0 }],
    ['impossible error flag', (d: any) => { d.round.items[0].errors = 1 }],
    ['illegal path', (d: any) => { d.round.items[0].path = [{ from: { x: 8, y: 8 }, to: { x: 8, y: 7 } }] }],
    ['malformed move', (d: any) => { d.round.items[0].path = [{ from: { x: 0, y: 2 }, to: { x: 9, y: 2 } }] }],
    ['fake reviewed state', (d: any) => { d.records[0].review = 'reviewed' }],
    ['empty topic round', (d: any) => { d.round.items = [] }],
    ['mismatched topic', (d: any) => { d.round.request.topic = 'gain' }],
  ])('rejects %s as a whole and retains the exact raw value', (_name, mutate) => {
    const data = copy(start()); mutate(data)
    const raw = JSON.stringify(data), storage = memory(raw)
    expect(loadTactics(storage)).toMatchObject({ blocked: true, data: defaultTactics() })
    expect(storage.values.get(TACTICS_KEY)).toBe(raw)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(saveTactics(storage, data)).toBe(false)
    expect(storage.values.get(TACTICS_KEY)).toBe(raw)
  })
  it('rejects impossible independent help flags, complete null result and bad recent error replay', () => {
    let data = act(start(), { type: 'answer' })
    const fakeIndependent = copy(data)
    fakeIndependent.round!.items[0].result = 'independent'
    expect(saveTactics(memory(), fakeIndependent)).toBe(false)
    const fakeUnfinished = copy(data); fakeUnfinished.round!.items[0].result = null
    expect(saveTactics(memory(), fakeUnfinished)).toBe(false)
    data = act(start(), { type: 'move', move: { from: { x: 8, y: 8 }, to: { x: 8, y: 7 } } })
    const error = data.records.find(r => r.id === currentTactic(data)!.item.id)!.lastError!
    error.move = currentTactic(data)!.view.correctMoves[0]
    expect(saveTactics(memory(), data)).toBe(false)
    error.path = [error.move]
    expect(saveTactics(memory(), data)).toBe(false)
  })
  it.each([
    ['short recommended round', () => { const d = act(defaultTactics(), { type: 'start', request: { mode: 'recommended' } }); d.round!.items.pop(); return d }],
    ['mistakes without any error history', () => { const d = start(); d.round!.request = { mode: 'mistakes' }; return d }],
    ['vanished hint display at untouched root', () => { const d = start(); d.round!.items[0].hinted = true; return d }],
  ] as const)('rejects %s', (_name, make) => { expect(saveTactics(memory(), make())).toBe(false) })
  it('rejects oversized UTF-8 and malformed JSON without replacing raw storage', () => {
    for (const raw of ['{', ' '.repeat(MAX_TACTICS_BYTES + 1), '中'.repeat(Math.ceil(MAX_TACTICS_BYTES / 3))]) {
      const storage = memory(raw)
      expect(loadTactics(storage).blocked).toBe(true)
      expect(storage.values.get(TACTICS_KEY)).toBe(raw)
      expect(storage.setItem).not.toHaveBeenCalled()
    }
  })
  it('never invokes getters or toJSON in caller data and rejects non-plain, sparse and extended arrays', () => {
    const storage = memory(), run = vi.fn(() => { throw Error('must not execute') })
    const getter = defaultTactics()
    Object.defineProperty(getter, 'round', { get: run, enumerable: true })
    expect(saveTactics(storage, getter)).toBe(false)
    const json = Object.assign(defaultTactics(), { toJSON: run })
    expect(saveTactics(storage, json)).toBe(false)
    const arrayGetter = defaultTactics()
    Object.defineProperty(arrayGetter.records, '0', { get: run, enumerable: true })
    expect(saveTactics(storage, arrayGetter)).toBe(false)
    const sparse = defaultTactics(); delete (sparse.records as any)[0]
    expect(saveTactics(storage, sparse)).toBe(false)
    const extended = defaultTactics(); Object.assign(extended.records, { extra: true })
    expect(saveTactics(storage, extended)).toBe(false)
    expect(saveTactics(storage, new Date() as any)).toBe(false)
    expect(run).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
  })
  it('catches method-property getters and method faults; clear only touches this key', () => {
    for (const name of ['getItem', 'setItem', 'removeItem'] as const) {
      const storage = memory()
      Object.defineProperty(storage, name, { get() { throw Error('denied') } })
      if (name === 'getItem') expect(loadTactics(storage).blocked).toBe(true)
      if (name === 'setItem') expect(saveTactics(storage, defaultTactics())).toBe(false)
      if (name === 'removeItem') expect(clearTactics(storage)).toBe(false)
    }
    const faults: TacticsStorage = { getItem() { throw Error() }, setItem() { throw Error() }, removeItem() { throw Error() } }
    expect(loadTactics(faults).blocked).toBe(true)
    expect(saveTactics(faults, defaultTactics())).toBe(false)
    expect(clearTactics(faults)).toBe(false)
    const storage = memory('{}'); storage.values.set('formal-progress', 'unchanged')
    expect(clearTactics(storage)).toBe(true)
    expect(storage.values.has(TACTICS_KEY)).toBe(false)
    expect(storage.values.get('formal-progress')).toBe('unchanged')
  })
})
