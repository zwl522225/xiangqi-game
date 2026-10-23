import type { RestoreResult } from '../core/learning-backup'
import { useCallback, useRef, useState } from 'react'
import { defaultOpeningTraining, transitionOpeningTraining, type OpeningAction, type OpeningTrainingData } from '../core/opening-training'
import { clearOpeningTraining, loadOpeningTraining, parseOpeningTraining, saveOpeningTraining, type OpeningTrainingStorage } from '../core/opening-training-storage'

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
  const restore = useCallback((value: unknown): RestoreResult => {
    let data: OpeningTrainingData
    try { data = parseOpeningTraining(value) } catch { return { ok: false, error: '开局跟练备份内容无法恢复，请检查文件。' } }
    const previous = current.current
    if (previous.persistenceStatus !== 'blocked') {
      try {
        if (JSON.stringify(parseOpeningTraining(previous.data)) === JSON.stringify(data)) return { ok: true, changed: false }
      } catch { /* A valid backup can replace older incompatible in-memory records. */ }
    }
    let ok = false
    try { ok = saveOpeningTraining(getStorage(), data) } catch { /* Keep all prior state when the provider fails. */ }
    if (!ok) return { ok: false, error: '开局跟练恢复保存失败，原记录和当前练习已保留，请重试。' }
    dirty.current = false
    publish({ data, message: '', notice: '', persistenceStatus: 'saved' })
    return { ok: true, changed: true }
  }, [getStorage, publish])
  // Backup reads must also see actions performed earlier in the same React batch.
  const getSnapshot = useCallback(() => ({ ...current.current, unsaved: dirty.current }), [])
  return { ...snapshot, unsaved: dirty.current, getSnapshot, restore, dispatch, retrySave, reset }
}
