import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { openings } from '../content/openings'
import { openingTrainingView } from '../core/opening-training'
import { legalMoves } from '../core/rules'
import { createSession, play } from '../core/session'
import { samePosition, type Position, type Side } from '../core/types'
import { Board } from './Board'
import { CapturedPieces } from './CapturedPieces'
import type { useOpeningTraining } from './useOpeningTraining'

export type OpeningTrainingController = ReturnType<typeof useOpeningTraining>
const sideName = (side: Side) => side === 'red' ? '红' : '黑'

export function OpeningTraining({ controller }: { controller: OpeningTrainingController }) {
  const { data, dispatch, message, notice, persistenceStatus, retrySave, reset } = controller
  const round = data.active
  const view = useMemo(() => openingTrainingView(round), [round])
  const [openingId, setOpeningId] = useState(round?.openingId ?? openings[0].id)
  const [side, setSide] = useState<Side>(round?.side ?? 'red')
  // Restoring a round always offers a choice before making its board interactive.
  const [running, setRunning] = useState(false)
  const [selected, setSelected] = useState<Position | null>(null)
  const [focusRequest, setFocusRequest] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const task = useRef<HTMLHeadingElement>(null)
  const summary = useRef<HTMLElement>(null)
  const id = useId()
  const complete = view?.complete ?? false
  const learnerTurn = Boolean(running && view?.learnerTurn)
  const legal = useMemo(() => view && learnerTurn ? legalMoves(view.game.board, view.game.turn) : [], [view, learnerTurn])
  const targets = selected ? legal.filter(move => samePosition(move.from, selected)).map(move => move.to) : []
  // A temporary local replay is used only for the captured-piece display.
  const replay = useMemo(() => {
    if (!round || !view) return null
    let session = createSession()
    for (const step of view.opening.steps.slice(0, round.ply)) {
      const result = play(session, step.move)
      if (!result.ok) return null
      session = result.session
    }
    return session
  }, [round, view])

  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => {
    if (focusRequest) (complete ? summary.current : task.current)?.focus()
  }, [focusRequest, complete])

  function begin(nextId: string, nextSide: Side) {
    if (round && !complete && !window.confirm('当前开局跟练尚未完成。重新开始将替换本轮进度，已有完成记录会保留。确定继续吗？')) return
    dispatch({ type: 'start', openingId: nextId, side: nextSide })
    setSelected(null); setRunning(true); setFocusRequest(value => value + 1)
  }
  function continueRound() {
    setSelected(null); setRunning(true); setFocusRequest(value => value + 1)
  }
  function onCell(position: Position) {
    if (!round || !view || !learnerTurn) return
    if (view.game.board[position.y][position.x]?.side === round.side) {
      setSelected(previous => previous && samePosition(previous, position) ? null : position)
      return
    }
    if (!selected) return
    // Submit every explicit target. The core distinguishes illegal moves from route deviations.
    dispatch({ type: 'move', move: { from: selected, to: position } })
    setSelected(null)
  }
  function resetRecords() {
    if (!window.confirm('仅重置开局跟练的八组记录和当前轮；确定清除本项记录吗？')) return
    if (!reset()) return
    setRunning(false); setSelected(null); heading.current?.focus()
  }
  const ownMoves = round ? Math.floor((round.ply + (round.side === 'red' ? 1 : 0)) / 2) : 0
  const errors = round?.errors === 999 ? '999+' : round?.errors ?? 0

  return <section className="opening-training" aria-label="开局跟练">
    <div className="library-header">
      <p className="eyebrow">四条短路线 · 执红执黑共八组</p>
      <h2 ref={heading} tabIndex={-1}>开局跟练</h2>
      <p>每组双方各走四步。路线之外也有其他合法好走法，对方只走示例应手，并非引擎最佳应对。</p>
    </div>
    <section className="panel opening-training-picker" aria-label="选择跟练组">
      <div className="opening-training-options">
        <label htmlFor={`${id}-route`}>跟练路线<select id={`${id}-route`} value={openingId} onChange={event => setOpeningId(event.target.value)}>{openings.map(opening => <option key={opening.id} value={opening.id}>{opening.title}</option>)}</select></label>
        <label htmlFor={`${id}-side`}>跟练执棋方<select id={`${id}-side`} value={side} onChange={event => setSide(event.target.value as Side)}><option value="red">执红</option><option value="black">执黑</option></select></label>
      </div>
      <div className="learning-actions">
        {!round ? <button type="button" className="primary-action" onClick={() => begin(openingId, side)}>开始跟练</button> : <>
          {!running ? <>
            <button type="button" className="primary-action" onClick={continueRound}>继续上次练习</button>
            <button type="button" onClick={() => begin(round.openingId, round.side)}>重新开始</button>
          </> : <button type="button" onClick={() => begin(round.openingId, round.side)}>重练本组</button>}
          <button type="button" onClick={() => begin(openingId, side)}>开始所选新组</button>
        </>}
      </div>
      {round && view && !running ? <p>上次练习：{view.opening.title} · 你执{sideName(round.side)} · 已走 {round.ply} / 8 着。继续会保留本轮错误、提示和示范记录。</p> : null}
    </section>

    {running && round && view ? <div className="opening-training-layout">
      <div className="opening-training-board">
        <Board board={view.game.board} orientation={round.side} selected={selected} legalTargets={targets}
          lastMove={round.ply ? view.opening.steps[round.ply - 1].move : null}
          onCell={learnerTurn ? onCell : undefined} onCancel={() => setSelected(null)} />
      </div>
      <section className="panel opening-training-task" aria-label="当前跟练任务">
        <p className="eyebrow">{view.opening.title} · 你执{sideName(round.side)}</p>
        <h3 ref={task} tabIndex={-1}>{complete ? '八着路线已走完' : `轮到${sideName(view.game.turn)}方${learnerTurn ? '（你）' : '（示例应手）'}`}</h3>
        <p>{complete ? '你已完成自己的 4 步' : `你的第 ${Math.min(ownMoves + 1, 4)} 步 / 共 4 步`}</p>
        <p>已走 {round.ply} / 8 着 · 错误次数：{errors}</p>
        {!complete ? <p>{learnerTurn ? '选择己方棋子，再点落点提交。方向键移动焦点，Enter 或空格点选，Escape 取消。' : `请点击下方按钮，查看${sideName(view.game.turn)}方的一着示例应手。`}</p> : null}
        {view.lastNote ? <div className="lesson-prompt"><strong>{view.notation.at(-1)}</strong><span>{view.lastNote}</span></div> : null}
        {round.hintLevel > 0 && learnerTurn ? <ol className="opening-training-hints" aria-label="本步已展开提示">{view.opening.steps[round.ply].hints.slice(0, round.hintLevel).map((hint, index) => <li key={index}>{hint}</li>)}</ol> : null}
      </section>
      <div className="learning-actions opening-training-actions">
        {!complete ? <>
          <button type="button" className="primary-action" disabled={learnerTurn} onClick={() => { dispatch({ type: 'reply' }); setSelected(null) }}>查看{sideName(round.side === 'red' ? 'black' : 'red')}方应手</button>
          <button type="button" disabled={!learnerTurn || round.hintLevel >= 3} onClick={() => dispatch({ type: 'hint' })}>{round.hintLevel < 3 ? `提示第 ${round.hintLevel + 1} 层` : '三层提示已展开'}</button>
          <button type="button" disabled={!learnerTurn} onClick={() => { dispatch({ type: 'demonstrate' }); setSelected(null) }}>示范本步</button>
        </> : null}
      </div>
      <div className="opening-training-feedback">
        <p className="feedback" role="status" aria-label="跟练反馈">{message || '选择棋子不会显示指定答案。'}</p>
        {complete ? <section className="panel opening-training-summary" aria-label="本轮跟练小结" ref={summary} tabIndex={-1}>
          <h3>本轮跟练小结</h3><p>{view.opening.title} · 你执{sideName(round.side)} · 已完成自己的 4 步</p>
          <p>错误次数：{errors} · 提示：{round.hinted ? '已使用' : '未使用'} · 示范：{round.demonstrated ? '已使用' : '未使用'}</p>
          {!round.errors && !round.hinted && !round.demonstrated ? <p>本轮无提示且无错误。</p> : <p>本轮已完成，帮助和错误记录均已保留。</p>}
          <ol>{view.notation.map((notation, index) => (index % 2 === 0) === (round.side === 'red') ? <li key={index}>{notation}：{view.opening.steps[index].note}</li> : null)}</ol>
        </section> : null}
        {replay ? <CapturedPieces session={replay} scope="training" /> : null}
      </div>
    </div> : <p className="opening-training-welcome">{round ? '可继续原轮，也可选择路线和执棋方开始新组。' : '请选择路线和执棋方，再主动开始跟练。'}</p>}

    <section className="panel opening-training-storage" aria-label="跟练存储">
      <p role="status" aria-label="跟练保存状态">{persistenceStatus === 'blocked' ? '原存档已保护，需主动重置本项记录后才能保存。' : persistenceStatus === 'failed' ? '存储操作失败，请查看下方说明。' : round ? '开局跟练已保存到当前浏览器。' : '本项记录仅保存在当前浏览器。'}</p>
      {notice ? <p className="study-notice" aria-live="polite">{notice}</p> : null}
      <div className="learning-actions">
        {persistenceStatus === 'failed' ? <button type="button" onClick={() => retrySave()}>重试保存</button> : null}
        <button type="button" onClick={resetRecords}>重置本项记录</button>
      </div>
    </section>
    <section className="panel opening-training-history" aria-label="八组跟练记录">
      <h3>八组跟练记录</h3>
      <p className="muted">记录仅描述这八着的练习结果，不代表掌握整个开局。</p>
      <ul>{data.groups.map(group => <li key={`${group.openingId}-${group.side}`}>
        <strong>{openings.find(opening => opening.id === group.openingId)?.title} · 执{sideName(group.side)}</strong>
        <span>{group.completed ? '已完成' : '未完成'} · {group.unassisted ? '曾有本轮无提示且无错误完成' : '尚无无提示且无错误完成记录'}</span>
      </li>)}</ul>
    </section>
  </section>
}
