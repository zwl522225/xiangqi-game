// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { Board } from '../src/ui/Board'
import { AnnotationTools } from '../src/ui/AnnotationTools'
import { useBoardAnnotations } from '../src/ui/useBoardAnnotations'
import { createInitialBoard } from '../src/core/board'
afterEach(cleanup)
const context={}
it('routes pointer and native keyboard activation to annotations with accessible tools and removal', async()=>{
 const original=vi.fn(), user=userEvent.setup()
 function Harness(){const controller=useBoardAnnotations({eligible:true,context,positionIndex:0});return <><Board board={createInitialBoard()} annotations={controller.state.items} annotationPending={controller.state.pending} onCell={p=>controller.active?controller.dispatch({type:'cell',position:p}):original(p)} onCancel={()=>controller.dispatch({type:'escape'})}/><AnnotationTools controller={controller} eligible/></>}
 const page=render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'标注棋盘'}))
 await user.click(screen.getByRole('button',{name:'黑车，坐标 0,0'}));expect(original).not.toHaveBeenCalled()
 expect(page.container.querySelector('[data-annotation-key="circle:0,0"]')?.getAttribute('cx')).toBe('40')
 expect(screen.getByText('重点格 1 个、箭头 0 条')).toBeTruthy()
 await user.keyboard('{ArrowDown}{Enter}');expect(page.container.querySelectorAll('[data-annotation-key]')).toHaveLength(2)
 await user.keyboard(' ');expect(page.container.querySelectorAll('[data-annotation-key]')).toHaveLength(1);expect(original).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'箭头'}));fireEvent.click(screen.getByRole('button',{name:/黑马，坐标 1,0/}))
 expect(page.container.querySelector('[data-annotation-pending]')).toBeTruthy()
 await user.keyboard('{Escape}');expect(page.container.querySelector('[data-annotation-pending]')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'结束标注'}))
 fireEvent.click(screen.getByText('查看标注列表'));expect(screen.getByText(/数字坐标/)).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:/移除此标注.*0,0/}));expect(screen.getByText('重点格 0 个、箭头 0 条')).toBeTruthy()
})
it('projects true coordinates and gives separate boards unique arrow markers',()=>{
 const items=[{kind:'circle' as const,at:{x:0,y:0}},{kind:'arrow' as const,from:{x:1,y:2},to:{x:3,y:4}}]
 const page=render(<><Board board={createInitialBoard()} annotations={items}/><Board board={createInitialBoard()} orientation="black" annotations={items} annotationPending={{x:0,y:0}}/></>)
 const circles=page.container.querySelectorAll('[data-annotation-key="circle:0,0"]');expect(circles[1].getAttribute('cx')).toBe('760');expect(circles[1].getAttribute('cy')).toBe('850')
 const markers=page.container.querySelectorAll('marker');expect(markers).toHaveLength(2);expect(markers[0].id).not.toBe(markers[1].id)
 expect(page.container.querySelector('[data-annotation-pending]')?.getAttribute('stroke-dasharray')).toBeTruthy()
 expect(screen.getAllByRole('button',{name:/重点格/})).toHaveLength(2)
})
it('shows the twelve-shape limit and supports clearing pending and completed shapes after ending',()=>{
 function Harness(){const controller=useBoardAnnotations({eligible:true,context,positionIndex:0});return <><Board board={createInitialBoard()} annotations={controller.state.items} annotationPending={controller.state.pending} onCell={position=>controller.dispatch({type:'cell',position})}/><AnnotationTools controller={controller} eligible/></>}
 const page=render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'标注棋盘'}))
 const cells=screen.getAllByRole('button').filter(button=>button.classList.contains('board-point'))
 for(const cell of cells.slice(0,13))fireEvent.click(cell)
 expect(page.container.querySelectorAll('[data-annotation-key]')).toHaveLength(12)
 expect(screen.getByRole('status').textContent).toContain('标注已达上限')
 fireEvent.click(screen.getByRole('button',{name:'箭头'}));fireEvent.click(cells[20]);expect(page.container.querySelector('[data-annotation-pending]')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'清除标注'}));expect(page.container.querySelector('[data-annotation-pending]')).toBeNull();expect(page.container.querySelectorAll('[data-annotation-key]')).toHaveLength(0)
 fireEvent.click(screen.getByRole('button',{name:'重点格'}));fireEvent.click(cells[0]);fireEvent.click(screen.getByRole('button',{name:'结束标注'}));expect(page.container.querySelectorAll('[data-annotation-key]')).toHaveLength(1)
 fireEvent.click(screen.getByRole('button',{name:'清除标注'}));expect((screen.getByRole('button',{name:'清除标注'}) as HTMLButtonElement).disabled).toBe(true)
})
