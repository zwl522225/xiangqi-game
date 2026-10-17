import { useEffect, useMemo, useState } from 'react'
import type { ArchivedGame } from '../core/archive-codec'
import { isInCheck, legalMoves } from '../core/rules'
import { viewGame } from '../core/session'
import { archiveStudy, MAX_STUDY_PLIES, playStudy, resetStudy, truncateStudy, undoStudy } from '../core/study'
import type { Study } from '../core/study'
import { samePosition } from '../core/types'
import type { Position, Side } from '../core/types'
import { Board } from './Board'
import { CapturedPieces } from './CapturedPieces'
import { MoveReview } from './MoveReview'
import type { PersistenceStatus } from './MoveReview'

export type StudyWorkspaceProps = {
  study: Study | null
  notice: string
  persistenceStatus: PersistenceStatus
  collectionNotice: string
  collectionPersistenceStatus: PersistenceStatus
  onChange: (study: Study) => void
  onClear: () => void
  onCollect: (archive: ArchivedGame) => void
  onExport: (archive: ArchivedGame) => void
  onSource: () => void
  onMatch: () => void
  onCollection: () => void
}

const sideName = (side: Side) => side === 'red' ? '红方' : '黑方'
const sourceName = { match: '对弈', collection: '收藏', file: '文件' }
const reasonName = { checkmate: '将死', stalemate: '困毙', 'natural-limit': '自然限着', resignation: '认输', agreement: '双方议和' }

