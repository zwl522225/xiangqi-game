import { useEffect, useRef, useState } from 'react'
import { describeMove, setNote } from '../core/review'
import { setView } from '../core/session'
import type { Session } from '../core/session'
import { pieceName } from './Board'

export type PersistenceStatus = 'pending' | 'saved' | 'failed'
type Props = {
  session: Session
  onChange: (session: Session) => void
  onSeek?: () => void
  thinking?: boolean
  persistenceStatus?: PersistenceStatus
  readOnlyNotes?: boolean
}
const sideName = (side: 'red' | 'black') => side === 'red' ? '红方' : '黑方'
const reasonName = { checkmate: '将死', stalemate: '困毙', 'natural-limit': '自然限着', resignation: '认输', agreement: '双方议和' }

export function MoveReview({ session, onChange, onSeek, thinking = false, persistenceStatus, readOnlyNotes = false }: Props) {
  const [playing, setPlaying] = useState(false)
  const savedNote = session.notes?.[String(session.viewIndex)] ?? ''
  const [draft, setDraft] = useState(savedNote)
  const latest = useRef({ session, onChange, onSeek })
  const playbackView = useRef(session.viewIndex)
  latest.current = { session, onChange, onSeek }
  const first = session.snapshots[0]
  const count = session.records.length
  const description = describeMove(session, session.viewIndex)
  const canPlay = Boolean(session.game.result) && count > 0
  const canNote = session.viewIndex > 0 && session.viewIndex <= count && !thinking

  useEffect(() => { setDraft(savedNote) }, [first, session.viewIndex, savedNote])
  // New games and changed move history end the previous playback.
  useEffect(() => { setPlaying(false) }, [first, session.game, session.records])
  useEffect(() => {
    if (session.viewIndex !== playbackView.current) setPlaying(false)
    playbackView.current = session.viewIndex
  }, [session.viewIndex])
  useEffect(() => {
    if (!playing || !canPlay || session.viewIndex >= count) return
    const expectedGame = session.game
    const expectedRecords = session.records
    const expectedIndex = session.viewIndex
    const timer = window.setTimeout(() => {
      const current = latest.current
      if (current.session.game !== expectedGame || current.session.records !== expectedRecords || current.session.viewIndex !== expectedIndex) { setPlaying(false); return }
      current.onSeek?.()
      playbackView.current = expectedIndex + 1
      current.onChange(setView(current.session, expectedIndex + 1))
      if (expectedIndex + 1 === count) setPlaying(false)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [playing, canPlay, count, session.game, session.records, session.viewIndex])

  function seek(index: number) {
    setPlaying(false)
    const current = latest.current
    playbackView.current = Math.max(0, Math.min(current.session.records.length, index))
    current.onSeek?.()
    current.onChange(setView(current.session, index))
  }
  function togglePlayback() {
    if (playing) { setPlaying(false); return }
    if (session.viewIndex === count) seek(0)
    setPlaying(true)
  }
  function save(text: string) {
    setPlaying(false)
    const current = latest.current
    current.onChange(setNote(current.session, current.session.viewIndex, text))
  }

  return <section className="panel record-panel">
    <div className="panel-title"><div><p className="eyebrow">对局记录</p><h3>棋谱</h3></div><span>{count} 着</span></div>
    <div className="record-list" aria-label="棋谱">
      {count ? session.records.map((record, index) => <button type="button" key={index} className={session.viewIndex === index + 1 ? 'current' : ''} onClick={() => seek(index + 1)}>
        <small>{Math.floor(index / 2) + 1}.{index % 2 ? '…' : ''}</small><strong>{record.notation}</strong><small>{record.coordinate}</small>
      </button>) : <p className="empty-note">落下第一着后，棋谱会出现在这里。</p>}
    </div>
    <label className="review-progress">回看进度
      <input type="range" min={0} max={count} step={1} value={session.viewIndex} disabled={!count} onChange={event => seek(Number(event.target.value))} />
    </label>
    <p className="review-position" aria-live="polite">{session.viewIndex === 0 ? '开局' : `第 ${session.viewIndex} 着`} · 共 {count} 着</p>
    <div className="review-controls">
      <button type="button" onClick={() => seek(0)} disabled={session.viewIndex === 0}>回到开局</button>
      <button type="button" onClick={() => seek(session.viewIndex - 1)} disabled={session.viewIndex === 0}>上一步</button>
      <button type="button" onClick={() => seek(session.viewIndex + 1)} disabled={session.viewIndex === count}>下一步</button>
      <button type="button" onClick={() => seek(count)} disabled={session.viewIndex === count}>跳到末着</button>
      <button type="button" onClick={() => seek(count)} disabled={session.viewIndex === count}>回到当前</button>
      {canPlay ? <button type="button" onClick={togglePlayback}>{playing ? '暂停' : '自动回放'}</button> : null}
    </div>
    <div className="move-facts" aria-live="polite">
      {description ? <>
        <p>{sideName(description.side)}：{pieceName(description.piece)}从 ({description.from.x},{description.from.y}) 走到 ({description.to.x},{description.to.y})，记谱为“{description.notation}”。</p>
        <p>{description.captured ? `吃掉${pieceName(description.captured)}。` : '本着没有吃子。'}{description.check ? `走后${sideName(description.side === 'red' ? 'black' : 'red')}被将军。` : '本着没有造成将军。'}</p>
        {description.outcome ? <p>本着造成{reasonName[description.outcome.reason]}，{description.outcome.winner ? `${sideName(description.outcome.winner)}获胜` : '本局和棋'}。</p> : null}
      </> : <p className="muted">{session.viewIndex === 0 ? '开局尚无着法说明。' : '这一步的前后局面无法核对，暂不提供着法说明。'}</p>}
    </div>
    {readOnlyNotes ? <div className="review-saved-note"><h4>本着已有笔记</h4><p>{savedNote || '本着没有已保存的笔记。'}</p><p className="muted">只读预览；这里只展示棋局副本中的已有笔记。</p></div> : <><label className="review-note">本着笔记
      <textarea rows={4} maxLength={500} value={draft} disabled={!canNote} onFocus={() => setPlaying(false)} onChange={event => { setPlaying(false); setDraft(event.target.value.slice(0, 500)) }} />
    </label>
    <p className="review-note-state" aria-live="polite">{draft !== savedNote ? '草稿尚未保存。' : savedNote ? '笔记已加入本局。' : '选择一着后，可记录自己的观察。'} <span>{draft.length} / 500 字</span></p>
    <div className="review-controls">
      <button type="button" disabled={!canNote || draft === savedNote} onClick={() => save(draft)}>保存笔记</button>
      <button type="button" disabled={!canNote || (!savedNote && !draft)} onClick={() => { setDraft(''); save('') }}>清除笔记</button>
    </div>
    <p className={`review-storage muted${persistenceStatus === 'failed' ? ' review-storage--failed' : ''}`} aria-live="polite">{persistenceStatus === 'failed' ? '浏览器保存失败；本局笔记暂留在当前页面，刷新后可能丢失。' : persistenceStatus === 'saved' ? '本局已保存到当前浏览器。' : persistenceStatus === 'pending' ? '正在保存本局…' : '笔记属于当前对局，每着最多 500 字。'}</p></>}
  </section>
}
