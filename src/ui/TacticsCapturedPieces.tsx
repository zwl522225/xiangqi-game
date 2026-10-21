import type { TacticView } from '../core/tactics-view'
import { pieceName } from './Board'
import { useBoardDisplay } from './BoardDisplayContext'

export function TacticsScore({ view }: { view: TacticView }) {
  return <div className="tactics-score"><p>本题净吃子记分：{view.captures.score}</p><p className="muted">车 9、马与炮 4、仕士与相象 2、兵卒 1。仅统计题目起点后的吃子，不是引擎估值或胜率。</p></div>
}

export function TacticsCapturedPieces({ view }: { view: TacticView }) {
  const { showCaptured } = useBoardDisplay()
  if (!showCaptured) return null
  return <section className="panel captured-pieces" aria-label="战术失子">
    <div className="panel-title"><h3>战术失子</h3><span>第 {view.notation.length} 着</span></div>
    <p className="muted captured-scope">仅统计本题设置起点至所看位置的真实吃子，起点缺子不计失子。</p>
    <div className="captured-sides">{(['red', 'black'] as const).map(side => {
      // The view groups captures by capturer; the display groups them by victim.
      const pieces = view.captures[side === 'red' ? 'black' : 'red']
      const counts = new Map<string, number>()
      for (const piece of pieces) { const name = pieceName(piece); counts.set(name, (counts.get(name) ?? 0) + 1) }
      const label = `${side === 'red' ? '红' : '黑'}方已失`
      return <div key={side} className={`captured-side captured-side--${side}`} aria-label={label}>
        <h4>{label}</h4>{counts.size ? <ul>{Array.from(counts, ([name, count]) => <li key={name}>{name} × {count}</li>)}</ul> : <p className="muted">暂无失子</p>}
      </div>
    })}</div>
  </section>
}
