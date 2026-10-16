import { useMemo, useState } from 'react'
import { practiceExercises, practiceTopics } from '../content/practice'
import type { PracticeTopicId } from '../content/practice'
import { currentPractice, practiceDisplayGame, practiceFeedback, practiceGame, practiceSummary } from '../core/practice'
import type { PracticeData, PracticeRequest, PracticeSubmission } from '../core/practice'
import { gradeChoiceTask, gradeMoveTask } from '../core/lesson-goals'
import { coordinateMove, formatMove } from '../core/notation'
import { isInCheck, legalMoves } from '../core/rules'
import { samePosition } from '../core/types'
import type { Position } from '../core/types'
import { Board } from './Board'

export type PracticeAction =
  | { type: 'start'; request: PracticeRequest }
  | { type: 'submit'; submission: PracticeSubmission }
  | { type: 'hint' | 'answer' | 'retry' | 'skip' | 'next' | 'clear' }
type Props = {
  data: PracticeData
  onAction: (action: PracticeAction) => void
  onLearn: (unitId: string) => void
  persistenceStatus: 'pending' | 'saved' | 'failed'
}
const hintLabels = ['提示 1 · 观察', '提示 2 · 规则与思路', '提示 3 · 具体着法或答案']
const resultLabels = { independent: '首次无提示完成', assisted: '提示或重试后完成', skipped: '跳过' }

