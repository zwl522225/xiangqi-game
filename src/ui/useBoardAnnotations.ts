import { useRef, useState } from 'react'
import { emptyAnnotations, transitionAnnotations } from '../core/annotations'
import type { AnnotationAction, AnnotationState } from '../core/annotations'

type Options = { eligible: boolean; context: unknown; positionIndex: number; resetToken?: unknown; onStart?: () => void }
export type BoardAnnotationController = { state: AnnotationState; active: boolean; dispatch: (action: AnnotationAction) => void }
export function useBoardAnnotations({ eligible, context, positionIndex, resetToken, onStart }: Options): BoardAnnotationController {
  const [binding, setBinding] = useState(() => ({ eligible, context, positionIndex, resetToken, state: emptyAnnotations(), identity: {} }))
  let effective = binding
  if (binding.eligible !== eligible || !Object.is(binding.context, context) || binding.positionIndex !== positionIndex || !Object.is(binding.resetToken, resetToken)) {
    effective = { eligible, context, positionIndex, resetToken, state: emptyAnnotations(), identity: {} }
    setBinding(effective)
  }
  const latest = useRef({ binding: effective, onStart })
  latest.current = { binding: effective, onStart }
  const identity = effective.identity
  function dispatch(action: AnnotationAction) {
    const current = latest.current
    if (current.binding.identity !== identity || !current.binding.eligible) return
    if (action.type === 'start') current.onStart?.()
    setBinding(previous => previous.identity === identity ? { ...previous, state: transitionAnnotations(previous.state, action) } : previous)
  }
  return { state: effective.state, active: effective.state.active && eligible, dispatch }
}