export function StudyWorkspace({ study, notice, persistenceStatus, collectionNotice, collectionPersistenceStatus, onChange, onClear, onCollect, onExport, onSource, onMatch, onCollection }: StudyWorkspaceProps) {
  const [selected, setSelected] = useState<Position | null>(null)
  const [actionNotice, setActionNotice] = useState('')
  const [title, setTitle] = useState('试走')
  const first = study?.session.snapshots[0]
  useEffect(() => { setSelected(null); setActionNotice('') }, [first])
  const showing = study ? viewGame(study.session) : null
  const legal = useMemo(() => showing ? legalMoves(showing.board, showing.turn) : [], [showing?.board, showing?.turn])
  const targets = selected ? legal.filter(move => samePosition(move.from, selected)).map(move => move.to) : []

  function clear() {
    if (window.confirm('清空试走会删除当前试走草稿及笔记，确定继续吗？')) onClear()
  }
  function handleCell(position: Position) {
    if (!study) return
    const { session } = study
    if (session.viewIndex !== session.records.length) { setActionNotice('请先从这里改走或跳到末着，再继续试走。'); return }
    if (session.game.result) { setActionNotice('试走已结束，可以回看棋谱或从更早的位置改走。'); return }
    if ((session.origin?.startMoves.length ?? 0) + session.records.length >= MAX_STUDY_PLIES) {
      setActionNotice('试走已达600着上限，请悔棋或选择更早的位置。'); return
    }
    const piece = session.game.board[position.y][position.x]
    if (selected) {
      if (samePosition(selected, position)) { setSelected(null); return }
      if (piece?.side === session.game.turn) { setSelected(position); setActionNotice('已标出这枚棋子的合法落点。'); return }
      const result = playStudy(study, { from: selected, to: position })
      if (!result.ok) { setActionNotice(result.error); return }
      onChange(result.value)
      setSelected(null)
      const next = result.value.session
      setActionNotice(next.game.result ? '试走已结束，可以回看棋谱或从更早的位置改走。' :
        (next.origin?.startMoves.length ?? 0) + next.records.length >= MAX_STUDY_PLIES ? '试走已达600着上限，请悔棋或选择更早的位置。' :
        next.game.repetitionWarning ? '局面再次重复；复杂循环需按棋例判断。' : next.records.at(-1)!.notation)
    } else if (piece?.side === session.game.turn) {
      setSelected(position); setActionNotice('已标出这枚棋子的合法落点。')
    } else setActionNotice(`请先选择${sideName(session.game.turn)}棋子。`)
  }
  function saveArchive(exporting: boolean) {
    if (!study) return
    const result = archiveStudy(study, title)
    if (!result.ok) { setActionNotice(result.error); return }
    setActionNotice('')
    if (exporting) onExport(result.value)
    else onCollect(result.value)
  }

  if (!study || !showing) return <section className="study-page" aria-label="试走工作区">
    <div className="study-heading"><p className="eyebrow">试走</p><h2>试走研究</h2></div>
    <section className="panel study-empty"><h3>无草稿</h3><p className="muted">从对弈或收藏棋谱的所选位置开始试走，研究自己的变化。</p>
      <div className="learning-actions"><button type="button" onClick={onMatch}>前往对弈</button><button type="button" onClick={onCollection}>前往收藏</button>
        {notice ? <button type="button" onClick={clear}>清空试走</button> : null}</div>
      {notice ? <p className="study-notice" role="status">{notice}</p> : null}
    </section>
  </section>

  const { session } = study
  const reviewing = session.viewIndex !== session.records.length
  const checked = !showing.result && isInCheck(showing.board, showing.turn) ? showing.turn : null
  const positionStatus = showing.result ? showing.result.winner ? `${sideName(showing.result.winner)}获胜 · ${reasonName[showing.result.reason]}` : `和棋 · ${reasonName[showing.result.reason]}` : checked ? `${sideName(checked)}被将军 · 必须应将` : `${sideName(showing.turn)}行棋`
  const status = reviewing ? `回看${session.viewIndex === 0 ? '试走起点' : `第 ${session.viewIndex} 着`} · ${positionStatus}` : positionStatus
  const capped = (session.origin?.startMoves.length ?? 0) + session.records.length >= MAX_STUDY_PLIES
  const fallbackNotice = session.game.result ? '试走已结束，可以回看棋谱或从更早的位置改走。' : capped ? '试走已达600着上限，请悔棋或选择更早的位置。' : '双方均由你手动走棋，点击当前行棋方的棋子查看合法落点。'
  return <section className="study-page" aria-label="试走工作区">
    <div className="study-heading"><p className="eyebrow">独立草稿</p><h2>试走研究</h2>
      <p className="muted">来源：{sourceName[study.source.kind]} · {study.source.title} · 原局第 {study.source.ply} 着</p>
      <p className="muted">试走起点：{sideName(session.snapshots[0].turn)}行棋。仅研究新增变化；棋谱、笔记与失子从试走起点开始记录。</p>
    </div>
    {notice ? <p className="study-notice" aria-live="polite">{notice}</p> : null}
    <div className="workspace">
      <section className="board-column" aria-label="试走棋局">
        <div className="board-heading"><div><p className="eyebrow">手动试走</p><h3>当前局面</h3></div><span className={`turn-badge ${showing.turn}`} aria-live="polite">{status}</span></div>
        <Board board={showing.board} orientation={study.orientation} selected={selected} legalTargets={targets}
          lastMove={session.viewIndex > 0 ? session.records[session.viewIndex - 1]?.move : null} checkedSide={checked} onCell={handleCell} onCancel={() => setSelected(null)} />
        <p className="status-line" role="status">{actionNotice || fallbackNotice}</p>
        <div className="board-controls">
          <span className="board-view-label">当前视角：{sideName(study.orientation)}在下</span>
          <button type="button" onClick={() => { onChange(undoStudy(study)); setSelected(null); setActionNotice('已悔棋一着。') }} disabled={!session.records.length}>悔棋</button>
          <button type="button" onClick={() => { if (window.confirm('回到试走起点会删除本次试走的全部着法和笔记，确定继续吗？')) { onChange(resetStudy(study)); setSelected(null); setActionNotice('已回到试走起点。') } }} disabled={!session.records.length}>回到试走起点</button>
          <button type="button" onClick={() => { if (window.confirm('从这里改走会删除后续试走着法及其笔记，确定继续吗？')) { onChange(truncateStudy(study)); setSelected(null); setActionNotice('已保留当前局面，可以继续试走。') } }} disabled={!reviewing}>从这里改走</button>
          <button type="button" onClick={() => onChange({ ...study, orientation: study.orientation === 'red' ? 'black' : 'red' })}>翻转棋盘</button>
          <button type="button" onClick={onSource}>返回来源</button><button type="button" className="text-danger" onClick={clear}>清空试走</button>
        </div>
      </section>
      <aside className="side-column">
        <section className="panel study-save" aria-label="保存试走变化"><h3>保存变化</h3>
          <label>试走收藏名称<input maxLength={40} value={title} onChange={event => setTitle(event.target.value)} /></label>
          <div className="review-controls"><button type="button" disabled={!session.records.length} onClick={() => saveArchive(false)}>收藏试走</button><button type="button" disabled={!session.records.length} onClick={() => saveArchive(true)}>导出试走</button></div>
          {!session.records.length ? <p className="muted">请先试走一着，再收藏或导出这条变化。</p> : null}
          {collectionNotice ? <p className="collection-notice" aria-live="polite">{collectionNotice}</p> : null}
          <p className={`study-collection-storage muted${collectionPersistenceStatus === 'failed' ? ' review-storage--failed' : ''}`} aria-live="polite">{collectionPersistenceStatus === 'failed' ? '本机收藏保存失败；当前页面中的收藏刷新后可能丢失。' : collectionPersistenceStatus === 'pending' ? '正在保存收藏…' : '本机收藏已保存到当前浏览器。'}</p>
        </section>
        <CapturedPieces session={session} scope="study" />
        <MoveReview session={session} scope="study" onChange={next => onChange({ ...study, session: next })} onSeek={() => { setSelected(null); setActionNotice('') }} persistenceStatus={persistenceStatus} />
      </aside>
    </div>
  </section>
}
