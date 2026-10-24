// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useBoardAnnotations } from '../src/ui/useBoardAnnotations'
afterEach(cleanup)
it('scopes state synchronously and rejects old dispatch callbacks across every binding change', () => {
 const context = {}, onStart = vi.fn()
 const hook = renderHook(props => useBoardAnnotations(props), { initialProps: { eligible: true, context, positionIndex: 0, resetToken: 0, onStart } })
 const old = hook.result.current.dispatch
 act(() => { old({type:'start'}); old({type:'cell',position:{x:0,y:0}}) })
 expect(onStart).toHaveBeenCalledTimes(1)
 expect(hook.result.current.state.items).toHaveLength(1)
 hook.rerender({eligible:true,context,positionIndex:0,resetToken:0,onStart})
 expect(hook.result.current.active).toBe(true)
 for (const change of [{positionIndex:1}, {resetToken:1}, {context:{}}, {eligible:false}]) {
  const previous = hook.result.current.dispatch
  hook.rerender({eligible:true,context,positionIndex:0,resetToken:0,onStart,...change})
  expect(hook.result.current.state.items).toHaveLength(0)
  expect(hook.result.current.active).toBe(false)
  act(() => {previous({type:'start'}); old({type:'start'})})
  expect(hook.result.current.active).toBe(false)
 }
 act(() => hook.result.current.dispatch({type:'start'}))
 expect(hook.result.current.active).toBe(false)
})
it('uses latest start callback and preserves completed items on end while restarting circle tool', () => {
 const context={}, first=vi.fn(), latest=vi.fn()
 const hook=renderHook(({onStart})=>useBoardAnnotations({eligible:true,context,positionIndex:0,onStart}),{initialProps:{onStart:first}})
 const dispatch=hook.result.current.dispatch
 hook.rerender({onStart:latest})
 act(()=>{dispatch({type:'start'});dispatch({type:'cell',position:{x:1,y:2}});dispatch({type:'tool',tool:'arrow'});dispatch({type:'end'});dispatch({type:'start'})})
 expect(first).not.toHaveBeenCalled();expect(latest).toHaveBeenCalledTimes(2)
 expect(hook.result.current.state.tool).toBe('circle');expect(hook.result.current.state.items).toHaveLength(1)
})
