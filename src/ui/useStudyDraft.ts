import { useCallback, useEffect, useRef, useState } from 'react'
import type { Study } from '../core/study'
import { clearStudy, loadStudy, saveStudy } from '../core/study-storage'
import type { PersistenceStatus } from './MoveReview'

export function useStudyDraft() {
  const [loaded] = useState(() => {
    try { return typeof window === 'undefined' ? { study: null, error: '' } : loadStudy(window.localStorage) }
    catch { return { study: null, error: '试走草稿无法读取，请检查浏览器存储权限。' } }
  })
  const [study, setStudy] = useState<Study | null>(loaded.study)
  const [notice, setNotice] = useState(loaded.error)
  // Restored data is already on disk. In particular, never rewrite an unreadable key on mount.
  const savedStudy = useRef<Study | null>(loaded.study)
  const [persisted, setPersisted] = useState<{ study: Study | null; ok: boolean }>({ study: loaded.study, ok: !loaded.error })
  useEffect(() => {
    if (!study || savedStudy.current === study) return
    let ok = false
    try { ok = saveStudy(window.localStorage, study) } catch { /* The storage getter may be blocked. */ }
    savedStudy.current = study
    setPersisted({ study, ok })
  }, [study])
  const change = useCallback((next: Study) => { setStudy(next); setNotice('') }, [])
  const clear = useCallback(() => {
    let ok = false
    try { ok = clearStudy(window.localStorage) } catch { /* Keep the in-memory draft if removal fails. */ }
    if (!ok) { setNotice('清空试走失败，当前草稿已保留，请检查存储权限后重试。'); return false }
    savedStudy.current = null
    setStudy(null); setNotice(''); setPersisted({ study: null, ok: true })
    return true
  }, [])
  const persistenceStatus: PersistenceStatus = persisted.study !== study ? 'pending' : persisted.ok ? 'saved' : 'failed'
  return { study, notice, persistenceStatus, replace: change, change, clear }
}
