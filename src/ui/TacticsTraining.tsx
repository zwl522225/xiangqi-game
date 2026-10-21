import { useEffect, useRef, useState } from 'react'
import { tactics } from '../content/tactics'
import { currentTactic, tacticsSummary, type TacticsRequest } from '../core/tactics'
import type { TacticTopic } from '../core/tactics-goals'
import type { useTacticsTraining } from './useTacticsTraining'
import { TacticsHistory } from './TacticsHistory'
import { TacticsQuestion } from './TacticsQuestion'
import { TacticsReview, tacticsResultText } from './TacticsReview'

export type TacticsTrainingController = ReturnType<typeof useTacticsTraining>
const topics: { id: TacticTopic; title: string; text: string }[] = [
  { id: 'checks', title: '连续将军', text: '每次己方落子都真实将军，在三步内形成将死。' },
  { id: 'gain', title: '吃子获利', text: '走两步，并计入对方最后一次合法应手后的净吃子。' },
  { id: 'counter', title: '解将反击', text: '先解将，第二步反将，再检查对方应手后是否不亏子。' },
]

export function TacticsTraining({ controller }: { controller: TacticsTrainingController }) {
  const { data, dispatch, message, notice, persistenceStatus, canRetrySave, retrySave, reset } = controller
  const [screen, setScreen] = useState<'directory' | 'question' | 'summary'>('directory')
  const [summaryIndex, setSummaryIndex] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const summaryHeading = useRef<HTMLHeadingElement>(null)
  const current = currentTactic(data), summary = tacticsSummary(data)
  const round = data.round
  const showingSummary = screen === 'summary' || (screen === 'question' && summary.finished)
  useEffect(() => { (showingSummary ? summaryHeading : heading).current?.focus() }, [screen, showingSummary])
  function start(request: TacticsRequest) {
    if (round && !summary.finished && !window.confirm('当前多步战术轮次尚未完成。开始新轮将替换本轮进度，六题历史记录保留。确定继续吗？')) return
    dispatch({ type: 'start', request }); setSummaryIndex(0); setScreen('question')
  }
  function resetRecords() {
    if (!window.confirm('仅清空多步战术六题的记录和本轮进度，确定重置战术记录吗？')) return
    if (reset()) { setScreen('directory'); setSummaryIndex(0); heading.current?.focus() }
  }
  return <section className="tactics-training" aria-label="多步战术">
    <div className="library-header"><p className="eyebrow">六道原创教学局面 · 每题己方两至三步</p><h2 ref={heading} tabIndex={-1}>多步战术</h2>
      <p>先观察对方应手，再完成短战术。目标只覆盖本题限定步数，不推断以后的胜负。</p>
    </div>
    {screen === 'directory' ? <>
      <section className="panel" aria-label="战术目录"><h3>选择本轮战术</h3>
        <div className="learning-actions"><button type="button" className="primary-action" onClick={() => start({ mode: 'recommended' })}>推荐战术练习</button><button type="button" onClick={() => start({ mode: 'mistakes' })}>战术错题再练</button></div>
        <p>推荐和错题每轮最多三题；待复习错误优先。按主题每轮两题，执红执黑各一题。</p>
        {round ? <div className="learning-actions">
          {!summary.finished ? <button type="button" onClick={() => setScreen('question')}>继续上轮战术</button> : <button type="button" onClick={() => { setSummaryIndex(0); setScreen('summary') }}>查看上轮战术小结</button>}
        </div> : null}
      </section>
      <div className="practice-topics">{topics.map(topic => <article className="panel" key={topic.id}><h3>{topic.title}</h3><p>{topic.text}</p><div className="learning-actions"><button type="button" onClick={() => start({ mode: 'topic', topic: topic.id })}>按主题练：{topic.title}</button></div></article>)}</div>
      <TacticsHistory data={data} />
    </> : <>
      <div className="learning-actions tactics-back"><button type="button" onClick={() => setScreen('directory')}>返回战术目录</button></div>
      {showingSummary ? <section className="panel tactics-summary" aria-label="本轮战术小结">
        <h3 ref={summaryHeading} tabIndex={-1}>本轮战术小结</h3>
        {!summary.total ? <p>暂无待复习错题。</p> : <>
          <p>共 {summary.total} 题 · 独立完成 {summary.counts.independent} · 辅助完成 {summary.counts.assisted} · 已看答案 {summary.counts.revealed} · 跳过 {summary.counts.skipped}</p>
          <p>「独立完成」指本轮首次无提示且无错误完成，不代表掌握整个主题。</p>
          <div className="learning-actions" aria-label="选择回看题目">{summary.items.map((item, index) => <button type="button" key={item.id} aria-pressed={index === summaryIndex} onClick={() => setSummaryIndex(index)}>回看第 {index + 1} 题：{tactics.find(tactic => tactic.id === item.id)!.title}</button>)}</div>
          <h4>{tactics.find(tactic => tactic.id === summary.items[summaryIndex].id)!.title} · {tacticsResultText[summary.items[summaryIndex].result!]}</h4>
          <TacticsReview key={`${summaryIndex}-${summary.items[summaryIndex].id}`} item={summary.items[summaryIndex]} />
        </>}
      </section> : current && round ? <TacticsQuestion key={`${round.index}-${current.item.id}`} current={current} index={round.index} total={round.items.length} dispatch={dispatch} /> : null}
    </>}
    <p className="feedback" role="status" aria-live="polite" aria-label="战术反馈">{message || '选择棋子不会揭示正确答案。'}</p>
    <section className="panel tactics-storage" aria-label="战术存储">
      <p role="status" aria-live="polite" aria-label="战术保存状态">{notice || (persistenceStatus === 'saved' ? '多步战术记录已保存到当前浏览器。' : persistenceStatus === 'blocked' ? '存档受保护，可临时练习；请显式重置后保存。' : '存储操作失败，请重试。')}</p>
      <div className="learning-actions">{canRetrySave ? <button type="button" onClick={() => retrySave()}>重试保存</button> : null}<button type="button" onClick={resetRecords}>重置战术记录</button></div>
    </section>
  </section>
}
