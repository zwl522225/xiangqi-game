import { useCallback, useRef, useState } from 'react'
import { defaultTactics, transitionTactics, type TacticsAction, type TacticsData } from '../core/tactics'
import { clearTactics, loadTactics, saveTactics, type TacticsStorage } from '../core/tactics-storage'
export type TacticsPersistenceStatus = 'saved' | 'failed' | 'blocked'
type Snapshot = { data: TacticsData; message: string; notice: string; persistenceStatus: TacticsPersistenceStatus }
const browserStorage = (): TacticsStorage => window.localStorage
const SAVE_ERROR = '本次多步战术进度未保存，刷新可能丢失；当前练习保留在内存中，请重试保存。'

/** Mount once in App so page navigation preserves even unsaved or temporary practice. */
export function useTacticsTraining(getStorage: () => TacticsStorage = browserStorage) {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => {
    try {
      const loaded = loadTactics(getStorage())
      return { data: loaded.data, message: '', notice: loaded.error, persistenceStatus: loaded.blocked ? 'blocked' : 'saved' }
    } catch {
      return { data: defaultTactics(), message: '', notice: '无法读取多步战术存档，请恢复存储权限后显式重置本项记录。', persistenceStatus: 'blocked' }
    }
  })
  // Read synchronously across multiple events in one React batch. Browser effects stay
  // in callbacks, outside React updaters that StrictMode can replay.
  const current = useRef(snapshot)
  // A failed remove does not make already-saved data dirty. RetrySave must never
  // rewrite that data and imply that the separate failed reset succeeded.
  const dirty = useRef(false)
  const publish = useCallback((next: Snapshot) => { current.current = next; setSnapshot(next) }, [])
  const persist = useCallback((next: Snapshot): Snapshot => {
    if (next.persistenceStatus === 'blocked') return next
    let ok = false
    try { ok = saveTactics(getStorage(), next.data) } catch { /* Storage provider access can throw. */ }
    dirty.current = !ok
    return { ...next, notice: ok ? '' : SAVE_ERROR, persistenceStatus: ok ? 'saved' : 'failed' }
  }, [getStorage])
  const dispatch = useCallback((action: TacticsAction) => {
    const previous = current.current, result = transitionTactics(previous.data, action)
    const changed = JSON.stringify(result.data) !== JSON.stringify(previous.data)
    const next = { ...previous, data: changed ? result.data : previous.data, message: result.message }
    if (changed) dirty.current = true
    publish(changed ? persist(next) : next)
  }, [persist, publish])
  const retrySave = useCallback(() => {
    if (current.current.persistenceStatus === 'blocked') return false
    if (!dirty.current) return current.current.persistenceStatus === 'saved'
    const next = persist(current.current)
    publish(next)
    return next.persistenceStatus === 'saved'
  }, [persist, publish])
  const reset = useCallback(() => {
    let ok = false
    try { ok = clearTactics(getStorage()) } catch { /* Failed access preserves memory and block status. */ }
    if (!ok) {
      publish({ ...current.current, notice: '重置多步战术失败，原存档与当前练习已保留，请重试。'
        + (dirty.current ? '当前练习尚未保存，刷新可能丢失。' : ''),
        persistenceStatus: current.current.persistenceStatus === 'blocked' ? 'blocked' : 'failed' })
      return false
    }
    dirty.current = false
    publish({ data: defaultTactics(), message: '多步战术记录已重置。', notice: '', persistenceStatus: 'saved' })
    return true
  }, [getStorage, publish])
  return { ...snapshot, canRetrySave: snapshot.persistenceStatus === 'failed' && dirty.current, dispatch, retrySave, reset }
}
