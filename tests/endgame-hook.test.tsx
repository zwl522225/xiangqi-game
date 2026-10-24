// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { endgames } from '../src/content/endgames'
import { defaultEndgameLessons } from '../src/core/endgame-lessons'
import { ENDGAME_STORAGE_KEY, type EndgameStorage } from '../src/core/endgame-lessons-storage'
import { useEndgameLessons } from '../src/ui/useEndgameLessons'

afterEach(cleanup)
function memory(raw: string | null = null) {
  return { raw, getItem: vi.fn(function (this: { raw: string | null }) { return this.raw }), setItem: vi.fn(function (this: { raw: string | null }, _key: string, value: string) { this.raw = value }), removeItem: vi.fn(function (this: { raw: string | null }) { this.raw = null }) }
}
const start = { type: 'start' as const, id: endgames[0].id }
describe('endgame single-owner persistence controller', () => {
  it('does no lifecycle writes in StrictMode and uses latest state for batched events/snapshots', () => {
    const storage = memory(); const { result, rerender } = renderHook(() => useEndgameLessons(() => storage), { wrapper: StrictMode })
    rerender(); expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled()
    act(() => {
      result.current.dispatch(start); result.current.dispatch({ type: 'hint' }); result.current.dispatch({ type: 'hint' })
      expect(result.current.getSnapshot().data.round).toMatchObject({ ply: 0, hintLevel: 2, helpUsed: true })
    })
    expect(storage.setItem).toHaveBeenCalledTimes(3)
    act(() => { result.current.dispatch({ type: 'demo' }); result.current.dispatch({ type: 'reply' }); result.current.dispatch({ type: 'reply' }) })
    expect(result.current.data.round?.ply).toBe(2)
    expect(JSON.parse(storage.raw!).round.ply).toBe(2)
    expect(result.current.persistenceStatus).toBe('saved')
  })
  it('protects blocked raw through temporary actions/retry and actually writes even a default restore', () => {
    const storage = memory('{private'); const { result } = renderHook(() => useEndgameLessons(() => storage))
    act(() => { result.current.dispatch(start); result.current.dispatch({ type: 'hint' }); expect(result.current.retrySave()).toBe(false) })
    expect(storage.raw).toBe('{private'); expect(storage.setItem).not.toHaveBeenCalled(); expect(result.current.persistenceStatus).toBe('blocked')
    act(() => { expect(result.current.restore(defaultEndgameLessons())).toEqual({ ok: true, changed: true }) })
    expect(storage.setItem).toHaveBeenCalledWith(ENDGAME_STORAGE_KEY, JSON.stringify(defaultEndgameLessons()))
    expect(result.current.persistenceStatus).toBe('saved')
  })
  it('blocked default-to-default restoration cannot short-circuit protection', () => {
    const storage = memory('{broken'); const { result } = renderHook(() => useEndgameLessons(() => storage))
    act(() => { expect(result.current.restore(defaultEndgameLessons())).toEqual({ ok: true, changed: true }) })
    expect(storage.setItem).toHaveBeenCalledTimes(1); expect(result.current.persistenceStatus).toBe('saved')
  })
  it('keeps unsaved memory and original storage on same-state restore, then retries the freshest data', () => {
    const storage = memory(); const { result } = renderHook(() => useEndgameLessons(() => storage))
    act(() => result.current.dispatch(start)); const original = storage.raw
    storage.setItem.mockImplementation(() => { throw Error('PRIVATE') })
    act(() => { result.current.dispatch({ type: 'hint' }); result.current.dispatch({ type: 'submit', move: { from: { x: 0, y: 1 }, to: { x: 0, y: 2 } } }) })
    const current = result.current.data
    expect(result.current.getSnapshot().unsaved).toBe(true)
    act(() => { expect(result.current.restore(current)).toEqual({ ok: true, changed: false }) })
    expect(result.current.data).toBe(current); expect(result.current.persistenceStatus).toBe('failed'); expect(storage.raw).toBe(original)
    storage.setItem.mockImplementation(function (_key, value) { storage.raw = value })
    act(() => { expect(result.current.retrySave()).toBe(true) })
    expect(JSON.parse(storage.raw!).round).toMatchObject({ hintLevel: 1, errors: 1, helpUsed: true }); expect(result.current.getSnapshot().unsaved).toBe(false)
  })
  it('failed reset preserves current data and dirty status, and retry does not pretend removal succeeded', () => {
    const storage = memory(); const { result } = renderHook(() => useEndgameLessons(() => storage))
    act(() => result.current.dispatch(start)); const original = result.current.data
    storage.removeItem.mockImplementation(() => { throw Error('PRIVATE') })
    act(() => { expect(result.current.reset()).toBe(false); expect(result.current.retrySave()).toBe(false) })
    expect(result.current.data).toBe(original); expect(result.current.persistenceStatus).toBe('failed'); expect(result.current.getSnapshot().unsaved).toBe(false)
    expect(storage.setItem).toHaveBeenCalledTimes(1); expect(result.current.notice).not.toContain('PRIVATE')
    storage.setItem.mockImplementation(() => { throw Error('quota') })
    act(() => result.current.dispatch({ type: 'hint' }))
    act(() => { expect(result.current.reset()).toBe(false) })
    expect(result.current.getSnapshot().unsaved).toBe(true); expect(result.current.data.round!.helpUsed).toBe(true)
  })
  it('only successful explicit removal resets memory and unblocks storage', () => {
    const storage = memory('broken'); const { result } = renderHook(() => useEndgameLessons(() => storage))
    act(() => result.current.dispatch(start)); storage.removeItem.mockImplementation(() => { throw Error('denied') })
    act(() => { expect(result.current.reset()).toBe(false) }); expect(result.current.persistenceStatus).toBe('blocked')
    storage.removeItem.mockImplementation(() => { storage.raw = null })
    act(() => { expect(result.current.reset()).toBe(true) }); expect(result.current.data).toEqual(defaultEndgameLessons()); expect(result.current.persistenceStatus).toBe('saved')
  })
  it('validates restore before writes and publishes only after a successful replacement write', () => {
    const storage = memory(); const { result } = renderHook(() => useEndgameLessons(() => storage))
    act(() => result.current.dispatch(start)); const original = result.current.data, raw = storage.raw
    act(() => { expect(result.current.restore({ version: 2 }).ok).toBe(false) }); expect(storage.setItem).toHaveBeenCalledTimes(1)
    storage.setItem.mockImplementation(() => { throw Error('PRIVATE') })
    act(() => { expect(result.current.restore(defaultEndgameLessons()).ok).toBe(false) })
    expect(result.current.data).toBe(original); expect(storage.raw).toBe(raw); expect(result.current.persistenceStatus).toBe('saved')
  })
  it('catches storage-provider failures at initialization and every operation', () => {
    let denied = true; const storage = memory(); const provider = (): EndgameStorage => { if (denied) throw Error('PRIVATE'); return storage }
    const { result } = renderHook(() => useEndgameLessons(provider))
    expect(result.current.persistenceStatus).toBe('blocked')
    act(() => { result.current.dispatch(start); expect(result.current.reset()).toBe(false); expect(result.current.restore(defaultEndgameLessons()).ok).toBe(false) })
    expect(result.current.data.round?.id).toBe(start.id)
    denied = false; act(() => { expect(result.current.reset()).toBe(true) })
    denied = true; act(() => result.current.dispatch(start)); expect(result.current.persistenceStatus).toBe('failed')
    act(() => { expect(result.current.retrySave()).toBe(false) })
    expect(result.current.notice).not.toContain('PRIVATE')
  })
})
