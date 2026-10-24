// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import { StudyWorkspace } from '../src/ui/StudyWorkspace'
import { createSession, play, setView, resign } from '../src/core/session'
import { createStudy } from '../src/core/study'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'
import { archiveSession } from '../src/core/archive-codec'
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }))
const cell = (x: number, y: number) => within(screen.getByLabelText('象棋棋盘')).getByLabelText(new RegExp(`^(?:[^，]+，坐标 |交叉点 )${x},${y}(?:，|$)`))
function history() {
  let session = createSession()
  for (const move of [{ from: {x:0,y:6}, to:{x:0,y:5}}, {from:{x:0,y:3},to:{x:0,y:4}}]) {
    const result = play(session, move); if (!result.ok) throw new Error(result.error); session = result.session
  }
  return session
}
afterEach(() => {cleanup(); localStorage.clear(); vi.restoreAllMocks()})
it('formal match gates current positions, keeps annotations across notes and flip, clears on seek without saving marks', () => {
  saveProgress(localStorage, {...defaultProgress(), session: history()})
  render(<App />)
  expect(screen.getByRole('button',{name:'标注棋盘'}).hasAttribute('disabled')).toBe(true)
  fireEvent.change(screen.getByLabelText('回看进度'),{target:{value:'1'}})
  const write = vi.spyOn(Storage.prototype,'setItem')
  click('标注棋盘'); fireEvent.click(cell(0,6))
  expect(screen.getByText('重点格 1 个、箭头 0 条')).toBeTruthy()
  expect(write).not.toHaveBeenCalled()
  click('结束标注'); click('翻转棋盘')
  expect(screen.getByText('重点格 1 个、箭头 0 条')).toBeTruthy()
  write.mockClear()
  fireEvent.change(screen.getByLabelText('本着笔记'),{target:{value:'观察'}}); click('保存笔记')
  expect(loadProgress(localStorage).session.notes['1']).toBe('观察')
  expect(write).toHaveBeenCalledOnce()
  expect(screen.getByText('重点格 1 个、箭头 0 条')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('回看进度'),{target:{value:'2'}})
  expect(screen.getByText('重点格 0 个、箭头 0 条')).toBeTruthy()
  expect(screen.getByRole('button',{name:'标注棋盘'}).hasAttribute('disabled')).toBe(true)
})
it('ended zero-move match and collection preview allow annotations and reopening clears them', () => {
  const session = resign(createSession(),'red')
  const archive = archiveSession(history(),'观察棋局'); if(!archive.ok) throw new Error(archive.error)
  saveProgress(localStorage,{...defaultProgress(),session,collection:{version:1,items:[{id:'one',savedAt:1700000000000,archive:archive.value}]}})
  render(<App />); click('标注棋盘'); fireEvent.click(cell(1,1))
  expect(screen.getByText('重点格 1 个、箭头 0 条')).toBeTruthy()
  click('棋局收藏'); click('查看')
  const write = vi.spyOn(Storage.prototype,'setItem')
  click('标注棋盘'); fireEvent.click(cell(1,1)); expect(write).not.toHaveBeenCalled()
  click('取消预览'); click('查看')
  expect(screen.getByText('重点格 0 个、箭头 0 条')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('回看进度'),{target:{value:'0'}})
  click('标注棋盘'); fireEvent.click(cell(4,4)); click('从此处试走')
  expect(screen.getByText('重点格 0 个、箭头 0 条')).toBeTruthy()
  expect(screen.getByRole('button',{name:'标注棋盘'})).toBeTruthy()
})
it('study origin supports annotations without writing a move or draft', () => {
  const result = createStudy(createSession(),{kind:'match',title:'起点',orientation:'red'}); if(!result.ok) throw new Error(result.error)
  const changed=vi.fn(), write=vi.spyOn(Storage.prototype,'setItem')
  render(<StudyWorkspace study={result.value} notice="" persistenceStatus="saved" collectionNotice="" collectionPersistenceStatus="saved" onChange={changed} onClear={vi.fn()} onCollect={vi.fn()} onExport={vi.fn()} onSource={vi.fn()} onMatch={vi.fn()} onCollection={vi.fn()}/>)
  click('标注棋盘'); fireEvent.click(cell(0,6)); click('箭头'); fireEvent.click(cell(1,1)); fireEvent.click(cell(7,8))
  expect(screen.getByText('重点格 1 个、箭头 1 条')).toBeTruthy()
  expect(changed).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled()
})
it('undo and new game invalidate completed match annotations', () => {
  saveProgress(localStorage,{...defaultProgress(),session:resign(history(),'black')})
  vi.spyOn(window,'confirm').mockReturnValue(true)
  render(<App />); click('标注棋盘'); fireEvent.click(cell(4,4)); click('结束标注'); click('悔棋')
  expect(screen.getByText('重点格 0 个、箭头 0 条')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('回看进度'),{target:{value:'0'}})
  click('标注棋盘'); fireEvent.click(cell(4,4)); click('重新开局')
  expect(screen.getByText('重点格 0 个、箭头 0 条')).toBeTruthy()
})
it('study routes clicks exclusively, clears selection, preserves cancelled truncate and invalidates successful same-position truncate', () => {
  const result = createStudy(createSession(),{kind:'match',title:'起点',orientation:'red'}); if(!result.ok) throw new Error(result.error)
  const changed=vi.fn()
  function Harness(){const [study,setStudy]=useState(result.ok ? {...result.value,session:history()} : null); return <StudyWorkspace study={study} notice="" persistenceStatus="saved" collectionNotice="" collectionPersistenceStatus="saved" onChange={next=>{changed(next);setStudy(next)}} onClear={vi.fn()} onCollect={vi.fn()} onExport={vi.fn()} onSource={vi.fn()} onMatch={vi.fn()} onCollection={vi.fn()}/>}
  render(<Harness />)
  fireEvent.click(cell(2,6)); click('标注棋盘'); fireEvent.click(cell(2,5))
  expect(changed).not.toHaveBeenCalled()
  expect(screen.getByText('重点格 1 个、箭头 0 条')).toBeTruthy()
  click('结束标注'); fireEvent.click(cell(2,5)); expect(changed).not.toHaveBeenCalled()
  fireEvent.click(cell(2,6)); fireEvent.click(cell(2,5)); expect(changed).toHaveBeenCalledOnce()
  fireEvent.change(screen.getByLabelText('回看进度'),{target:{value:'1'}})
  click('标注棋盘'); fireEvent.click(cell(4,4))
  click('翻转棋盘')
  fireEvent.change(screen.getByLabelText('本着笔记'),{target:{value:'试走观察'}}); click('保存笔记')
  expect(screen.getByText('重点格 1 个、箭头 0 条')).toBeTruthy()
  expect(screen.getByRole('button',{name:'结束标注'})).toBeTruthy()
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
  click('从这里改走'); expect(screen.getByText('重点格 1 个、箭头 0 条')).toBeTruthy()
  confirm.mockReturnValue(true); click('从这里改走')
  expect(screen.getByText('重点格 0 个、箭头 0 条')).toBeTruthy()
  expect(screen.getByRole('button',{name:'标注棋盘'})).toBeTruthy()
})
