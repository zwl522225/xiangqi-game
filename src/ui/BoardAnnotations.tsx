import { useId } from 'react'
import type { Position, Side } from '../core/types'
import { annotationKey } from '../core/annotations'
import type { Annotation } from '../core/annotations'
export function BoardAnnotations({ items, pending, orientation }: { items: Annotation[]; pending: Position | null; orientation: Side }) {
  const marker = `annotation-arrow-${useId().replace(/:/g, '')}`
  const project = (p: Position) => ({ x: 40 + (orientation === 'black' ? 8 - p.x : p.x) * 90, y: 40 + (orientation === 'black' ? 9 - p.y : p.y) * 90 })
  return <svg className="board-annotations" viewBox="0 0 800 900" preserveAspectRatio="none" aria-hidden="true" pointerEvents="none">
    <defs><marker id={marker} viewBox="0 0 12 12" refX="10" refY="6" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 12 6 L 0 12 Z" fill="currentColor" /></marker></defs>
    {items.map(item => {
      const key = annotationKey(item)
      if (item.kind === 'circle') { const p=project(item.at);return <circle key={key} data-annotation-key={key} cx={p.x} cy={p.y} r="39" fill="none" stroke="currentColor" strokeWidth="6" /> }
      const from=project(item.from), to=project(item.to), distance=Math.hypot(to.x-from.x,to.y-from.y), inset=24
      return <line key={key} data-annotation-key={key} x1={from.x+(to.x-from.x)*inset/distance} y1={from.y+(to.y-from.y)*inset/distance} x2={to.x-(to.x-from.x)*inset/distance} y2={to.y-(to.y-from.y)*inset/distance} stroke="currentColor" strokeWidth="12" opacity="0.65" markerEnd={`url(#${marker})`} />
    })}
    {pending ? <circle data-annotation-pending="true" cx={project(pending).x} cy={project(pending).y} r="34" fill="none" stroke="currentColor" strokeWidth="7" strokeDasharray="9 6" /> : null}
  </svg>
}
