import { useEffect, useMemo, useRef, useState } from 'react'
import type { CurrentTactic, TacticsAction } from '../core/tactics'
import { isInCheck, legalMoves } from '../core/rules'
import { samePosition, type Position } from '../core/types'
import { Board } from './Board'
import { TacticsCapturedPieces, TacticsScore } from './TacticsCapturedPieces'
import { TacticsErrorReview, TacticsReview, tacticsResultText } from './TacticsReview'

export function TacticsQuestion({ current, index, total, dispatch }: { current: CurrentTactic; index: number; total: number; dispatch: (action: TacticsAction) => void }) {
  const { item, view, lastWrong } = current
  const [selected, setSelected] = useState<Position | null>(null)
  const [showError, setShowError] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const active = !item.result && view.learnerTurn
  const legal = useMemo(() => active ? legalMoves(view.game.board, view.game.turn) : [], [active, view])
  const targets = selected ? legal.filter(move => samePosition(move.from, selected)).map(move => move.to) : []
  useEffect(() => { heading.current?.focus() }, [item.result])
  function action(action: TacticsAction) { setSelected(null); dispatch(action) }
  function retry() {
    if (!item.result && !window.confirm('本题尚未结束。重新挑战将回到题目起点，并保留本轮错误和辅助历史。确定继续吗？')) return
    setShowError(false); action({ type: 'retry' })
  }
  function onCell(position: Position) {
    if (!active) return
    if (view.game.board[position.y][position.x]?.side === view.tactic.side) {
      setSelected(value => value && samePosition(value, position) ? null : position); return
    }
    if (selected) action({ type: 'move', move: { from: selected, to: position } })
  }
  return <div className="tactics-layout">
    <div className="tactics-board">{item.result ? <TacticsReview key={`${item.id}-${item.path.length}`} item={item} /> : <>
      <Board board={view.game.board} orientation={view.tactic.side} selected={selected} legalTargets={targets} lastMove={item.path.at(-1) ?? null} onCell={active ? onCell : undefined} onCancel={() => setSelected(null)} checkedSide={isInCheck(view.game.board, view.game.turn) ? view.game.turn : null} />
      <TacticsCapturedPieces view={view} />
    </>}</div>
    <div className="tactics-side">
      <section className="panel" aria-label="当前战术任务">
        <p className="eyebrow">第 {index + 1} / {total} 题 · {view.tactic.title}</p>
        <h3 ref={heading} tabIndex={-1}>{item.result ? tacticsResultText[item.result] : active ? '轮到你行棋' : '等待对方应手'}</h3>
        <p>你执{view.tactic.side === 'red' ? '红' : '黑'} · 最多走 {view.tactic.maxOwnMoves} 步（一步指你走一次）</p>
        <p>{view.tactic.prompt}</p>
        <p>{item.result ? `你已走 ${view.ownMoves} 步` : `你的第 ${Math.min(view.ownMoves + 1, view.tactic.maxOwnMoves)} 步 / 最多 ${view.tactic.maxOwnMoves} 步`} · 已走 {item.path.length} 着 · 错误次数：{item.errors === 999 ? '999+' : item.errors}</p>
        {!item.result ? <p>{active ? '选择己方棋子，再点落点提交。方向键移动焦点，Enter 或空格点选，Escape 取消。' : '棋盘已锁定。主动查看对方的一着指定应手后，再继续思考。'}</p> : <p>{view.tactic.explanation}</p>}
        {view.notes.length && !item.result ? <p className="lesson-prompt">{view.notes.at(-1)}</p> : null}
        {!item.result ? <TacticsScore view={view} /> : null}
        {item.result ? <p>本题历史：提示{item.hinted ? '已用' : '未用'}、示范{item.demonstrated ? '已用' : '未用'}、反例{item.refutationViewed ? '已看' : '未看'}、{item.retried ? '已重试' : '未重试'}。</p> : null}
        {item.hintLevel > 0 && active ? <ol aria-label="本步已展开提示">{current.hints.slice(0, item.hintLevel).map((hint, n) => <li key={n}>{hint}</li>)}</ol> : null}
      </section>
      <div className="learning-actions tactics-actions">
        {!item.result ? <>
          <button type="button" className="primary-action" disabled={active} onClick={() => action({ type: 'reply' })}>查看对方应手</button>
          <button type="button" disabled={!active || item.hintLevel >= 3} onClick={() => action({ type: 'hint' })}>{item.hintLevel < 3 ? `提示第 ${item.hintLevel + 1} 层` : '三层提示已展开'}</button>
          <button type="button" disabled={!active} onClick={() => action({ type: 'demonstrate' })}>示范本步</button>
          <button type="button" onClick={() => action({ type: 'answer' })}>查看完整变化</button>
          <button type="button" onClick={() => action({ type: 'skip' })}>跳过本题</button>
        </> : <button type="button" className="primary-action" onClick={() => action({ type: 'next' })}>{index + 1 === total ? '查看本轮小结' : '下一题'}</button>}
        <button type="button" onClick={retry}>重新挑战本题</button>
      </div>
      {lastWrong ? <section className="panel tactics-error" aria-label="最近错误提交">
        <h4>最近错误提交</h4><p>历史局面：第 {lastWrong.error.path.length} 着（当时错误提交之前）。当前答题已走 {item.path.length} 着。</p>
        <p>{lastWrong.feedback.message}</p>
        <div className="learning-actions"><button type="button" aria-expanded={showError} onClick={() => { if (!showError && !item.result) action({ type: 'refutation' }); setShowError(value => !value) }}>{showError ? '收起反例' : '查看反例'}</button></div>
        {showError ? <TacticsErrorReview key={JSON.stringify(lastWrong.error)} tacticId={item.id} error={lastWrong.error} /> : null}
      </section> : null}
    </div>
  </div>
}
