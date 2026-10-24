import { useEffect, useMemo, useRef, useState } from 'react'
import { endgames, endgameTopics, endgameRouteNotice, type EndgameLesson } from '../content/endgames'
import { endgameFinished } from '../core/endgame-lessons'
import { isInCheck, legalMoves } from '../core/rules'
import { samePosition, type Position } from '../core/types'
import { Board } from './Board'
import { CapturedPieces } from './CapturedPieces'
import { endgameReplay, EndgamePlayedLine } from './EndgameReplay'
import type { EndgameLessonsController } from './useEndgameLessons'

type View = { kind: 'directory' | 'practice' } | { kind: 'demo' | 'defense' | 'history'; id: string; ply: number; returnTo: 'directory' | 'practice' }
const sideName = (lesson: EndgameLesson) => lesson.side === 'red' ? '红' : '黑'

export function EndgameLessons({ controller }: { controller: EndgameLessonsController }) {
  const { data, message, notice, persistenceStatus, dispatch, retrySave, reset } = controller
  const [view, setView] = useState<View>({ kind: 'directory' })
  const [selection, setSelection] = useState<{ key: string; position: Position } | null>(null)
  const heading = useRef<HTMLElement | null>(null)
  const round = data.round
  const positionKey = `${round?.id}:${round?.version}:${round?.ply}`
  const selected = selection?.key === positionKey ? selection.position : null
  const active = endgames.find(lesson => lesson.id === round?.id)
  const complete = endgameFinished(data)
  const practicing = view.kind === 'practice' && Boolean(round && active)
  const reading = 'id' in view && (view.kind !== 'history' || round?.id === view.id)
  const lesson = reading ? endgames.find(lesson => lesson.id === view.id)! : active
  const ply = reading ? view.kind === 'history' ? Math.min(view.ply, round?.ply ?? 0) : view.ply : round?.ply ?? 0
  const replay = useMemo(() => lesson ? endgameReplay(lesson, ply, view.kind === 'defense') : null, [lesson, ply, view.kind])
  const game = replay?.game
  const ownTurn = Boolean(practicing && !complete && game?.turn === lesson?.side)
  const legal = useMemo(() => game && ownTurn ? legalMoves(game.board, game.turn) : [], [game, ownTurn])
  const targets = selected ? legal.filter(move => samePosition(move.from, selected)).map(move => move.to) : []
  const errors = round?.errors === 999 ? '999+' : round?.errors ?? 0

  useEffect(() => { heading.current?.focus() }, [view.kind, reading ? view.id : null, complete, round?.id])

  // Invalidate during render so a replaced/restored position never submits an old origin.
  // Clearing the stored selection also prevents it reappearing when revisiting an earlier prefix.
  if (selection && selection.key !== positionKey) setSelection(null)
  function setSelected(position: Position | null) { setSelection(position ? { key: positionKey, position } : null) }
  function changeView(next: View) { setSelected(null); setView(next) }
  function begin(next: EndgameLesson) {
    if (round && !complete && !window.confirm('当前残局教学尚未完成。重新开始或换题将替换本轮进度，已有完成记录保留。确定继续吗？')) return
    dispatch({ type: 'start', id: next.id }); changeView({ kind: 'practice' })
  }
  function openDemo(next: EndgameLesson, returnTo: 'directory' | 'practice') {
    dispatch({ type: 'explanation', topic: next.topic })
    changeView({ kind: 'demo', id: next.id, ply: 0, returnTo })
  }
  function openDefense() {
    if (!lesson?.defense || !reading) return
    dispatch({ type: 'explanation', topic: lesson.topic })
    changeView({ kind: 'defense', id: lesson.id, ply: 0, returnTo: view.returnTo })
  }
  function onCell(position: Position) {
    if (!ownTurn || !game || !lesson) return
    if (game.board[position.y][position.x]?.side === lesson.side) {
      setSelected(selected && samePosition(selected, position) ? null : position); return
    }
    if (!selected) return
    dispatch({ type: 'submit', move: { from: selected, to: position } }); setSelected(null)
  }
  function resetRecords() {
    if (!window.confirm('仅重置残局分步教学的六题记录和当前轮。确定清除本项记录吗？')) return
    if (reset()) changeView({ kind: 'directory' })
  }
  const refHeading = (element: HTMLElement | null) => { heading.current = element }
  const checkedSide = game && isInCheck(game.board, game.turn) ? game.turn : null
  const demoLesson = active && endgames.find(lesson => lesson.topic === active.topic && lesson.id.endsWith('-a'))!
  const readMaximum = reading && lesson ? view.kind === 'history' ? round?.id === lesson.id ? round.ply : 0
    : view.kind === 'defense' ? lesson.defense!.moves.length : lesson.line.length : 0
  const shownExplanations = lesson ? view.kind === 'defense' ? [...lesson.explanations.slice(0, lesson.defense!.fromPly), ...lesson.defense!.explanations] : lesson.explanations : []

  return <section className="endgame-lessons" aria-label="残局分步教学">
    <div className="library-header">
      <p className="eyebrow">三个主题 · 六道教学设置局面</p>
      <h2 ref={!practicing && !reading ? refHeading : undefined} tabIndex={-1}>残局分步教学</h2>
      <p>{endgameRouteNotice}</p>
    </div>

    {!practicing && !reading ? <>
      {round && active ? <section className="panel" aria-label="上次残局练习">
        <p>{active.title} · 执{sideName(active)} · 已走 {round.ply} / {active.line.length} 着{complete ? ' · 本轮已完成' : ' · 本轮未完成'}</p>
        <div className="learning-actions"><button className="primary-action" onClick={() => changeView({ kind: 'practice' })}>继续上次练习</button><button onClick={() => begin(active)}>重新开始</button></div>
        <p className="muted">主动继续会保留当前节点、错误和辅助记录，不自动走应手。</p>
      </section> : null}
      <div className="endgame-topics">{endgameTopics.map(topic => {
        const lessons = endgames.filter(lesson => lesson.topic === topic.id)
        return <section className="panel" key={topic.id} aria-label={topic.title}>
          <h3>{topic.title}</h3><p>{topic.summary}</p>
          <div className="endgame-cards">{lessons.map(lesson => <section key={lesson.id} aria-label={lesson.title}>
            <h4>{lesson.title}</h4><p>固定执{sideName(lesson)}</p>
            {persistenceStatus === 'blocked' ? <p>原记录暂不可读取</p> : <>
              <p>{data.records[lesson.id].completed ? '曾完成指定路线' : '尚未完成指定路线'}</p>
              <p>{data.records[lesson.id].independent ? '曾本轮无提示且无错误完成' : '尚无本轮无提示且无错误完成记录'}</p>
            </>}
          </section>)}</div>
          <div className="learning-actions"><button onClick={() => openDemo(lessons[0], 'directory')}>看示范</button><button className="primary-action" onClick={() => begin(lessons[0])}>练 A 题</button><button onClick={() => begin(lessons[1])}>换局面练 B 题</button></div>
        </section>
      })}</div>
      <p className="muted">{persistenceStatus === 'blocked' ? '临时练习记录不能代表原历史。' : ''}两项历史分别保留，不代表残局掌握认证；B 题是换局面练习，不保证此前未见。</p>
    </> : null}

    {(practicing || reading) && lesson && replay && game ? <div className="endgame-layout">
      <div className="endgame-board"><Board board={game.board} orientation={lesson.side} selected={selected} legalTargets={targets}
        lastMove={replay.records.at(-1)?.move ?? null} checkedSide={checkedSide}
        onCell={ownTurn ? onCell : undefined} onCancel={() => setSelected(null)} /></div>
      <div className="endgame-detail">
        {practicing && round ? <>
          {!complete ? <section className="panel" aria-label="当前残局任务">
            <p className="eyebrow">{lesson.title} · 你执{sideName(lesson)}</p>
            <h3 ref={refHeading} tabIndex={-1}>{ownTurn ? '轮到你行棋' : '轮到对方行棋'}</h3>
            <p>你的第 {Math.min(Math.floor(round.ply / 2) + 1, lesson.hints.length)} 步 / 共 {lesson.hints.length} 步</p>
            {ownTurn ? <p className="lesson-prompt" role="note" aria-label="本步任务">本步任务：{lesson.tasks[Math.floor(round.ply / 2)]}</p> : null}
            <p>目标：沿本题指定路线完成将死。已走 {round.ply} / {lesson.line.length} 着 · 错误次数：{errors}</p>
            <p>{ownTurn ? '选择己方棋子，再点落点提交。方向键移动焦点，Enter 或空格点选，Escape 取消。' : '棋盘已锁定，请主动查看对方的一着指定应手。'}</p>
            {replay.records.length ? <div className="lesson-prompt"><strong>{replay.records.at(-1)!.notation}</strong><span>{lesson.explanations[round.ply - 1]}</span><span>{checkedSide ? '实际将军' : '当前未被将军'}</span></div> : null}
            {ownTurn && round.hintLevel > 0 ? <ol aria-label="本步已展开提示">{lesson.hints[Math.floor(round.ply / 2)].slice(0, round.hintLevel).map(hint => <li key={hint}>{hint}</li>)}</ol> : null}
          </section> : <section className="panel" aria-label="本轮残局小结" ref={refHeading} tabIndex={-1}>
            <h3>本轮残局小结</h3><p>{lesson.title} · 你执{sideName(lesson)}</p>
            <p>{game.result?.winner === 'red' ? '红' : '黑'}方获胜 · {game.result?.reason === 'checkmate' ? '将死' : '结果待核对'}</p>
            <p>错误次数：{errors} · 提示：{round.helpUsed ? '已使用' : '未使用'} · 示范本步：{round.demoUsed ? '已使用' : '未使用'} · 本主题讲解：{round.explanationViewed ? '已查看' : '未查看'}</p>
            <p>{!round.hadError && !round.helpUsed && !round.demoUsed && !round.explanationViewed ? '本轮无提示且无错误完成指定路线。' : '已完成指定路线，本轮包含错误或辅助。'}</p>
            <p className="muted">该记录不代表此前未见过题目，也不代表残局掌握认证。</p>
            <EndgamePlayedLine session={replay} explanations={lesson.explanations} />
          </section>}
          <div className="learning-actions">
            {!complete ? <><button className="primary-action" disabled={ownTurn} onClick={() => { dispatch({ type: 'reply' }); setSelected(null) }}>查看指定应手</button>
              <button disabled={!ownTurn || round.hintLevel >= 3} onClick={() => dispatch({ type: 'hint' })}>{round.hintLevel < 3 ? `提示第 ${round.hintLevel + 1} 层` : '三层提示已展开'}</button>
              <button disabled={!ownTurn} onClick={() => { dispatch({ type: 'demo' }); setSelected(null) }}>示范本步</button></> : null}
            <button onClick={() => openDemo(demoLesson!, 'practice')}>看本主题示范</button>
            <button onClick={() => changeView({ kind: 'history', id: lesson.id, ply: round.ply, returnTo: 'practice' })}>回看已走棋谱</button>
            <button onClick={() => begin(lesson)}>重练本题</button><button onClick={() => changeView({ kind: 'directory' })}>返回目录</button>
          </div>
          <p className="feedback" role="status" aria-label="残局答题反馈">{message || '选择棋子不会提交答案。'}</p>
        </> : reading ? <section className="panel" aria-label="残局只读浏览">
          <p className="eyebrow">{lesson.title} · 执{sideName(lesson)} · 棋盘只读</p>
          <h3 ref={refHeading} tabIndex={-1}>{view.kind === 'demo' ? '只读示范' : view.kind === 'defense' ? '只读防守分支' : '只读已走棋谱'}</h3>
          <p>已展示 {ply} / {readMaximum} 着</p>
          {view.kind === 'defense' ? <p>从 A 题实际第 {lesson.defense!.fromPly} 着局面分出；该分支尚未结束，仅解释已展示的变化。</p> : null}
          <div className="learning-actions"><button disabled={ply === 0} onClick={() => changeView({ ...view, ply: ply - 1 })}>上一着</button><button disabled={ply >= readMaximum} onClick={() => changeView({ ...view, ply: ply + 1 })}>下一着</button></div>
          <EndgamePlayedLine session={replay} explanations={shownExplanations} />
          {!replay.records.length ? <p>教学设置起点，尚未走棋。</p> : null}
          <div className="learning-actions">
            {view.kind === 'demo' && lesson.defense ? <button onClick={openDefense}>换一种防守会怎样</button> : null}
            {view.returnTo === 'practice' ? <button className="primary-action" onClick={() => changeView({ kind: 'practice' })}>返回当前答题</button> : null}
            <button onClick={() => changeView({ kind: 'directory' })}>返回目录</button>
          </div>
          <p className="muted">只读浏览不会移动当前答题局面。同主题未完成轮会记录已查看讲解。</p>
        </section> : null}
        <CapturedPieces session={replay} scope="endgame" />
      </div>
    </div> : null}

    <section className="panel endgame-storage" aria-label="残局教学存储">
      <p role="status" aria-label="残局保存状态">{persistenceStatus === 'blocked' ? '原存档已保护。当前为临时练习，请显式重置或恢复有效备份后保存。' : persistenceStatus === 'failed' ? '存储操作失败，请查看说明并重试。' : round ? '残局分步教学已保存到当前浏览器。' : '本项记录仅保存在当前浏览器。'}</p>
      {notice ? <p className="study-notice">{notice}</p> : null}
      <div className="learning-actions">{persistenceStatus === 'failed' ? <button onClick={() => retrySave()}>重试保存</button> : null}<button onClick={resetRecords}>重置本项记录</button></div>
    </section>
  </section>
}
