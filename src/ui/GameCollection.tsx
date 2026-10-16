import { useEffect, useRef, useState } from 'react'
import { inspectArchive, MAX_GAME_FILE_BYTES, readGameFile } from '../core/archive-codec'
import type { ArchivedGame, InspectedArchive } from '../core/archive-codec'
import type { GameCollection as CollectionData } from '../core/collection'
import { MAX_COLLECTION_ITEMS } from '../core/collection'
import { viewGame } from '../core/session'
import type { Side } from '../core/types'
import { Board } from './Board'
import { GameExport } from './GameExport'
import { MoveReview } from './MoveReview'
import type { PersistenceStatus } from './MoveReview'

type ContinueOptions = { mode: 'local' | 'ai'; playerSide: Side }
type Props = {
  data: CollectionData
  notice: string
  persistenceStatus: PersistenceStatus
  onAdd: (archive: ArchivedGame) => void
  onRename: (id: string, title: string) => void
  onRemove: (id: string) => void
  onClear: () => void
  onContinue: (archive: ArchivedGame, options: ContinueOptions) => void
}
type Preview = InspectedArchive & { source: 'file' | 'collection'; id?: string; key: number }

export function GameCollection({ data, notice, persistenceStatus, onAdd, onRename, onRemove, onClear, onContinue }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState<ArchivedGame | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null)
  const [continuing, setContinuing] = useState(false)
  const [mode, setMode] = useState<'local' | 'ai'>('local')
  const [playerSide, setPlayerSide] = useState<Side>('red')
  const token = useRef(0)
  useEffect(() => () => { token.current++ }, [])
  function cancel() {
    token.current++
    setPreview(null); setLoading(false); setError(''); setContinuing(false)
  }
  function display(value: InspectedArchive, source: Preview['source'], id?: string) {
    setPreview({ ...value, source, id, key: token.current })
    setContinuing(false); setMode('local'); setPlayerSide('red')
  }
  function open(id: string, exportingOnly = false) {
    cancel()
    const entry = data.items.find(item => item.id === id)
    if (!entry) return
    const result = inspectArchive(entry.archive)
    if (!result.ok) { setError(`这条收藏无法打开：${result.error}。仍可删除此条收藏。`); return }
    if (exportingOnly) setExporting(result.value.archive)
    else display(result.value, 'collection', id)
  }
  async function readFile(file: File | undefined) {
    cancel()
    const current = token.current
    if (!file) return
    if (file.size > MAX_GAME_FILE_BYTES) { setError('棋局文件不能超过 512 KiB。'); return }
    setLoading(true)
    try {
      const text = await file.text()
      if (current !== token.current) return
      const result = readGameFile(text)
      if (!result.ok) { setError(result.error); return }
      display(result.value, 'file')
    } catch { if (current === token.current) setError('无法读取棋局文件，请重新选择。') }
    finally { if (current === token.current) setLoading(false) }
  }
  return <div className="collection-page">
    <header className="library-header"><p className="eyebrow">留下每一盘的观察</p><h2>棋局收藏</h2><p>收藏是完整棋局与已保存笔记的独立副本。只读回看不会改变当前对局；跨设备需要手动导出、导入文件。</p></header>
    <div className="collection-storage panel">
      <strong>本机收藏 {data.items.length} / {MAX_COLLECTION_ITEMS} 盘</strong>
      <p className={`muted${persistenceStatus === 'failed' ? ' review-storage--failed' : ''}`} aria-live="polite">{persistenceStatus === 'failed' ? '浏览器保存失败；收藏暂留在当前页面，刷新后可能丢失。请先导出需要保留的棋局。' : persistenceStatus === 'pending' ? '正在保存收藏…' : '收藏已保存到当前浏览器。'}</p>
      <p className="muted">最多 20 盘，收藏总大小最多 2 MiB；满额时请先导出或删除。不会自动清理旧棋局。</p>
      <p className="collection-notice" aria-live="polite">{notice}</p>
    </div>
    <div className="collection-layout">
      <section className="collection-library panel" aria-label="收藏列表与导入">
        <div className="panel-title"><h3>本机收藏</h3><button type="button" className="text-danger" disabled={!data.items.length} onClick={() => { if (window.confirm('确定清空全部收藏吗？当前对局和学习进度会保留。')) { cancel(); onClear() } }}>清空收藏</button></div>
        <label className="collection-import">导入棋局文件<input type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void readFile(file) }} /></label>
        <p className="muted">支持弈象第 1 版 JSON，单文件最多 512 KiB。验证通过后先预览，再由你加入收藏。</p>
        {loading ? <p aria-live="polite">正在读取并验证棋局…</p> : null}
        {error ? <p className="collection-error" role="alert">{error}</p> : null}
        {loading && !preview ? <div className="learning-actions"><button type="button" onClick={cancel}>取消预览</button></div> : null}
        <div className="collection-list">
          {data.items.length ? data.items.map(entry => <article key={entry.id} aria-label={entry.archive.title}>
            <h4>{entry.archive.title}</h4>
            <p><time dateTime={new Date(entry.savedAt).toISOString()}>{new Date(entry.savedAt).toLocaleString('zh-CN')}</time></p>
            <p>本局 {entry.archive.moves.length} 着 · 起始前缀 {entry.archive.startMoves.length} 着</p>
            {renaming?.id === entry.id ? <form onSubmit={event => { event.preventDefault(); onRename(entry.id, renaming.title); if (renaming.title.trim() && renaming.title.trim().length <= 40) setRenaming(null) }}>
              <label>收藏名称<input required maxLength={40} value={renaming.title} onChange={event => setRenaming({ id: entry.id, title: event.target.value })} /></label>
              <div className="learning-actions"><button type="submit">确认改名</button><button type="button" onClick={() => setRenaming(null)}>取消改名</button></div>
            </form> : <div className="learning-actions">
              <button type="button" onClick={() => open(entry.id)}>查看</button>
              <button type="button" onClick={() => open(entry.id, true)}>导出</button>
              <button type="button" onClick={() => setRenaming({ id: entry.id, title: entry.archive.title })}>重命名</button>
              <button type="button" className="text-danger" onClick={() => { if (window.confirm(`确定删除“${entry.archive.title}”吗？`)) { if (preview?.id === entry.id) cancel(); onRemove(entry.id) } }}>删除</button>
            </div>}
          </article>) : <p className="empty-note">还没有收藏。在对弈中选择“收藏本局”，或导入一份棋局文件。</p>}
        </div>
      </section>
      <section className="collection-preview" aria-label="棋局只读预览">
        {preview ? <>
          <div className="panel collection-preview-heading"><p className="eyebrow">{preview.source === 'file' ? '导入预览 · 尚未加入收藏' : '收藏回看'} · 只读</p><h3>{preview.archive.title}</h3><p className="muted">本局 {preview.archive.moves.length} 着 · 起始前缀 {preview.archive.startMoves.length} 着。当前正式棋局保持在原处。</p><div className="learning-actions"><button type="button" onClick={cancel}>取消预览</button>{preview.source === 'file' ? <button type="button" className="primary-action" onClick={() => onAdd(preview.archive)}>加入收藏</button> : <button type="button" onClick={() => onAdd(preview.archive)}>另存为收藏副本</button>}<button type="button" onClick={() => setExporting(preview.archive)}>导出预览棋局</button></div></div>
          <div className="collection-preview-board"><Board board={viewGame(preview.session).board} lastMove={preview.session.records[preview.session.viewIndex - 1]?.move} /></div>
          <MoveReview key={preview.key} session={preview.session} onChange={session => setPreview(previous => previous?.key === preview.key ? { ...previous, session } : previous)} readOnlyNotes />
          {!preview.session.game.result ? <section className="panel collection-continue">
            <h3>从末着继续</h3><p className="muted">复制成新的局面练习，从完整棋谱末着开始；原收藏保持独立。局面练习不参与首盘记录。</p>
            {!continuing ? <div className="learning-actions"><button type="button" onClick={() => setContinuing(true)}>从末着继续练习</button></div> : <>
              <label>续练方式<select value={mode} onChange={event => setMode(event.target.value as 'local' | 'ai')}><option value="local">本机双人</option><option value="ai">人机练习</option></select></label>
              <label>续练执棋方<select value={playerSide} onChange={event => setPlayerSide(event.target.value as Side)}><option value="red">执红</option><option value="black">执黑</option></select></label>
              <p className="muted">确认后才开始练习。若当前棋局未结束，可以取消后先到对弈页收藏当前局。</p>
              <div className="learning-actions"><button type="button" className="primary-action" onClick={() => onContinue(preview.archive, { mode, playerSide })}>确认继续练习</button><button type="button" onClick={() => setContinuing(false)}>取消续练</button></div>
            </>}
          </section> : null}
        </> : <div className="panel collection-preview-empty"><p className="eyebrow">独立回看</p><h3>选择一盘棋</h3><p className="muted">点击收藏的“查看”，或选择棋局文件。这里会重放真实着法，展示棋盘、逐着说明和已有笔记；预览不会启动电脑行棋。</p></div>}
      </section>
    </div>
    {exporting ? <GameExport archive={exporting} onClose={() => setExporting(null)} /> : null}
  </div>
}
