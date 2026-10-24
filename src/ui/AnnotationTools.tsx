import { annotationKey } from '../core/annotations'
import type { Annotation } from '../core/annotations'
import type { BoardAnnotationController } from './useBoardAnnotations'
export const describeAnnotation = (item: Annotation) => item.kind === 'circle' ? `重点格 (${item.at.x},${item.at.y})` : `箭头 (${item.from.x},${item.from.y}) → (${item.to.x},${item.to.y})`
export function AnnotationTools({ controller, eligible, unavailableMessage = '回看历史局面后可标注' }: { controller: BoardAnnotationController; eligible: boolean; unavailableMessage?: string }) {
  const {state,active,dispatch}=controller
  const circles=state.items.filter(item=>item.kind==='circle').length
  const summary=`重点格 ${circles} 个、箭头 ${state.items.length-circles} 条`
  return <section className="annotation-tools" aria-label="棋盘标注">
    <div className="annotation-controls">
      {active ? <><button type="button" aria-pressed={state.tool==='circle'} onClick={()=>dispatch({type:'tool',tool:'circle'})}>重点格</button><button type="button" aria-pressed={state.tool==='arrow'} onClick={()=>dispatch({type:'tool',tool:'arrow'})}>箭头</button><button type="button" onClick={()=>dispatch({type:'end'})}>结束标注</button></> : <button type="button" disabled={!eligible} onClick={()=>dispatch({type:'start'})}>标注棋盘</button>}
      <button type="button" disabled={!state.items.length&&!state.pending} onClick={()=>dispatch({type:'clear'})}>清除标注</button>
    </div>
    {!eligible ? <p>{unavailableMessage}</p> : null}
    <p role="status" aria-live="polite"><span>{summary}</span>{state.pending ? `；已选起点 (${state.pending.x},${state.pending.y})，请选择终点，Escape 取消起点。` : active ? `；${state.tool==='circle'?'点选交叉点切换重点格。':'请选择箭头起点。'}` : '；标注模式已关闭。'}{state.notice}</p>
    <p className="muted">标注是个人观察，仅留在当前页面，切换局面后清除；不代表合法走法或最佳着法。</p>
    <details><summary>查看标注列表</summary><p>数字坐标采用棋盘 (x,y) 体系，与棋谱中的一至九路不同。</p><ul>{state.items.map(item=><li key={annotationKey(item)}><span>{describeAnnotation(item)}</span><button type="button" aria-label={`移除此标注：${describeAnnotation(item)}`} onClick={()=>dispatch({type:'remove',key:annotationKey(item)})}>移除此标注</button></li>)}</ul></details>
  </section>
}
