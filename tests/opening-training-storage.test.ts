// @vitest-environment jsdom
import { createElement, StrictMode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openings } from '../src/content/openings'
import { defaultOpeningTraining, openingTrainingView, transitionOpeningTraining, type OpeningAction, type OpeningTrainingData } from '../src/core/opening-training'
import { clearOpeningTraining, loadOpeningTraining, MAX_OPENING_TRAINING_BYTES, OPENING_TRAINING_KEY as KEY, saveOpeningTraining, type OpeningTrainingStorage } from '../src/core/opening-training-storage'
import { useOpeningTraining } from '../src/ui/useOpeningTraining'

function memory(raw: string | null = null) {
  const values = new Map([['xiangqi-progress', '正式进度'], ['xiangqi-study', '试走草稿']])
  if (raw !== null) values.set(KEY, raw)
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    removeItem: vi.fn((key: string) => { values.delete(key) }),
  }
  return { storage, values }
}
const start: OpeningAction = { type: 'start', openingId: openings[0].id, side: 'red' }
const wrong: OpeningAction = { type: 'move', move: { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } } }
function started() { return transitionOpeningTraining(defaultOpeningTraining(), start).data }
function next(data: OpeningTrainingData): OpeningAction {
  const view = openingTrainingView(data.active)!
  return view.learnerTurn ? { type: 'move', move: view.opening.steps[data.active!.ply].move } : { type: 'reply' }
}
function finished() {
  let data = started()
  while (!openingTrainingView(data.active)!.complete) data = transitionOpeningTraining(data, next(data)).data
  return data
}
function rejected(value: unknown) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  const { storage, values } = memory(raw)
  const loaded = loadOpeningTraining(storage)
  expect(loaded.blocked).toBe(true)
  expect(loaded.error).toMatch(/[\u4e00-\u9fff]/)
  expect(values.get(KEY)).toBe(raw)
  expect(storage.setItem).not.toHaveBeenCalled()
  expect(storage.removeItem).not.toHaveBeenCalled()
  return loaded
}
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('bounded isolated opening storage', () => {
  it('loads absent data without writing and roundtrips a compact whitelist', () => {
    const { storage, values } = memory()
    expect(loadOpeningTraining(storage)).toEqual({ data: defaultOpeningTraining(), error: '', blocked: false })
    expect(storage.setItem).not.toHaveBeenCalled()
    const data = transitionOpeningTraining(started(), { type: 'hint' }).data
    Object.assign(data, { board: ['private'], snapshots: ['private'], moves: ['private'], progress: {} })
    Object.assign(data.groups[0], { board: ['private'] })
    Object.assign(data.active!, { snapshot: ['private'] })
    expect(saveOpeningTraining(storage, data)).toBe(true)
    const raw = values.get(KEY)!
    expect(new TextEncoder().encode(raw).length).toBeLessThan(2048)
    expect(raw).not.toMatch(/board|snapshot|moves|progress|private/)
    expect(loadOpeningTraining(storage)).toEqual({ data: transitionOpeningTraining(started(), { type: 'hint' }).data, error: '', blocked: false })
    expect(values.get('xiangqi-progress')).toBe('正式进度')
    expect(values.get('xiangqi-study')).toBe('试走草稿')
    expect(storage.setItem).toHaveBeenCalledTimes(1)
  })

  it('replays every standard prefix for every opening and side', () => {
    for (const opening of openings) for (const side of ['red', 'black'] as const) {
      let data = transitionOpeningTraining(defaultOpeningTraining(), { type: 'start', openingId: opening.id, side }).data
      for (let ply = 0; ply <= 8; ply++) {
        const { storage } = memory(JSON.stringify(data))
        const loaded = loadOpeningTraining(storage)
        expect(loaded).toEqual({ data, error: '', blocked: false })
        expect(openingTrainingView(loaded.data.active)).toEqual(openingTrainingView(data.active))
        expect(storage.setItem).not.toHaveBeenCalled()
        if (ply < 8) data = transitionOpeningTraining(data, next(data)).data
      }
    }
  })

  it('enforces the exact UTF8 byte boundary before parsing or restoring', () => {
    const raw = JSON.stringify(started())
    const exact = raw + ' '.repeat(MAX_OPENING_TRAINING_BYTES - new TextEncoder().encode(raw).length)
    expect(loadOpeningTraining(memory(exact).storage).blocked).toBe(false)
    rejected(exact + ' ')
    const multibyte = JSON.stringify({ ...started(), extra: '字'.repeat(11000) })
    expect(multibyte.length).toBeLessThan(MAX_OPENING_TRAINING_BYTES)
    const parse = vi.spyOn(JSON, 'parse')
    rejected(multibyte)
    expect(parse).not.toHaveBeenCalled()
  })

  it('blocks malformed, future envelopes and unknown persisted fields without rewriting', () => {
    for (const item of ['{', 'null', '[]', { ...started(), version: 2 }, { ...started(), board: [] }, { version: 1 }, { ...started(), groups: null }]) rejected(item)
  })

  it('discards a bad active while retaining only independently valid versioned groups', () => {
    const data = finished()
    data.active!.openingVersion = 2
    const loaded = rejected(data)
    expect(loaded.data.active).toBeNull()
    expect(loaded.data.groups[0]).toMatchObject({ completed: true, unassisted: true })
    data.groups[0].openingVersion = 2
    expect(rejected(data).data.groups[0]).toMatchObject({ completed: false, unassisted: false })
  })

  it('invalidates duplicate groups instead of choosing a successful duplicate', () => {
    const data = finished()
    data.groups[1] = { ...data.groups[0] }
    const loaded = rejected(data)
    expect(loaded.data.groups).toHaveLength(8)
    expect(loaded.data.groups.some(group => group.completed)).toBe(false)
  })

  it.each([
    { openingId: 'unknown' }, { openingVersion: 2 }, { side: 'blue' },
    { ply: -1 }, { ply: 9 }, { ply: 0.5 }, { errors: -1 }, { errors: 1000 }, { errors: 1.5 },
    { hinted: 'true' }, { demonstrated: 1 }, { hintLevel: -1 }, { hintLevel: 4 }, { hintLevel: 0.5 },
    { hintLevel: 1, hinted: false }, { ply: 1, hintLevel: 1, hinted: true },
    { ply: 8, hintLevel: 1, hinted: true }, { board: [] },
  ])('rejects invalid active fields %j', fields => {
    const data = started()
    Object.assign(data.active!, fields)
    expect(rejected(data).data.active).toBeNull()
  })

  it.each([{ openingId: 'unknown' }, { openingVersion: 2 }, { side: 'blue' }, { completed: 'true' }, { unassisted: 1 }, { completed: false, unassisted: true }])('does not invent success from malformed groups %j', fields => {
    const data = defaultOpeningTraining()
    Object.assign(data.groups[0], fields)
    expect(rejected(data).data.groups.some(group => group.completed)).toBe(false)
  })

  it('refuses invalid saves and throwing required getters without replacing the original key', () => {
    for (const mutate of [
      (data: OpeningTrainingData) => { data.active!.errors = 0.5 },
      (data: OpeningTrainingData) => { data.groups[0].unassisted = true },
      (data: OpeningTrainingData) => { Object.defineProperty(data.active!, 'ply', { get() { throw Error('getter') } }) },
      (data: OpeningTrainingData) => { data.groups.pop() },
    ]) {
      const { storage, values } = memory('original')
      const data = started(); mutate(data)
      expect(saveOpeningTraining(storage, data)).toBe(false)
      expect(values.get(KEY)).toBe('original')
      expect(storage.setItem).not.toHaveBeenCalled()
    }
  })

  it('contains getItem, setItem, removeItem and method getter failures', () => {
    const { storage, values } = memory('original')
    storage.getItem.mockImplementation(() => { throw Error('read') })
    expect(loadOpeningTraining(storage).blocked).toBe(true)
    storage.setItem.mockImplementation(() => { throw Error('write') })
    expect(saveOpeningTraining(storage, started())).toBe(false)
    storage.removeItem.mockImplementation(() => { throw Error('remove') })
    expect(clearOpeningTraining(storage)).toBe(false)
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      const broken = Object.defineProperty({}, method, { get() { throw Error('method getter') } }) as OpeningTrainingStorage
      if (method === 'getItem') expect(loadOpeningTraining(broken).blocked).toBe(true)
      if (method === 'setItem') expect(saveOpeningTraining(broken, started())).toBe(false)
      if (method === 'removeItem') expect(clearOpeningTraining(broken)).toBe(false)
    }
    expect(values.get(KEY)).toBe('original')
  })

  it('clears only the isolated key', () => {
    const { storage, values } = memory(JSON.stringify(started()))
    expect(clearOpeningTraining(storage)).toBe(true)
    expect(values.has(KEY)).toBe(false)
    expect(values.size).toBe(2)
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(KEY)
  })
})

