// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createSession, play, resign, setView } from '../src/core/session'
import { MoveReview } from '../src/ui/MoveReview'
afterEach(()=>{cleanup();vi.useRealTimers()})
it('pauses without saving, disables restart, allows seek and stays paused after annotation ends',()=>{
 vi.useFakeTimers();let session=createSession();const move=play(session,{from:{x:0,y:6},to:{x:0,y:5}});if(!move.ok)throw Error(move.error);session=setView(resign(move.session,'black'),0)
 const onChange=vi.fn(), page=render(<MoveReview session={session} onChange={onChange}/>);
 fireEvent.click(screen.getByRole('button',{name:'自动回放'}));page.rerender(<MoveReview session={session} onChange={onChange} annotationActive/>);
 act(()=>vi.advanceTimersByTime(1000));expect(onChange).not.toHaveBeenCalled();expect((screen.getByRole('button',{name:'自动回放'}) as HTMLButtonElement).disabled).toBe(true)
 page.rerender(<MoveReview session={session} onChange={onChange}/>);act(()=>vi.advanceTimersByTime(2000));expect(onChange).not.toHaveBeenCalled()
 page.rerender(<MoveReview session={session} onChange={onChange} annotationActive/>);fireEvent.click(screen.getByRole('button',{name:'下一步'}));expect(onChange).toHaveBeenCalledTimes(1)
})
