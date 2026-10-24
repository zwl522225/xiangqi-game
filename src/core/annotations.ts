import type { Position } from './types'

export type Annotation =
  | { kind: 'circle'; at: Position }
  | { kind: 'arrow'; from: Position; to: Position }

export type AnnotationState = {
  active: boolean
  tool: 'circle' | 'arrow'
  pending: Position | null
  items: Annotation[]
  notice: string
}

export const MAX_ANNOTATIONS = 12

export type AnnotationAction =
  | { type: 'start' }
  | { type: 'end' }
  | { type: 'tool'; tool: AnnotationState['tool'] }
  | { type: 'cell'; position: Position }
  | { type: 'escape' }
  | { type: 'clear' }
  | { type: 'remove'; key: string }

export function emptyAnnotations(): AnnotationState {
  return { active: false, tool: 'circle', pending: null, items: [], notice: '' }
}

export function annotationKey(item: Annotation): string {
  return item.kind === 'circle'
    ? `circle:${item.at.x},${item.at.y}`
    : `arrow:${item.from.x},${item.from.y}>${item.to.x},${item.to.y}`
}

function validPosition(at: Position): boolean {
  return Number.isInteger(at.x) && Number.isInteger(at.y)
    && at.x >= 0 && at.x <= 8 && at.y >= 0 && at.y <= 9
}

function copyPosition(at: Position): Position {
  return { x: at.x, y: at.y }
}

function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y
}

export function transitionAnnotations(state: AnnotationState, action: AnnotationAction): AnnotationState {
  switch (action.type) {
    case 'start':
      return { ...state, active: true, tool: 'circle', pending: null, notice: '' }
    case 'end':
      return { ...state, active: false, pending: null, notice: '' }
    case 'tool':
      return { ...state, tool: action.tool, pending: null, notice: '' }
    case 'cell': {
      if (!state.active || !validPosition(action.position)) return state
      const at = copyPosition(action.position)
      if (state.tool === 'circle') {
        const item: Annotation = { kind: 'circle', at }
        const key = annotationKey(item)
        const index = state.items.findIndex(existing => annotationKey(existing) === key)
        if (index >= 0) return { ...state, items: state.items.filter((_, i) => i !== index), notice: '' }
        if (state.items.length >= MAX_ANNOTATIONS) return { ...state, notice: '标注已达上限，请先移除或清除标注。' }
        return { ...state, items: [...state.items, item], notice: '' }
      }
      if (!state.pending) return { ...state, pending: at, notice: '' }
      if (samePosition(state.pending, at)) return { ...state, pending: null, notice: '' }
      const item: Annotation = { kind: 'arrow', from: copyPosition(state.pending), to: at }
      const key = annotationKey(item)
      const index = state.items.findIndex(existing => annotationKey(existing) === key)
      if (index >= 0) return { ...state, pending: null, items: state.items.filter((_, i) => i !== index), notice: '' }
      if (state.items.length >= MAX_ANNOTATIONS) return { ...state, pending: null, notice: '标注已达上限，请先移除或清除标注。' }
      return { ...state, pending: null, items: [...state.items, item], notice: '' }
    }
    case 'escape':
      return state.pending
        ? { ...state, pending: null, notice: '' }
        : { ...state, active: false, notice: '' }
    case 'clear':
      return { ...state, pending: null, items: [], notice: '' }
    case 'remove': {
      const items = state.items.filter(item => annotationKey(item) !== action.key)
      return items.length === state.items.length ? state : { ...state, items, notice: '' }
    }
  }
}
