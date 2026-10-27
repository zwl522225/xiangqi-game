import type { Ref } from 'react'
import type { LearningOverview as Overview, OverviewDestination, OverviewSingleRound, OverviewTacticsRound } from '../core/learning-overview'

export type OverviewPersistence = {
  progress: 'pending' | 'saved' | 'failed'
  opening: { persistenceStatus: 'saved' | 'failed' | 'blocked'; notice: string }
  tactics: { persistenceStatus: 'saved' | 'failed' | 'blocked'; notice: string }
  endgame: { persistenceStatus: 'saved' | 'failed' | 'blocked'; notice: string }
}
const labels = { endgame: '前往残局分步教学', single: '前往单步练习', tactics: '前往多步战术', opening: '前往开局跟练', match: '返回当前对局' }
function progressStatus(status: OverviewPersistence['progress']) {
  return status === 'failed' ? '包含当前页面未保存记录，刷新可能丢失。' : status === 'pending' ? '正在保存当前页面记录…' : '当前页面记录已保存到本机。'
}
function ModuleStatus({ persistenceStatus, notice }: OverviewPersistence['opening']) {
  return <p className="overview-storage">{notice || (persistenceStatus === 'blocked' ? '原存档受保护，请前往本模块处理。' : persistenceStatus === 'failed' ? '存储操作失败，请前往本模块查看说明。' : '本项记录保存在当前浏览器。')}</p>
}
function Round({ round }: { round: OverviewSingleRound | OverviewTacticsRound }) {
  return <div className="overview-round">
    <p>本轮已结束 {round.completed} / {round.total} 题</p>
    <p>独立 {round.independent} · 辅助 {round.assisted} · {'revealed' in round ? <>已看答案 {round.revealed} · </> : null}跳过 {round.skipped}</p>
    <p>{round.finished ? '本轮已结束，可到原页查看小结。' : round.waitingNext ? '本题已结束，尚未进入下一题/小结。' : `当前题：${round.currentTitle}`}</p>
    {'temporary' in round && round.temporary ? <p>临时练习，原记录受保护</p> : null}
  </div>
}

