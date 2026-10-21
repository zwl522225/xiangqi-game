// @vitest-environment jsdom
import { StrictMode, useState } from 'react'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTacticsTraining } from '../src/ui/useTacticsTraining'
import { currentTactic, defaultTactics } from '../src/core/tactics'
import { loadTactics, TACTICS_KEY, type TacticsStorage } from '../src/core/tactics-storage'

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear() })
function memory(raw: string | null = null) {
  const values = new Map<string, string>(raw === null ? [] : [[TACTICS_KEY, raw]])
  const fault = { read: false, write: false, remove: false }
  const storage: TacticsStorage = {
    getItem: vi.fn(key => { if (fault.read) throw Error('denied'); return values.get(key) ?? null }),
    setItem: vi.fn((key, value) => { if (fault.write) throw Error('full'); values.set(key, value) }),
    removeItem: vi.fn(key => { if (fault.remove) throw Error('denied'); values.delete(key) }),
  }
  return { values, fault, storage, getStorage: () => storage }
}
const start = { type: 'start', request: { mode: 'topic', topic: 'checks' } } as const

describe('App lifetime tactics hook', () => {
  it('starts saved without writing defaults, and writes only this key outside state updaters under StrictMode', () => {
    const store = memory()
    const { result } = renderHook(() => useTacticsTraining(store.getStorage), { wrapper: StrictMode })
    expect(result.current.persistenceStatus).toBe('saved')
    expect(store.storage.setItem).not.toHaveBeenCalled()
    act(() => result.current.dispatch(start))
    expect(store.storage.setItem).toHaveBeenCalledTimes(1)
    expect(store.storage.setItem).toHaveBeenCalledWith(TACTICS_KEY, expect.any(String))
    expect(loadTactics(store.storage).data).toEqual(result.current.data)
    expect(result.current.notice).toBe('')
  })
  it('uses a synchronous current ref for multiple callbacks before React renders and blocks duplicate replies', () => {
    const store = memory(), { result } = renderHook(() => useTacticsTraining(store.getStorage))
    act(() => {
      result.current.dispatch(start)
      result.current.dispatch({ type: 'demonstrate' })
      result.current.dispatch({ type: 'reply' })
      result.current.dispatch({ type: 'reply' })
    })
    expect(currentTactic(result.current.data)!.item.path).toHaveLength(2)
    expect(currentTactic(result.current.data)!.view.learnerTurn).toBe(true)
    expect(store.storage.setItem).toHaveBeenCalledTimes(3)
  })
  it('keeps unsaved latest memory and separate answer feedback, then retries that current data', () => {
    const store = memory(); store.fault.write = true
    const { result } = renderHook(() => useTacticsTraining(store.getStorage))
    act(() => { result.current.dispatch(start); result.current.dispatch({ type: 'hint' }) })
    expect(result.current.persistenceStatus).toBe('failed')
    expect(result.current.canRetrySave).toBe(true)
    expect(result.current.notice).toContain('刷新可能丢失')
    expect(result.current.message).toContain('当前已走')
    const latest = result.current.data
    expect(currentTactic(latest)!.item.hinted).toBe(true)
    store.fault.write = false
    act(() => { expect(result.current.retrySave()).toBe(true) })
    expect(result.current.persistenceStatus).toBe('saved')
    expect(result.current.canRetrySave).toBe(false)
    expect(loadTactics(store.storage).data).toEqual(latest)
    expect(result.current.message).toContain('当前已走')
  })
  it('retains damaged raw storage during temporary practice; explicit successful reset unblocks', () => {
    const store = memory('{corrupt')
    const { result } = renderHook(() => useTacticsTraining(store.getStorage))
    expect(result.current.persistenceStatus).toBe('blocked')
    expect(result.current.canRetrySave).toBe(false)
    act(() => { result.current.dispatch(start); result.current.dispatch({ type: 'hint' }) })
    expect(currentTactic(result.current.data)!.item.hinted).toBe(true)
    act(() => { expect(result.current.retrySave()).toBe(false) })
    expect(store.values.get(TACTICS_KEY)).toBe('{corrupt')
    expect(store.storage.setItem).not.toHaveBeenCalled()
    act(() => { expect(result.current.reset()).toBe(true) })
    expect(result.current.data).toEqual(defaultTactics())
    expect(result.current.persistenceStatus).toBe('saved')
    expect(store.values.has(TACTICS_KEY)).toBe(false)
    act(() => result.current.dispatch(start))
    expect(store.storage.setItem).toHaveBeenCalledTimes(1)
  })
  it('treats read failures and provider-property failures as blocked, without writing defaults', () => {
    const store = memory(); store.fault.read = true
    const hook = renderHook(() => useTacticsTraining(store.getStorage))
    expect(hook.result.current.persistenceStatus).toBe('blocked')
    act(() => hook.result.current.dispatch(start))
    expect(store.storage.setItem).not.toHaveBeenCalled()
    hook.unmount()
    const property = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw Error('denied') })
    const denied = renderHook(() => useTacticsTraining())
    expect(denied.result.current.persistenceStatus).toBe('blocked')
    act(() => { denied.result.current.dispatch(start); expect(denied.result.current.reset()).toBe(false) })
    expect(denied.result.current.persistenceStatus).toBe('blocked')
    property.mockRestore()
    act(() => { expect(denied.result.current.reset()).toBe(true) })
    expect(denied.result.current.data).toEqual(defaultTactics())
  })
  it('failed reset with saved data preserves memory/raw; retrySave neither writes nor claims reset recovery', () => {
    const store = memory(), { result } = renderHook(() => useTacticsTraining(store.getStorage))
    act(() => result.current.dispatch(start))
    const before = result.current.data, raw = store.values.get(TACTICS_KEY)
    store.fault.remove = true
    act(() => { expect(result.current.reset()).toBe(false) })
    expect(result.current.data).toBe(before)
    expect(store.values.get(TACTICS_KEY)).toBe(raw)
    expect(result.current.persistenceStatus).toBe('failed')
    expect(result.current.canRetrySave).toBe(false)
    expect(result.current.notice).toContain('重置')
    expect(result.current.notice).not.toContain('刷新可能丢失')
    vi.mocked(store.storage.setItem).mockClear()
    act(() => { expect(result.current.retrySave()).toBe(false) })
    expect(store.storage.setItem).not.toHaveBeenCalled()
    expect(result.current.persistenceStatus).toBe('failed')
    expect(result.current.notice).toContain('重置')
    store.fault.remove = false
    act(() => { expect(result.current.reset()).toBe(true) })
    expect(result.current.data).toEqual(defaultTactics())
  })
  it('failed reset retains dirty memory for retrySave, which saves memory without resetting it', () => {
    const store = memory(), { result } = renderHook(() => useTacticsTraining(store.getStorage))
    act(() => result.current.dispatch(start))
    store.fault.write = true
    act(() => result.current.dispatch({ type: 'hint' }))
    const latest = result.current.data
    store.fault.remove = true
    act(() => { expect(result.current.reset()).toBe(false) })
    expect(result.current.data).toBe(latest)
    expect(result.current.notice).toContain('重置多步战术失败')
    expect(result.current.notice).toContain('当前练习尚未保存，刷新可能丢失')
    expect(result.current.canRetrySave).toBe(true)
    store.fault.write = false
    act(() => { expect(result.current.retrySave()).toBe(true) })
    expect(result.current.data).toBe(latest)
    expect(result.current.canRetrySave).toBe(false)
    expect(loadTactics(store.storage).data).toEqual(latest)
    expect(result.current.message).not.toContain('重置')
  })
  it('a failed blocked reset retains the raw and temporary memory and never enables writes', () => {
    const store = memory('bad'), { result } = renderHook(() => useTacticsTraining(store.getStorage))
    act(() => result.current.dispatch(start))
    const latest = result.current.data
    store.fault.remove = true
    act(() => { expect(result.current.reset()).toBe(false); expect(result.current.retrySave()).toBe(false) })
    expect(result.current.data).toBe(latest)
    expect(result.current.persistenceStatus).toBe('blocked')
    expect(result.current.canRetrySave).toBe(false)
    expect(result.current.notice).toContain('重置多步战术失败')
    expect(result.current.notice).toContain('当前练习尚未保存，刷新可能丢失')
    expect(result.current.notice).not.toContain('重试保存')
    expect(store.values.get(TACTICS_KEY)).toBe('bad')
    expect(store.storage.setItem).not.toHaveBeenCalled()
  })
  it('handles a setItem property getter and a storage provider becoming unavailable after load', () => {
    const store = memory()
    Object.defineProperty(store.storage, 'setItem', { get() { throw Error('denied') } })
    const { result } = renderHook(() => useTacticsTraining(store.getStorage))
    act(() => result.current.dispatch(start))
    expect(result.current.persistenceStatus).toBe('failed')
    let available = true
    const provider = () => { if (!available) throw Error('provider'); return memory().storage }
    const second = renderHook(() => useTacticsTraining(provider))
    available = false
    act(() => second.result.current.dispatch(start))
    expect(second.result.current.persistenceStatus).toBe('failed')
    act(() => { expect(second.result.current.retrySave()).toBe(false); expect(second.result.current.reset()).toBe(false) })
  })
  it('keeps unsaved memory when a child training page unmounts while App owns one hook', () => {
    const store = memory(); store.fault.write = true
    function AppHarness() {
      const training = useTacticsTraining(store.getStorage), [visible, setVisible] = useState(true)
      return <><button onClick={() => setVisible(!visible)}>切页</button>{visible && <section><button onClick={() => training.dispatch(start)}>开始</button><output>{training.data.round ? '轮次仍在' : '没有轮次'}</output></section>}</>
    }
    render(<AppHarness />)
    fireEvent.click(screen.getByText('开始'))
    expect(screen.getByText('轮次仍在')).toBeTruthy()
    fireEvent.click(screen.getByText('切页'))
    expect(screen.queryByText('轮次仍在')).toBe(null)
    fireEvent.click(screen.getByText('切页'))
    expect(screen.getByText('轮次仍在')).toBeTruthy()
    expect(store.values.has(TACTICS_KEY)).toBe(false)
  })
})