export function Practice({ data, onAction, onLearn, persistenceStatus }: Props) {
  const [directory, setDirectory] = useState(true)
  const [filter, setFilter] = useState<PracticeTopicId | 'all'>('all')
  const summary = practiceSummary(data)
  const pending = practiceExercises.filter(exercise => data.records[exercise.id]?.review === 'pending').length
  const storageText = persistenceStatus === 'pending' ? '正在保存本轮进度…' : persistenceStatus === 'saved' ? '本轮进度已保存到本机' : '保存失败，刷新可能丢失本轮进度。'

  function start(request: PracticeRequest) {
    if (data.round && !summary.finished && !window.confirm('当前练习尚未结束，要用新一轮替换吗？错题记录会保留。')) return
    onAction({ type: 'start', request })
    setDirectory(false)
  }

  return <section className="practice-page">
    <header className="library-header">
      <p className="eyebrow">换个局面，再试一次</p>
      <h2>主题练习</h2>
      <p>练习单独记录，不改变课堂掌握、复盘笔记或正在进行的对局。</p>
      <p className={`practice-storage practice-storage--${persistenceStatus}`} aria-live="polite">{storageText}</p>
    </header>
    {directory ? <>
      <section className="panel practice-entry" aria-label="练习目录">
        <h3>今天想练什么</h3>
        <p className="muted">待复习错题优先，其次是已练未掌握课堂相关的未做题，再按练习次数与固定题号推荐；每轮最多 5 题。</p>
        <div className="learning-actions">
          <button type="button" className="primary-action" onClick={() => start({ mode: 'recommended' })}>推荐练习</button>
          <button type="button" onClick={() => start({ mode: 'mistakes' })}>错题再练</button>
          {data.round && !summary.finished ? <button type="button" onClick={() => setDirectory(false)}>继续上次练习</button> : null}
          {summary.finished && summary.total > 0 ? <button type="button" onClick={() => setDirectory(false)}>查看上轮小结</button> : null}
        </div>
        <p className="muted">待复习错题：{pending}。独立答对后移出待复习队列，历史记录仍会保留。</p>
      </section>
      <div className="practice-topics">
        {practiceTopics.map(topic => <article className="panel" key={topic.id}>
          <h3>{topic.title}</h3><p className="muted">{topic.description}</p>
          <p className="muted">每轮 4 题</p>
          <div className="learning-actions"><button type="button" onClick={() => start({ mode: 'topic', topicId: topic.id })}>按主题练：{topic.title}</button></div>
        </article>)}
      </div>
      <section className="panel practice-mistakes" aria-label="错题记录">
        <h3>错题记录</h3>
        <label>筛选主题 <select value={filter} onChange={event => setFilter(event.target.value as PracticeTopicId | 'all')}>
          <option value="all">全部主题</option>{practiceTopics.map(topic => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
        </select></label>
        <Mistakes data={data} filter={filter} />
      </section>
      <div className="learning-actions"><button type="button" className="text-danger" onClick={() => {
        if (window.confirm('清空所有主题练习记录和当前轮次？课堂、对局和笔记会保留。')) onAction({ type: 'clear' })
      }}>清空练习记录</button></div>
    </> : summary.finished ? <section className="panel practice-summary">
      <h3>{summary.total === 0 ? '暂无待复习错题' : '本轮小结'}</h3>
      {summary.total === 0 ? <p>当前没有需要再练的错题，可以开始推荐练习或按主题练。</p> : <>
        <p>已结束 {summary.completed} / {summary.total}</p>
        <p>首次无提示完成：{summary.independent}</p><p>提示或重试后完成：{summary.assisted}</p><p>跳过：{summary.skipped}</p>
      </>}
      <div className="learning-actions"><button type="button" onClick={() => setDirectory(true)}>返回练习目录</button></div>
    </section> : <PracticeQuestion key={`${data.round?.items.map(item => item.id).join(':')}:${data.round?.index}`} data={data} onAction={onAction} onLearn={onLearn} onDirectory={() => setDirectory(true)} />}
  </section>
}

function Mistakes({ data, filter }: { data: PracticeData; filter: PracticeTopicId | 'all' }) {
  const mistakes = practiceExercises.filter(exercise => data.records[exercise.id]?.lastError && (filter === 'all' || exercise.topicId === filter))
  if (!mistakes.length) return <p className="empty-note">{filter === 'all' ? '暂无错题记录' : '这个主题暂无错题记录'}</p>
  return <ul className="practice-mistake-list">{mistakes.map(exercise => {
    const record = data.records[exercise.id]
    const submission = record.lastError!
    const task = exercise.task
    const feedback = task.kind === 'move' && submission.kind === 'move' ? gradeMoveTask(task, practiceGame(task), submission.move) : task.kind === 'choice' && submission.kind === 'choice' ? gradeChoiceTask(task, submission.optionId) : null
    const caption = submission.kind === 'move' ? coordinateMove(submission.move) : task.kind === 'choice' ? task.options.find(option => option.id === submission.optionId)?.label : ''
    return <li key={exercise.id}>
      <strong>{exercise.title}</strong><span>{record.review === 'reviewed' ? '已独立复习' : '待复习'} · 错误 {record.errors} 次</span>
      <p>最近错误：{caption}</p><p>{task.kind === 'choice' ? '选项未答对：' : feedback?.status === 'illegal' ? '非法着法：' : '合法，但未达目标：'}{feedback?.message}</p>
    </li>
  })}</ul>
}

function PracticeQuestion({ data, onAction, onLearn, onDirectory }: Omit<Props, 'persistenceStatus'> & { onDirectory: () => void }) {
  const [selected, setSelected] = useState<Position | null>(null)
  const current = currentPractice(data)!
  const { exercise, item, index, total } = current
  const task = exercise.task
  const game = practiceDisplayGame(data)!
  const feedback = practiceFeedback(data)
  const legal = useMemo(() => legalMoves(game.board, game.turn), [game.board, game.turn])
  const targets = selected && !item.result ? legal.filter(move => samePosition(move.from, selected)).map(move => move.to) : []
  const lastMove = feedback?.status === 'success' && item.submission?.kind === 'move' ? item.submission.move : null
  let answer: string | null = null
  if (item.answerShown) {
    if (task.kind === 'move') {
      const reference = task.solutions[0]
      const grade = gradeMoveTask(task, practiceGame(task), reference)
      if (grade.status === 'success') answer = `${formatMove(task.board, reference)}，${coordinateMove(reference)}。${grade.message}`
    } else {
      const grade = gradeChoiceTask(task, task.correctOptionId)
      if (grade.status === 'success') answer = `${task.options.find(option => option.id === task.correctOptionId)!.label}。${grade.message}`
    }
  }
  function cell(position: Position) {
    if (item.result || task.kind !== 'move') return
    const piece = game.board[position.y][position.x]
    if (selected && samePosition(selected, position)) { setSelected(null); return }
    if (piece?.side === task.turn) { setSelected(position); return }
    if (selected) {
      onAction({ type: 'submit', submission: { kind: 'move', move: { from: selected, to: position } } })
      setSelected(null)
    }
  }
  return <div className="practice-layout">
    <section className="panel practice-task">
      <p className="eyebrow">第 {index + 1} / {total} 题 · {practiceTopics.find(topic => topic.id === exercise.topicId)!.title}</p>
      <h3>{exercise.title}</h3><p className="course-prompt">{task.prompt}</p>
      <p className="course-turn">本题执棋：{task.turn === 'red' ? '红方' : '黑方'}{task.noCapturePlies !== undefined ? ` · 连续无吃子计数：${task.noCapturePlies} 半回合` : ''}</p>
      <p className="muted">{task.kind === 'move' ? '先选己方棋子，再选落点。再次点选或按 Esc 可取消；可切换己方棋子。' : '观察棋盘与题设，点击一个选项作答。'}</p>
    </section>
    <div className="practice-board"><Board board={game.board} selected={selected} legalTargets={targets} lastMove={lastMove} onCell={cell} onCancel={() => setSelected(null)} checkedSide={isInCheck(game.board, game.turn) ? game.turn : null} /></div>
    <div className="practice-actions learning-actions">
      {task.kind === 'choice' ? <div className="course-choices">{task.options.map(option => <button type="button" key={option.id} disabled={Boolean(item.result)} onClick={() => onAction({ type: 'submit', submission: { kind: 'choice', optionId: option.id } })}>{option.label}</button>)}</div> : null}
      <button type="button" disabled={Boolean(item.result)} onClick={() => { setSelected(null); onAction({ type: 'retry' }) }}>重试本题</button>
      <button type="button" disabled={Boolean(item.result)} onClick={() => { setSelected(null); onAction({ type: 'skip' }) }}>跳过本题</button>
      <button type="button" className="primary-action" disabled={!item.result} onClick={() => onAction({ type: 'next' })}>下一题</button>
      <button type="button" onClick={onDirectory}>返回练习目录</button>
    </div>
    <section className="panel practice-help">
      <h3>想一想，再试试</h3>
      <p className="muted">提示、揭晓与重试会保存在本轮中，成功后归入“提示或重试后完成”，不影响课堂掌握。</p>
      <div className="learning-actions"><button type="button" disabled={Boolean(item.result) || item.hints >= 3} onClick={() => onAction({ type: 'hint' })}>{hintLabels[item.hints] ?? '三层提示已展开'}</button>
        <button type="button" disabled={Boolean(item.result) || item.answerShown} onClick={() => onAction({ type: 'answer' })}>揭晓答案</button>
        <button type="button" onClick={() => onLearn(exercise.unitId)}>查看对应课堂</button></div>
    </section>
    <div className="practice-feedback" aria-live="polite">
      {item.helpUsed ? <p className="course-help-note">本题已使用帮助或重试，完成后归入“提示或重试后完成”。</p> : null}
      {task.hints.slice(0, item.hints).map((hint, hintIndex) => <p className="hint-box" key={hintIndex}>提示 {hintIndex + 1}：{hint}</p>)}
      {answer ? <p className="hint-box">参考答案：{answer}（仅展示解释，请从原局面亲自作答。）</p> : null}
      {feedback ? <div role="status" className={`feedback ${feedback.status === 'success' ? 'success' : 'practice-error'}`}><p>{feedback.status === 'success' ? '完成：' : task.kind === 'choice' ? '选项未答对：' : feedback.status === 'illegal' ? '非法着法：' : '合法，但未达目标：'}{feedback.message}</p></div> : null}
      {item.result ? <p className="practice-result">{resultLabels[item.result]}。点击“下一题”继续。</p> : null}
    </div>
  </div>
}
