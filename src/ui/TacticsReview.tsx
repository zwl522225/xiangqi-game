import { useId, useMemo, useState } from 'react'
import type { TacticsError, TacticsItem } from '../core/tactics'
import { tacticFeedback, tacticView } from '../core/tactics-view'
import { coordinateMove, formatMove } from '../core/notation'
import { isInCheck, tryMove } from '../core/rules'
import { Board } from './Board'
import { TacticsCapturedPieces, TacticsScore } from './TacticsCapturedPieces'

export const tacticsResultText = {
  independent: '本轮首次无提示且无错误完成', assisted: '提示、重试或错误后完成', revealed: '已看答案', skipped: '跳过',
}

/** Local cursor only: reviewing never dispatches a training action. */
export function TacticsReview({ item }: { item: TacticsItem }) {
  const [index, setIndex] = useState(item.path.length)
  const id = useId()
  const view = useMemo(() => tacticView(item.id, item.path.slice(0, index))!, [item, index])
  const full = useMemo(() => tacticView(item.id, item.path)!, [item])
  return <section className="tactics-replay" aria-label="实际变化回看">
    <Board board={view.game.board} orientation={view.tactic.side} lastMove={item.path[index - 1] ?? null} checkedSide={isInCheck(view.game.board, view.game.turn) ? view.game.turn : null} />
    <div className="panel tactics-review-controls">
      <label htmlFor={id}>变化回看位置：{index} / {item.path.length} 着</label>
      <input id={id} type="range" min={0} max={item.path.length} step={1} value={index} onChange={event => setIndex(Number(event.target.value))} aria-label="变化回看位置" />
      <div className="learning-actions">
        <button type="button" disabled={!index} onClick={() => setIndex(0)}>回看起点</button>
        <button type="button" disabled={!index} onClick={() => setIndex(value => value - 1)}>回看上一着</button>
        <button type="button" disabled={index === item.path.length} onClick={() => setIndex(value => value + 1)}>回看下一着</button>
        <button type="button" disabled={index === item.path.length} onClick={() => setIndex(item.path.length)}>回看末着</button>
      </div>
      <p role="status" aria-label="回看局面说明">{index ? view.notes.at(-1) : '题目设置起点；尚未行棋。'}</p>
      <TacticsScore view={view} />
      {full.notation.length ? <ol className="tactics-notation" aria-label="本题实际变化">{full.notation.map((notation, n) => <li key={n} aria-current={index === n + 1 ? 'step' : undefined}>
        <strong>{notation}</strong>{item.answerFrom !== null && n >= item.answerFrom ? <span className="tactics-answer-suffix">（答案示范后缀）</span> : null}：{full.notes[n]}
      </li>)}</ol> : <p>尚无实际走棋记录</p>}
    </div>
    <TacticsCapturedPieces view={view} />
  </section>
}

/** Wrong lines are replayed with the rules engine, outside the proven-edge view. */
export function TacticsErrorReview({ tacticId, error }: { tacticId: string; error: TacticsError }) {
  const replay = useMemo(() => {
    const prefix = tacticView(tacticId, error.path)!
    const feedback = tacticFeedback(tacticId, error.path, error.move)
    let game = prefix.game
    const frames = [game], texts: string[] = []
    for (const [n, move] of [error.move, ...(feedback.refutation ?? [])].entries()) {
      const notation = formatMove(game.board, move), captured = game.board[move.to.y][move.to.x]
      const result = tryMove(game, move)
      if (!result.ok) { texts.push(`错误提交：${notation} ${coordinateMove(move)}。${result.error}`); break }
      texts.push(`${n === 0 ? '错误提交' : '后续示例'}：${notation} ${coordinateMove(move)}。${captured ? `吃掉${captured.side === 'red' ? '红' : '黑'}方棋子。` : '本着没有吃子。'}${result.check ? '走后真实将军。' : '本着没有将军。'}`)
      game = result.game; frames.push(game)
    }
    return { prefix, feedback, frames, texts }
  }, [tacticId, error])
  const [index, setIndex] = useState(0)
  const game = replay.frames[index]
  return <section className="panel tactics-error-review" aria-label="错误变化回看">
    <h4>最近错误的当时局面</h4>
    <p>历史局面：第 {error.path.length} 着，错误提交之前。此处回看不改变当前答题棋盘。</p>
    {replay.prefix.notation.length ? <p>当时正确前缀：{replay.prefix.notation.join('、')}</p> : null}
    <Board board={game.board} orientation={replay.prefix.tactic.side} checkedSide={isInCheck(game.board, game.turn) ? game.turn : null} />
    <label>错误变化回看位置：{index} / {replay.frames.length - 1}<input type="range" aria-label="错误变化回看位置" min={0} max={replay.frames.length - 1} step={1} value={index} onChange={event => setIndex(Number(event.target.value))} /></label>
    <p>{replay.feedback.message}</p>
    {replay.feedback.refutation?.length ? <p>一种可行防守及后续示例；这一条变化仅展示目标失败的一种实际可能。</p> : null}
    <ol className="tactics-notation">{replay.texts.map((text, n) => <li key={n}>{text}</li>)}</ol>
  </section>
}
