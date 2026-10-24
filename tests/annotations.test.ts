import { describe, expect, it } from 'vitest'
import { annotationKey, emptyAnnotations, MAX_ANNOTATIONS, transitionAnnotations } from '../src/core/annotations'
import type { Annotation, AnnotationState } from '../src/core/annotations'
import type { Position } from '../src/core/types'

const p = (x: number, y: number): Position => ({ x, y })
const act = (state: AnnotationState, action: Parameters<typeof transitionAnnotations>[1]) => transitionAnnotations(state, action)
const addCircle = (state: AnnotationState, position: Position) => act(act(state, { type: 'start' }), { type: 'cell', position })
const addArrow = (state: AnnotationState, from: Position, to: Position) => {
  let next = act(act(state, { type: 'start' }), { type: 'tool', tool: 'arrow' })
  next = act(next, { type: 'cell', position: from })
  return act(next, { type: 'cell', position: to })
}

describe('temporary review annotations', () => {
  it('starts closed with circle tool and no shapes', () => {
    expect(emptyAnnotations()).toEqual({ active: false, tool: 'circle', pending: null, items: [], notice: '' })
    expect(MAX_ANNOTATIONS).toBe(12)
  })

  it('accepts board boundary coordinates and rejects invalid positions without changing state', () => {
    let state = act(emptyAnnotations(), { type: 'start' })
    state = act(state, { type: 'cell', position: p(0, 0) })
    state = act(state, { type: 'cell', position: p(8, 9) })
    expect(state.items).toEqual([{ kind: 'circle', at: p(0, 0) }, { kind: 'circle', at: p(8, 9) }])
    for (const at of [p(-1, 0), p(9, 0), p(0, -1), p(0, 10), p(1.5, 2), p(Number.NaN, 2)]) {
      const before = state
      state = act(state, { type: 'cell', position: at })
      expect(state).toBe(before)
    }
  })

  it('ignores cells while inactive and keeps completed shapes across start and end', () => {
    const initial = emptyAnnotations()
    expect(act(initial, { type: 'cell', position: p(3, 4) })).toBe(initial)
    const marked = addCircle(initial, p(3, 4))
    const ended = act(marked, { type: 'end' })
    expect(ended.items).toEqual(marked.items)
    expect(ended.active).toBe(false)
    expect(act(ended, { type: 'start' }).items).toEqual(marked.items)
  })

  it('starting again resets the tool and pending point while retaining shapes', () => {
    let state = addCircle(emptyAnnotations(), p(3, 4))
    state = act(state, { type: 'tool', tool: 'arrow' })
    state = act(state, { type: 'cell', position: p(5, 5) })
    state = act(state, { type: 'start' })
    expect(state).toMatchObject({ active: true, tool: 'circle', pending: null })
    expect(state.items).toEqual([{ kind: 'circle', at: p(3, 4) }])
  })

  it('toggles identical circles and treats arrows as ordered pairs', () => {
    let state = addCircle(emptyAnnotations(), p(2, 5))
    state = act(state, { type: 'cell', position: p(2, 5) })
    expect(state.items).toEqual([])
    state = addArrow(state, p(1, 2), p(4, 6))
    state = addArrow(state, p(1, 2), p(4, 6))
    expect(state.items).toEqual([])
    state = addArrow(state, p(1, 2), p(4, 6))
    state = addArrow(state, p(4, 6), p(1, 2))
    expect(state.items).toHaveLength(2)
    expect(state.items.map(annotationKey)).not.toEqual([annotationKey(state.items[1]), annotationKey(state.items[1])])
  })

  it('cancels an arrow when its second point is the same as its pending start', () => {
    let state = act(emptyAnnotations(), { type: 'start' })
    state = act(state, { type: 'tool', tool: 'arrow' })
    state = act(state, { type: 'cell', position: p(4, 4) })
    state = act(state, { type: 'cell', position: p(4, 4) })
    expect(state.pending).toBeNull()
    expect(state.items).toEqual([])
  })

  it('clears pending on tool change and Escape, then ends on Escape without pending', () => {
    let state = act(emptyAnnotations(), { type: 'start' })
    state = act(state, { type: 'tool', tool: 'arrow' })
    state = act(state, { type: 'cell', position: p(2, 3) })
    state = act(state, { type: 'tool', tool: 'circle' })
    expect(state.pending).toBeNull()
    expect(state.active).toBe(true)
    state = act(state, { type: 'tool', tool: 'arrow' })
    state = act(state, { type: 'cell', position: p(2, 3) })
    state = act(state, { type: 'escape' })
    expect(state.pending).toBeNull()
    expect(state.active).toBe(true)
    expect(state.tool).toBe('arrow')
    state = act(state, { type: 'escape' })
    expect(state.active).toBe(false)
  })

  it('enforces the combined cap while allowing removal at capacity', () => {
    let state = act(emptyAnnotations(), { type: 'start' })
    for (let x = 0; x < MAX_ANNOTATIONS; x += 1) state = act(state, { type: 'cell', position: p(x % 9, Math.floor(x / 9)) })
    const full = state
    state = act(state, { type: 'cell', position: p(8, 8) })
    expect(state.items).toHaveLength(12)
    expect(state.notice).toMatch(/移除|清除/)
    const key = annotationKey(state.items[0])
    state = act(state, { type: 'remove', key })
    expect(state.items).toHaveLength(11)
    state = act(state, { type: 'cell', position: p(8, 8) })
    expect(state.items).toHaveLength(12)
    expect(full.items).toHaveLength(12)
  })

  it('toggles a duplicate circle off even when the set is full', () => {
    let state = act(emptyAnnotations(), { type: 'start' })
    for (let i = 0; i < MAX_ANNOTATIONS; i += 1) state = act(state, { type: 'cell', position: p(i % 9, Math.floor(i / 9)) })
    state = act(state, { type: 'cell', position: p(0, 0) })
    expect(state.items).toHaveLength(11)
    expect(state.items.some(item => annotationKey(item) === 'circle:0,0')).toBe(false)
  })

  it('counts circles and arrows together and toggles a duplicate arrow off at capacity', () => {
    let state = act(emptyAnnotations(), { type: 'start' })
    for (let i = 0; i < 11; i += 1) state = act(state, { type: 'cell', position: p(i % 9, Math.floor(i / 9)) })
    state = act(state, { type: 'tool', tool: 'arrow' })
    state = act(state, { type: 'cell', position: p(0, 2) })
    state = act(state, { type: 'cell', position: p(1, 2) })
    expect(state.items).toHaveLength(12)
    state = act(state, { type: 'cell', position: p(0, 2) })
    state = act(state, { type: 'cell', position: p(1, 2) })
    expect(state.items).toHaveLength(11)
    expect(state.items.some(item => item.kind === 'arrow')).toBe(false)
  })

  it('rejects a completed arrow at capacity and clears its pending point', () => {
    let state = act(emptyAnnotations(), { type: 'start' })
    for (let i = 0; i < 12; i += 1) state = act(state, { type: 'cell', position: p(i % 9, Math.floor(i / 9)) })
    state = act(state, { type: 'tool', tool: 'arrow' })
    state = act(state, { type: 'cell', position: p(3, 4) })
    state = act(state, { type: 'cell', position: p(4, 4) })
    expect(state.items).toHaveLength(12)
    expect(state.pending).toBeNull()
    expect(state.notice).toMatch(/移除|清除/)
  })

  it('clears items and pending but preserves mode and tool; removes by stable key', () => {
    const circle: Annotation = { kind: 'circle', at: p(7, 8) }
    let state = addCircle(emptyAnnotations(), circle.at)
    const key = annotationKey(circle)
    state = act(state, { type: 'remove', key })
    expect(state.items).toEqual([])
    state = act(state, { type: 'tool', tool: 'arrow' })
    state = act(state, { type: 'cell', position: p(1, 1) })
    state = act(state, { type: 'clear' })
    expect(state).toMatchObject({ active: true, tool: 'arrow', pending: null, items: [] })
  })

  it('does not alias or mutate caller coordinates or prior states', () => {
    const input = p(5, 6)
    const initial = act(emptyAnnotations(), { type: 'start' })
    const next = act(initial, { type: 'cell', position: input })
    input.x = 0
    expect(next.items[0]).toEqual({ kind: 'circle', at: p(5, 6) })
    expect(initial.items).toEqual([])
  })

  it('copies both coordinates supplied for an arrow', () => {
    const from = p(2, 7)
    const to = p(6, 3)
    let state = act(emptyAnnotations(), { type: 'start' })
    state = act(state, { type: 'tool', tool: 'arrow' })
    state = act(state, { type: 'cell', position: from })
    state = act(state, { type: 'cell', position: to })
    from.x = 8
    to.y = 9
    expect(state.items).toEqual([{ kind: 'arrow', from: p(2, 7), to: p(6, 3) }])
  })
})