describe('opening training hook persistence', () => {
  it('loads without writing, serializes same-tick actions, and never replays writes in StrictMode', () => {
    const { storage } = memory()
    const { result } = renderHook(() => useOpeningTraining(() => storage), { wrapper: ({ children }) => createElement(StrictMode, null, children) })
    expect(storage.setItem).not.toHaveBeenCalled()
    act(() => { result.current.dispatch(start); result.current.dispatch({ type: 'hint' }); result.current.dispatch({ type: 'hint' }) })
    expect(result.current.data.active).toMatchObject({ hintLevel: 2, hinted: true })
    expect(storage.setItem).toHaveBeenCalledTimes(3)
    expect(loadOpeningTraining(storage).data).toEqual(result.current.data)
    expect(result.current.persistenceStatus).toBe('saved')
    act(() => result.current.dispatch({ type: 'reply' }))
    expect(storage.setItem).toHaveBeenCalledTimes(3)
    act(() => result.current.dispatch(start))
    expect(storage.setItem).toHaveBeenCalledTimes(4)
    act(() => result.current.dispatch(start))
    expect(storage.setItem).toHaveBeenCalledTimes(4)
    act(() => { expect(result.current.retrySave()).toBe(true) })
    expect(storage.setItem).toHaveBeenCalledTimes(4)
  })

  it('reports a failed reset while keeping a previously saved in-memory round', () => {
    const { storage, values } = memory(JSON.stringify(started()))
    const original = values.get(KEY)
    storage.removeItem.mockImplementation(() => { throw Error('remove denied') })
    const { result } = renderHook(() => useOpeningTraining(() => storage))
    const before = result.current.data
    act(() => { expect(result.current.reset()).toBe(false) })
    expect(result.current.data).toBe(before)
    expect(result.current.persistenceStatus).toBe('failed')
    expect(result.current.notice).toMatch(/失败/)
    expect(values.get(KEY)).toBe(original)
    expect(storage.setItem).not.toHaveBeenCalled()
    const notice = result.current.notice
    act(() => { expect(result.current.retrySave()).toBe(false) })
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(result.current.notice).toBe(notice)
    expect(result.current.persistenceStatus).toBe('failed')
    expect(result.current.data).toBe(before)
  })

  it('retries genuinely unsaved latest memory after a reset failure', () => {
    const { storage, values } = memory(JSON.stringify(started()))
    storage.setItem.mockImplementation(() => { throw Error('quota') })
    storage.removeItem.mockImplementation(() => { throw Error('remove denied') })
    const { result } = renderHook(() => useOpeningTraining(() => storage))
    act(() => { result.current.dispatch(wrong); result.current.dispatch({ type: 'hint' }) })
    const latest = result.current.data
    expect(latest.active).toMatchObject({ errors: 1, hintLevel: 1 })
    act(() => { expect(result.current.reset()).toBe(false) })
    expect(result.current.data).toBe(latest)
    expect(result.current.notice).toMatch(/重置.*失败/)
    storage.setItem.mockImplementation((key, value) => { values.set(key, value) })
    act(() => { expect(result.current.retrySave()).toBe(true) })
    expect(result.current.data).toBe(latest)
    expect(loadOpeningTraining(storage).data).toEqual(latest)
    expect(result.current.persistenceStatus).toBe('saved')
    expect(result.current.notice).toBe('')
    const writes = storage.setItem.mock.calls.length
    act(() => { expect(result.current.retrySave()).toBe(true) })
    expect(storage.setItem).toHaveBeenCalledTimes(writes)
  })

  it('preserves memory and persistent notice across feedback, retries the latest memory', () => {
    const { storage } = memory()
    storage.setItem.mockImplementation(() => { throw Error('quota') })
    const { result } = renderHook(() => useOpeningTraining(() => storage))
    act(() => { result.current.dispatch(start); result.current.dispatch(wrong); result.current.dispatch({ type: 'hint' }) })
    expect(result.current.data.active).toMatchObject({ errors: 1, hinted: true, hintLevel: 1 })
    const notice = result.current.notice
    expect(notice).toMatch(/[\u4e00-\u9fff]/)
    expect(result.current.message).toBe(openings[0].steps[0].hints[0])
    act(() => result.current.dispatch({ type: 'reply' }))
    expect(result.current.notice).toBe(notice)
    expect(result.current.persistenceStatus).toBe('failed')
    const latest = result.current.data
    storage.setItem.mockImplementation((key, value) => { storage.getItem.mockImplementation(other => other === key ? value : null) })
    act(() => { expect(result.current.retrySave()).toBe(true) })
    expect(loadOpeningTraining(storage).data).toEqual(latest)
    expect(result.current.notice).toBe('')
    expect(result.current.persistenceStatus).toBe('saved')
  })

  it('keeps a corrupt key blocked through actions/retries and resets only after removal succeeds', () => {
    const { storage, values } = memory('corrupt')
    const { result } = renderHook(() => useOpeningTraining(() => storage))
    expect(result.current.persistenceStatus).toBe('blocked')
    act(() => result.current.dispatch(start))
    const before = result.current.data
    act(() => { expect(result.current.retrySave()).toBe(false) })
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(values.get(KEY)).toBe('corrupt')
    storage.removeItem.mockImplementationOnce(() => { throw Error('denied') })
    act(() => { expect(result.current.reset()).toBe(false) })
    expect(result.current.data).toBe(before)
    expect(result.current.persistenceStatus).toBe('blocked')
    expect(result.current.notice).toMatch(/失败/)
    act(() => { expect(result.current.reset()).toBe(true) })
    expect(result.current.data).toEqual(defaultOpeningTraining())
    expect(result.current.persistenceStatus).toBe('saved')
    expect(values.has(KEY)).toBe(false)
    act(() => result.current.dispatch(start))
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(values.get('xiangqi-progress')).toBe('正式进度')
  })

  it('preserves hints and errors across refresh and makes completed marks idempotent', () => {
    const { storage } = memory()
    const first = renderHook(() => useOpeningTraining(() => storage))
    act(() => { first.result.current.dispatch(start); first.result.current.dispatch(wrong); first.result.current.dispatch({ type: 'hint' }) })
    first.unmount()
    const { result } = renderHook(() => useOpeningTraining(() => storage))
    expect(result.current.data.active).toMatchObject({ errors: 1, hinted: true, hintLevel: 1 })
    for (let ply = 0; ply < 8; ply++) act(() => result.current.dispatch(next(result.current.data)))
    expect(result.current.data.groups[0]).toMatchObject({ completed: true, unassisted: false })
    const writes = storage.setItem.mock.calls.length
    act(() => { result.current.dispatch({ type: 'hint' }); result.current.dispatch({ type: 'reply' }); result.current.dispatch({ type: 'demonstrate' }) })
    expect(storage.setItem).toHaveBeenCalledTimes(writes)
    expect(result.current.data.groups).toHaveLength(8)
  })

  it('contains a storage provider getter failure and can explicitly reset after access returns', () => {
    const { storage } = memory()
    let denied = true
    const provider = () => { if (denied) throw Error('localStorage getter'); return storage }
    const { result } = renderHook(() => useOpeningTraining(provider))
    expect(result.current.persistenceStatus).toBe('blocked')
    act(() => result.current.dispatch(start))
    expect(result.current.data.active).not.toBeNull()
    denied = false
    act(() => { expect(result.current.retrySave()).toBe(false) })
    act(() => { expect(result.current.reset()).toBe(true) })
    expect(result.current.persistenceStatus).toBe('saved')
  })

  it('catches the default window.localStorage getter without writing on mount', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw Error('security') })
    const { result } = renderHook(() => useOpeningTraining())
    expect(result.current.persistenceStatus).toBe('blocked')
    expect(result.current.notice).toMatch(/[\u4e00-\u9fff]/)
    act(() => { expect(result.current.reset()).toBe(false) })
  })
})
