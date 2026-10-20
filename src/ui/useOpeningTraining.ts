import { useCallback, useRef, useState } from 'react'
import { defaultOpeningTraining, transitionOpeningTraining, type OpeningAction, type OpeningTrainingData } from '../core/opening-training'
import { clearOpeningTraining, loadOpeningTraining, saveOpeningTraining, type OpeningTrainingStorage } from '../core/opening-training-storage'

export type OpeningTrainingPersistenceStatus = 'saved' | 'failed' | 'blocked'
type Snapshot = {
  data: OpeningTrainingData; message: string; notice: string; persistenceStatus: OpeningTrainingPersistenceStatus
}
const browserStorage = (): OpeningTrainingStorage => window.localStorage
const SAVE_ERROR = '开局跟练保存失败，当前练习已保留在内存中，请重试保存。'

export function useOpeningTraining(getStorage: () => OpeningTrainingStorage = browserStorage) {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => {
    try {
      const loaded = loadOpeningTraining(getStorage())
      return { data: loaded.data, message: '', notice: loaded.error, persistenceStatus: loaded.blocked ? 'blocked' : 'saved' }
    } catch {
      return {
        data: defaultOpeningTraining(), message: '', notice: '无法读取开局跟练存档，请恢复存储权限后显式重置。', persistenceStatus: 'blocked',
      }
    }
  })
  // Actions read this ref synchronously, including multiple events before React renders.
  // Storage effects run in callbacks, never in state updaters that StrictMode can replay.
  const current = useRef(snapshot)
  // A failed reset can report "failed" even when the current data is already saved.
  const dirty = useRef(false)
  const publish = useCallback((next: Snapshot) => { current.current = next; setSnapshot(next) }, [])
  const persist = useCallback((next: Snapshot): Snapshot => {
    if (next.persistenceStatus === 'blocked') return next
    let ok = false
    try { ok = saveOpeningTraining(getStorage(), next.data) } catch { /* The provider itself may throw. */ }
    dirty.current = !ok
    return { ...next, notice: ok ? '' : SAVE_ERROR, persistenceStatus: ok ? 'saved' : 'failed' }
  }, [getStorage])
  const dispatch = useCallback((action: OpeningAction) => {
    const previous = current.current
    const result = transitionOpeningTraining(previous.data, action)
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
    try { ok = clearOpeningTraining(getStorage()) } catch { /* Keep memory and block status if access fails. */ }
    if (!ok) {
      publish({
        ...current.current, notice: '重置开局跟练失败，原存档与当前练习已保留，请重试。',
        persistenceStatus: current.current.persistenceStatus === 'blocked' ? 'blocked' : 'failed',
      })
      return false
    }
    dirty.current = false
    publish({ data: defaultOpeningTraining(), message: '开局跟练已重置', notice: '', persistenceStatus: 'saved' })
    return true
  }, [getStorage, publish])
  return { ...snapshot, dispatch, retrySave, reset }
}