export function LearningOverview({ overview, persistence, onNavigate, headingRef, onBackup }: {
  onBackup?: () => void
  overview: Overview; persistence: OverviewPersistence; onNavigate: (destination: OverviewDestination) => void; headingRef?: Ref<HTMLHeadingElement>
}) {
  const { course, notation, single, opening, tactics, endgame, puzzles, milestones, suggestion, pendingRounds } = overview
  const go = (destination: OverviewDestination, lessonLabel?: string) => <button type="button" onClick={() => onNavigate(destination)}>{destination.kind === 'lesson' ? lessonLabel : labels[destination.kind]}</button>
  return <section className="learning-overview" aria-label="学习总览">
    <header className="library-header"><p className="eyebrow">按现有记录，安排下一步</p><h2 ref={headingRef} tabIndex={-1}>学习总览</h2><p>课堂掌握、曾完成、本轮表现和待复习各自记录。进入训练目录后，请主动选择继续、错题或开始。</p>{onBackup ? <div className="learning-actions"><button type="button" onClick={onBackup}>备份与恢复</button></div> : null}</header>
    <section className="panel overview-next" aria-label="接下来可以做">
      <h3>接下来可以做</h3><h4>{suggestion.title}</h4><p>{suggestion.reason}</p>
      <div className="learning-actions">{go(suggestion.destination, suggestion.title)}</div>
      {pendingRounds.length ? <><h4>可继续的训练轮</h4><ul className="overview-pending">{pendingRounds.map(round => <li key={round.destination.kind}><strong>{round.title}</strong><p>{round.reason}</p><p>{(round.destination.kind === 'opening' || round.destination.kind === 'endgame') ? '已走' : '已结束'} {round.completed} / {round.total} {(round.destination.kind === 'opening' || round.destination.kind === 'endgame') ? '着' : '题'}{round.temporary ? ' · 临时练习，原记录受保护' : ''}</p><div className="learning-actions">{go(round.destination)}</div></li>)}</ul></> : null}
    </section>
    <section className="panel overview-course" aria-label="课堂进度">
      <h3>课堂进度</h3><p>已掌握 {course.mastered} / {course.total} · 已练未掌握 {course.practiced} / {course.total} · 暂无知识点记录 {course.unrecorded} / {course.total}</p>
      <p>旧版章节记录 {course.legacyCompleted} / {course.chapters.length}，与知识点记录分别展示。</p><p className="overview-storage">{progressStatus(persistence.progress)}</p>
      <div className="overview-chapters">{course.chapters.map(chapter => <article className="overview-chapter" key={chapter.id}><h4>{chapter.title}</h4><p>已掌握 {chapter.mastered} / {chapter.total} · 已练未掌握 {chapter.practiced} · 暂无记录 {chapter.unrecorded}</p>{chapter.legacyCompleted ? <p>旧版章节记录：已完成</p> : null}<div className="learning-actions">{go(chapter.destination, `${chapter.mastered === chapter.total ? '复习本章' : '学习本章'}：${chapter.title}`)}</div></article>)}</div>
    </section>
    <div className="overview-modules">
      <section className="panel" aria-label="棋谱识读专项"><h3>棋谱识读专项</h3><p>已掌握 {notation.mastered} / {notation.total} · 已练未掌握 {notation.practiced} / {notation.total} · 暂无记录 {notation.unrecorded} / {notation.total}</p><p className="overview-storage">{progressStatus(persistence.progress)}</p><ul>{notation.units.map(unit => <li key={unit.id}><strong>{unit.title}</strong><p>{unit.status === 'mastered' ? '已掌握' : unit.status === 'practiced' ? '已练未掌握' : '暂无记录'}</p><div className="learning-actions">{go({ kind: 'lesson', unitId: unit.id }, `${unit.status === 'mastered' ? '复习' : '学习'}：${unit.title}`)}</div></li>)}</ul></section>
      <section className="panel" aria-label="单步练习记录"><h3>单步练习</h3><p>有作答记录 {single.attempted} / {single.total} · 待复习错题 {single.pendingReview}</p><p>作答记录包含错误提交。</p>{single.round ? <Round round={single.round} /> : <p>暂无当前轮次。</p>}<p className="overview-storage">{progressStatus(persistence.progress)}</p><div className="learning-actions">{go({ kind: 'single' })}</div></section>
      <section className="panel" aria-label="多步战术记录"><h3>多步战术</h3>{tactics.history ? <><p>曾完成 {tactics.history.completed} / {tactics.total}</p><p>曾无提示且无错误完成 {tactics.history.independent} / {tactics.total} · 待复习 {tactics.history.pendingReview}</p></> : <p>记录暂不可恢复</p>}{tactics.round ? <Round round={tactics.round} /> : <p>暂无当前轮次。</p>}<ModuleStatus {...persistence.tactics} /><div className="learning-actions">{go({ kind: 'tactics' })}</div></section>
      <section className="panel" aria-label="开局跟练记录"><h3>开局跟练</h3>{opening.history ? <><p>曾完成 {opening.history.completed} / {opening.total}</p><p>曾无提示且无错误完成 {opening.history.unassisted} / {opening.total}</p></> : <p>记录暂不可恢复</p>}<p>四条路线，执红执黑分别记录，共八组。</p>{opening.round ? <div className="overview-round"><p>{opening.round.title} · 执{opening.round.side === 'red' ? '红' : '黑'} · 已走 {opening.round.ply} / {opening.round.total} 着</p>{opening.round.finished ? <p>本组已结束，可到原页查看小结。</p> : null}{opening.round.temporary ? <p>临时练习，原记录受保护</p> : null}</div> : <p>暂无当前路线。</p>}<ModuleStatus {...persistence.opening} /><div className="learning-actions">{go({ kind: 'opening' })}</div></section>
      <section className="panel" aria-label="残局分步教学记录"><h3>残局分步教学</h3>{endgame.history ? <><p>曾完成 {endgame.history.completed} / {endgame.total}</p><p>曾本轮无提示且无错误完成 {endgame.history.independent} / {endgame.total}</p></> : <p>记录暂不可恢复</p>}<p>本轮无辅助记录不代表此前未见题目，也不代表残局掌握认证。</p>{endgame.round ? <div className="overview-round"><p>{endgame.round.title} · 执{endgame.round.side === 'red' ? '红' : '黑'} · 已走 {endgame.round.ply} / {endgame.round.total} 着</p>{endgame.round.finished ? <p>本轮已结束，可到原页查看小结。</p> : null}{endgame.round.temporary ? <p>临时练习，原记录受保护</p> : null}</div> : <p>暂无当前残局练习。</p>}{persistence.endgame ? <ModuleStatus {...persistence.endgame} /> : null}<div className="learning-actions">{go({ kind: 'endgame' })}</div></section>
      <section className="panel" aria-label="旧残局记录"><h3>旧残局</h3><p>已记录完成 {puzzles.solved} / {puzzles.total}（含提示后完成）</p><p className="overview-storage">{progressStatus(persistence.progress)}</p></section>
    </div>
    <section className="panel" aria-label="第一盘实战"><h3>第一盘实战</h3><p>首盘完整对局：{milestones.firstMatch ? '已有记录' : '尚无记录'}</p><p>独立首盘：{milestones.independentMatch ? '已有记录' : '尚无记录'}</p><p>显示已有里程碑。可以回到对弈页开始或继续完整对局。</p><p className="overview-storage">{progressStatus(persistence.progress)}</p><div className="learning-actions">{go({ kind: 'match' })}</div></section>
  </section>
}
