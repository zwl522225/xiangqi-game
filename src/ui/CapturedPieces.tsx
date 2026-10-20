import { useMemo } from 'react'
import { buildCaptureTimeline } from '../core/captures'
import type { Session } from '../core/session'
import type { PieceType, Side } from '../core/types'
import { pieceName } from './Board'
import { useBoardDisplay } from './BoardDisplayContext'

const pieceTypes: PieceType[] = ['general', 'advisor', 'elephant', 'horse', 'rook', 'cannon', 'soldier']
const sides: Side[] = ['red', 'black']

export function CapturedPieces({ session, scope = 'game' }: { session: Session; scope?: 'game' | 'study' | 'training' }) {
  const { showCaptured } = useBoardDisplay()
  const timeline = useMemo(() => buildCaptureTimeline(session), [session.records, session.snapshots])
  if (!showCaptured) return null
  const frame = timeline[session.viewIndex]
  const title = scope === 'training' ? '跟练失子' : scope === 'study' ? '试走失子' : '本局失子'
  return <section className="panel captured-pieces" aria-label={title}>
    <div className="panel-title"><h3>{title}</h3><span>{session.viewIndex === 0 ? scope === 'study' ? '试走起点' : '开局' : `第 ${session.viewIndex} 着`}</span></div>
    <p className="muted captured-scope">{scope === 'training' ? '仅统计本轮跟练从标准起点至当前着的吃子' : scope === 'study' ? '仅统计本次试走中的吃子' : '仅统计本局棋谱中的吃子'}</p>
    {frame?.ok ? <div className="captured-sides">{sides.map(side => {
      const lost = pieceTypes.filter(type => frame.lost[side][type] > 0)
      const label = `${side === 'red' ? '红方' : '黑方'}已失`
      return <div key={side} className={`captured-side captured-side--${side}`} aria-label={label}>
        <h4>{label}</h4>
        {lost.length ? <ul>{lost.map(type => <li key={type}>{pieceName({ side, type })} × {frame.lost[side][type]}</li>)}</ul> : <p className="muted">暂无失子</p>}
      </div>
    })}</div> : <p className="captured-error">本段吃子记录暂无法核对</p>}
  </section>
}
