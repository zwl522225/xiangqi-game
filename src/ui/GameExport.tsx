import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { inspectArchive, writeGameFile } from '../core/archive-codec'
import type { ArchivedGame } from '../core/archive-codec'

const reasonNames = { checkmate: '将死', stalemate: '困毙', 'natural-limit': '自然限着', resignation: '认输', agreement: '双方议和' }

export function GameExport({ archive, onClose }: { archive: ArchivedGame; onClose: () => void }) {
  const [title, setTitle] = useState(archive.title)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [notice, setNotice] = useState('')
  const [inspected] = useState(() => inspectArchive(archive))
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])
  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key !== 'Tab') return
    const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')
    if (!controls?.length) return
    const first = controls[0], last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  function download() {
    const result = writeGameFile({ ...archive, title }, includeNotes)
    if (!result.ok) { setNotice(result.error); return }
    let url: string | undefined
    const link = document.createElement('a')
    try {
      url = URL.createObjectURL(new Blob([result.value], { type: 'application/json;charset=utf-8' }))
      link.href = url
      link.download = 'yixiang-game.json'
      document.body.append(link)
      link.click()
      setNotice('已发起下载，请在浏览器下载列表中查看文件。')
    } catch { setNotice('浏览器未能下载文件，请重试。') }
    finally { link.remove(); if (url) URL.revokeObjectURL(url) }
  }
  const outcome = inspected.ok ? inspected.value.session.game.result : null
  const ending = outcome?.reason === 'resignation' ? `${outcome.winner === 'red' ? '黑方' : '红方'}认输` : outcome ? reasonNames[outcome.reason] : '尚未结束'
  return <div className="game-export-backdrop">
    <div className="panel game-export" role="dialog" aria-modal="true" aria-labelledby="game-export-title" ref={dialog} onKeyDown={handleKey}>
      <p className="eyebrow">手动跨设备转移</p><h2 id="game-export-title">导出棋局</h2>
      <p>下载弈象第 1 版 JSON 棋局文件，可在另一台设备的“棋局收藏”中手动导入。</p>
      <label>导出名称<input value={title} maxLength={40} onChange={event => setTitle(event.target.value)} /></label>
      <p>总着数：{archive.moves.length + archive.startMoves.length} 着（本局 {archive.moves.length} 着，起始前缀 {archive.startMoves.length} 着）</p>
      <p>结束方式：{ending}</p>
      <label className="export-notes"><input type="checkbox" checked={includeNotes} onChange={event => setIncludeNotes(event.target.checked)} />包含复盘笔记</label>
      <p className="muted">默认不包含笔记；文件仅含棋局和你主动选择的笔记。</p>
      {!inspected.ok ? <p role="alert">{inspected.error}</p> : null}
      <p className="collection-notice" aria-live="polite">{notice}</p>
      <div className="learning-actions"><button type="button" className="primary-action" disabled={!inspected.ok} onClick={download}>下载 JSON 文件</button><button type="button" onClick={onClose}>取消导出</button></div>
    </div>
  </div>
}
