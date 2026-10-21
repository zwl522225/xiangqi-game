import { useState } from 'react'
import { tactics } from '../content/tactics'
import type { TacticsData } from '../core/tactics'
import { TacticsErrorReview } from './TacticsReview'

export function TacticsHistory({ data }: { data: TacticsData }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  return <section className="panel tactics-history" aria-label="六题战术记录">
    <h3>六题战术记录</h3><p className="muted">完成标记只描述这些题目的练习经历，不代表掌握整个主题。</p>
    <ul>{data.records.map(record => {
      const tactic = tactics.find(item => item.id === record.id)!
      return <li key={record.id}>
        <strong>{tactic.title}</strong>
        <p>{record.everCompleted ? '曾完成' : '尚未完成'} · {record.everIndependent ? '曾独立完成' : '尚无独立完成记录'}</p>
        <p>{record.review === 'pending' ? '待复习' : record.review === 'reviewed' ? '已复习（保留错误历史）' : '暂无错误记录'} · 累计错误：{record.errors === 999 ? '999+' : record.errors}</p>
        {record.lastError ? <><div className="learning-actions"><button type="button" aria-expanded={expanded === record.id} onClick={() => setExpanded(value => value === record.id ? null : record.id)}>回看最近错误：{tactic.title}</button></div>
          {expanded === record.id ? <TacticsErrorReview key={record.id} tacticId={record.id} error={record.lastError} /> : null}</> : null}
      </li>
    })}</ul>
  </section>
}
