import { useEffect, useRef, useState } from 'react'
import { BACKUP_MODULE_LABELS, backupModuleSummary, decodeLearningBackup, encodeLearningBackup, MAX_LEARNING_BACKUP_BYTES, type BackupModule, type BackupModuleData, type LearningBackup as Backup } from '../core/learning-backup'
import type { LearningBackupController } from './useLearningBackup'

const modules: BackupModule[] = ['coursePractice', 'opening', 'tactics']
type Preview = { backup: Backup; filename: string }
function Summary({ module, data }: { module: BackupModule; data: BackupModuleData[BackupModule] | null }) {
  return data ? <ul>{backupModuleSummary(module, data).map(line => <li key={line}>{line}</li>)}</ul> : <p>当前记录不可读取，原存档受保护。</p>
}
function readFile(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error())
    reader.onerror = () => reject(new Error())
    reader.onabort = () => reject(new Error())
    reader.readAsText(file, 'UTF-8')
  })
}
function downloadName(date: Date) {
  const pad = (part: number) => String(part).padStart(2, '0')
  return `yixiang-learning-backup-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.json`
}

export function LearningBackup({ controller, active, onBack, onCourseRestored }: {
  controller: LearningBackupController; active: boolean; onBack: () => void; onCourseRestored: (message: string) => void
}) {
  const latest = useRef(controller)
  latest.current = controller
  const isActive = useRef(active)
  isActive.current = active
  const generation = useRef(0), busy = useRef(false), applied = useRef(new Set<BackupModule>())
  const heading = useRef<HTMLHeadingElement>(null), previewHeading = useRef<HTMLHeadingElement>(null), confirmationHeading = useRef<HTMLHeadingElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<BackupModule[]>(() => modules.filter(key => !controller.modules[key].blocked && controller.modules[key].data !== null))
  const [preview, setPreview] = useState<Preview | null>(null)
  const [reading, setReading] = useState(false)
  const [status, setStatus] = useState('')
  const [exportUnsaved, setExportUnsaved] = useState(false)
  const [confirmation, setConfirmation] = useState<BackupModule | null>(null)
  const confirmationReady = useRef<BackupModule | null>(null)
  function dismissConfirmation() { confirmationReady.current = null; setConfirmation(null) }
  function requestConfirmation(key: BackupModule) { confirmationReady.current = key; setConfirmation(key) }
  const [results, setResults] = useState<Partial<Record<BackupModule, string>>>({})

  // Controller identity changes on ordinary App renders; only activity/unmount invalidates reads.
  useEffect(() => {
    if (active) heading.current?.focus()
    else { generation.current++; setReading(false); dismissConfirmation() }
    return () => { generation.current++ }
  }, [active])
  useEffect(() => { if (isActive.current && preview) previewHeading.current?.focus() }, [preview])
  useEffect(() => { if (active && confirmation) confirmationHeading.current?.focus() }, [active, confirmation])

  function cancelPreview() {
    generation.current++
    setReading(false); setPreview(null); dismissConfirmation(); setResults({}); setStatus(''); setExportUnsaved(false)
    applied.current.clear()
    if (input.current) { input.current.value = ''; input.current.focus() }
  }
  async function choose(file: File | undefined) {
    const ticket = ++generation.current
    setPreview(null); dismissConfirmation(); setResults({}); setStatus(''); setExportUnsaved(false); applied.current.clear()
    setReading(false)
    if (!file || !isActive.current) return
    if (file.size > MAX_LEARNING_BACKUP_BYTES) { setStatus('文件大小超过 256 KiB 上限，请选择学习备份文件。'); return }
    setReading(true)
    const current = () => ticket === generation.current && isActive.current
    let raw: string
    try { raw = await readFile(file) } catch {
      if (current()) { setStatus('读取文件失败，请重新选择文件。'); setReading(false) }
      return
    }
    if (!current()) return
    try {
      const backup = decodeLearningBackup(raw)
      setPreview({ backup, filename: file.name.split(/[\\/]/).pop() || '学习备份.json' })
      setStatus('文件校验通过，预览不会更改记录。')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '学习备份格式不合法。')
    }
    setReading(false)
  }
  function download() {
    if (!isActive.current || busy.current) return
    let url: string | undefined, anchor: HTMLAnchorElement | undefined
    setExportUnsaved(false)
    try {
      if (!selected.length) { setStatus('请至少选择一个可备份模块。'); return }
      // Read getters once at click time; never reload an older disk snapshot.
      const snapshots = selected.map(key => ({ key, state: latest.current.modules[key] }))
      if (snapshots.some(({ state }) => state.blocked || state.data === null)) { setStatus('所选模块当前不可备份，请查看模块说明后重新选择。'); return }
      const payload: Backup['modules'] = {}
      for (const { key, state } of snapshots) Object.assign(payload, { [key]: state.data })
      const date = new Date()
      const raw = encodeLearningBackup({ format: 'yixiang-learning-backup', version: 1, exportedAt: date.toISOString(), modules: payload })
      url = URL.createObjectURL(new Blob([raw], { type: 'application/json;charset=utf-8' }))
      anchor = document.createElement('a'); anchor.href = url; anchor.download = downloadName(date)
      document.body.appendChild(anchor); anchor.click()
      setStatus('已发起下载，请在浏览器下载列表中查看')
      setExportUnsaved(snapshots.some(({ state }) => state.unsaved))
    } catch { setStatus('下载失败，请重试。') }
    finally {
      anchor?.remove()
      if (url) URL.revokeObjectURL(url)
    }
  }
  function restore() {
    if (!isActive.current || !confirmation || !preview || busy.current || confirmationReady.current !== confirmation || applied.current.has(confirmation)) return
    const key = confirmation
    confirmationReady.current = null
    const current = latest.current.modules[key]
    if (key === 'coursePractice' && current.blocked) {
      setResults(previous => ({ ...previous, [key]: '课堂原存档受保护，请先处理原学习或棋局存档问题。' })); dismissConfirmation(); return
    }
    const data = preview.backup.modules[key]
    if (!data) return
    busy.current = true
    try {
      const result = latest.current.restore(key, data)
      if (!result.ok) { setResults(previous => ({ ...previous, [key]: result.error })); return }
      applied.current.add(key)
      const message = result.changed ? `已恢复${BACKUP_MODULE_LABELS[key]}` : `${BACKUP_MODULE_LABELS[key]}：与当前记录一致`
      setResults(previous => ({ ...previous, [key]: message }))
      if (key === 'coursePractice' && result.changed) onCourseRestored(message)
    } catch { setResults(previous => ({ ...previous, [key]: '恢复失败，请重试。' })) }
    finally { busy.current = false; dismissConfirmation(); previewHeading.current?.focus() }
  }

  const availableSelection = selected.some(key => !controller.modules[key].blocked && controller.modules[key].data !== null)
  const confirmingState = confirmation ? controller.modules[confirmation] : null
  return <section className="learning-backup" aria-label="学习进度备份与恢复">
    <header className="library-header"><p className="eyebrow">手动转移个人学习记录</p><h2 ref={heading} tabIndex={-1}>学习进度备份与恢复</h2><p>备份当前页面记录。文件由自己保管，无需账号，不同步、不上传。</p><div className="learning-actions"><button type="button" onClick={onBack}>返回学习总览</button></div></header>
    <section className="panel" aria-label="下载学习记录">
      <h3>选择备份内容</h3><p>只包含所选学习模块；当前对局、收藏、笔记、试走和显示偏好另行保留。至少选择一项。</p>
      <div className="backup-options">{modules.map(key => {
        const state = controller.modules[key], unavailable = state.blocked || state.data === null
        return <div key={key} className="backup-option"><label><input type="checkbox" checked={selected.includes(key)} disabled={unavailable} aria-describedby={`backup-${key}-notice`} onChange={event => setSelected(previous => event.target.checked ? [...previous, key] : previous.filter(item => item !== key))} />{BACKUP_MODULE_LABELS[key]}</label><div id={`backup-${key}-notice`} className="overview-storage">{state.notice ? <p>{state.notice}</p> : null}{unavailable ? <p>{key === 'coursePractice' ? '原学习或棋局存档无法读取，本模块不可备份或恢复。' : '原存档受保护，本模块不可备份；可在校验备份后明确替换。'}</p> : state.unsaved ? <p>包含尚未写入本机的记录</p> : <p>可备份当前页面记录。</p>}</div></div>
      })}</div>
      <div className="learning-actions"><button type="button" disabled={!availableSelection} onClick={download}>下载学习备份</button></div>
      {!availableSelection ? <p>请至少选择一个可备份模块。</p> : null}
    </section>
    <section className="panel" aria-label="选择恢复文件"><h3>读取备份</h3><label className="backup-file-label">选择学习备份文件<input ref={input} type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void choose(file) }} /></label><p>最多 256 KiB。先校验全部内容，再逐项预览和确认替换。恢复会替换相应模块的当前训练轮。</p>{reading ? <p>正在读取学习备份…</p> : null}{reading || preview ? <div className="learning-actions"><button type="button" onClick={cancelPreview}>取消预览</button></div> : null}</section>
    <div role={active ? 'status' : undefined} aria-live={active ? 'polite' : 'off'} aria-label="备份操作状态" className="backup-status"><p>{status}</p>{exportUnsaved ? <p>包含尚未写入本机的记录</p> : null}</div>
    {preview ? <section className="panel backup-preview" aria-label="备份预览"><h3 ref={previewHeading} tabIndex={-1}>备份预览</h3><p className="backup-filename">文件：{preview.filename}</p><p>导出时间：<time dateTime={preview.backup.exportedAt}>{preview.backup.exportedAt}</time></p><p>包含模块：{modules.filter(key => preview.backup.modules[key]).map(key => BACKUP_MODULE_LABELS[key]).join('、')}</p>
      {modules.filter(key => preview.backup.modules[key]).map(key => <section className="backup-module" key={key} aria-label={`${BACKUP_MODULE_LABELS[key]}预览`}><h4>{BACKUP_MODULE_LABELS[key]}</h4><div className="backup-comparison"><div><h5>当前页面记录</h5><Summary module={key} data={controller.modules[key].data} />{controller.modules[key].notice ? <p>{controller.modules[key].notice}</p> : null}{controller.modules[key].unsaved ? <p>包含尚未写入本机的记录</p> : null}</div><div><h5>备份文件记录</h5><Summary module={key} data={preview.backup.modules[key]!} /></div></div><div className="learning-actions"><button type="button" disabled={applied.current.has(key) || (key === 'coursePractice' && controller.modules[key].blocked) || confirmation !== null} onClick={() => requestConfirmation(key)}>恢复{BACKUP_MODULE_LABELS[key]}</button></div>{key === 'coursePractice' && controller.modules[key].blocked ? <p>本模块原存档受保护，需要先处理原学习或棋局存档问题。</p> : null}<p role={active ? 'status' : undefined} aria-live={active ? 'polite' : 'off'} aria-label={`${BACKUP_MODULE_LABELS[key]}恢复结果`}>{results[key] || '尚未恢复'}</p></section>)}
      {confirmation && confirmingState ? <section className="backup-confirmation" role="dialog" aria-label={`确认恢复${BACKUP_MODULE_LABELS[confirmation]}`}><h4 ref={confirmationHeading} tabIndex={-1}>确认恢复{BACKUP_MODULE_LABELS[confirmation]}</h4><p>仅替换{BACKUP_MODULE_LABELS[confirmation]}的记录，并替换当前训练轮；其他模块各自保留。确认后以备份快照为准。</p>{confirmingState.blocked && confirmation !== 'coursePractice' ? <p>将以备份替换本模块受保护存档。</p> : null}<div className="backup-comparison"><div><h5>确认时的当前记录</h5><Summary module={confirmation} data={confirmingState.data} /></div><div><h5>将替换为</h5><Summary module={confirmation} data={preview.backup.modules[confirmation]!} /></div></div>{confirmation === 'coursePractice' ? <p>恢复成功后回到学习总览，并重新初始化课堂练习。</p> : null}<div className="learning-actions"><button type="button" onClick={restore}>确认恢复{BACKUP_MODULE_LABELS[confirmation]}</button><button type="button" onClick={() => { dismissConfirmation(); previewHeading.current?.focus() }}>取消恢复</button></div></section> : null}
    </section> : null}
  </section>
}
