// @vitest-environment jsdom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MoveReview } from '../src/ui/MoveReview'
import { App } from '../src/ui/App'
import { createSession, play, resign, setView } from '../src/core/session'
import type { Session } from '../src/core/session'
import { setNote } from '../src/core/review'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'
import * as learning from '../src/core/learning'

function history(ended = true): Session {
  let session = createSession()
  for (const move of [
    { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } },
    { from: { x: 0, y: 3 }, to: { x: 0, y: 4 } },
    { from: { x: 2, y: 6 }, to: { x: 2, y: 5 } },
  ]) {
    const result = play(session, move)
    if (!result.ok) throw new Error(result.error)
    session = result.session
  }
  return ended ? resign(session, 'black') : session
}
function Harness({ initial, onChange = vi.fn(), onSeek = vi.fn() }: { initial: Session; onChange?: (value: Session) => void; onSeek?: () => void }) {
  const [session, update] = useState(initial)
  return <MoveReview session={session} onChange={next => { onChange(next); update(next) }} onSeek={onSeek} />
}
const button = (name: string) => screen.getByRole('button', { name })
const index = () => Number((screen.getByRole('slider', { name: '回看进度' }) as HTMLInputElement).value)
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); delete (document as Document & { modelContext?: unknown }).modelContext })

describe('move review controls and playback', () => {
  it('seeks the actual history via range and first/last controls, clearing selection', () => {
    const initial = history(false), onChange = vi.fn(), onSeek = vi.fn()
    render(<Harness initial={initial} onChange={onChange} onSeek={onSeek} />)
    fireEvent.click(button('回到开局')); expect(index()).toBe(0)
    expect(screen.getByText('开局 · 共 3 着')).toBeTruthy()
    fireEvent.change(screen.getByRole('slider', { name: '回看进度' }), { target: { value: '1' } })
    expect(index()).toBe(1)
    expect(screen.getByText(/红方.*红兵.*\(0,6\).*\(0,5\)/)).toBeTruthy()
    fireEvent.click(button('跳到末着')); expect(index()).toBe(3)
    fireEvent.click(button('上一步')); expect(index()).toBe(2)
    fireEvent.click(button('下一步')); expect(index()).toBe(3)
    expect(onSeek).toHaveBeenCalledTimes(5)
    expect(onChange.mock.lastCall?.[0].game).toBe(initial.game)
    expect(screen.queryByRole('button', { name: '自动回放' })).toBeNull()
  })
  it('plays from the selected ply, pauses, restarts at the start from last, and stops at the end', () => {
    vi.useFakeTimers()
    render(<Harness initial={setView(history(), 1)} />)
    fireEvent.click(button('自动回放'))
    act(() => vi.advanceTimersByTime(900)); expect(index()).toBe(2)
    fireEvent.click(button('暂停'))
    act(() => vi.advanceTimersByTime(2000)); expect(index()).toBe(2)
    fireEvent.click(button('自动回放'))
    act(() => vi.advanceTimersByTime(900)); expect(index()).toBe(3)
    expect(button('自动回放')).toBeTruthy()
    fireEvent.click(button('自动回放')); expect(index()).toBe(0)
    act(() => vi.advanceTimersByTime(900)); expect(index()).toBe(1)
    fireEvent.click(button('上一步'))
    act(() => vi.advanceTimersByTime(1800)); expect(index()).toBe(0)
  })
  it('clears playback on unmount, replacement history, and a new game', () => {
    vi.useFakeTimers()
    const onChange = vi.fn(), initial = setView(history(), 1)
    const page = render(<MoveReview session={initial} onChange={onChange} />)
    fireEvent.click(button('自动回放'))
    page.rerender(<MoveReview session={setView(history(), 1)} onChange={onChange} />)
    act(() => vi.advanceTimersByTime(1800)); expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(button('自动回放'))
    page.rerender(<MoveReview session={createSession()} onChange={onChange} />)
    act(() => vi.advanceTimersByTime(1800)); expect(onChange).not.toHaveBeenCalled()
    page.rerender(<MoveReview session={initial} onChange={onChange} />)
    fireEvent.click(button('自动回放')); page.unmount()
    act(() => vi.advanceTimersByTime(1800)); expect(onChange).not.toHaveBeenCalled()
  })
  it('a pending playback tick uses newly saved notes and never restores a stale session', () => {
    vi.useFakeTimers()
    const initial = setView(history(), 1), onChange = vi.fn()
    const page = render(<MoveReview session={initial} onChange={onChange} />)
    fireEvent.click(button('自动回放'))
    const noted = setNote(initial, 2, '另一工具已保存')
    page.rerender(<MoveReview session={noted} onChange={onChange} />)
    act(() => vi.advanceTimersByTime(900))
    expect(onChange.mock.lastCall?.[0].notes).toEqual({ '2': '另一工具已保存' })
    expect(onChange.mock.lastCall?.[0].viewIndex).toBe(2)
  })
  it('an external manual seek pauses playback, including the summary start button', () => {
    vi.useFakeTimers()
    const initial = setView(history(), 1), onChange = vi.fn()
    const page = render(<MoveReview session={initial} onChange={onChange} />)
    fireEvent.click(button('自动回放'))
    page.rerender(<MoveReview session={setView(initial, 0)} onChange={onChange} />)
    act(() => vi.advanceTimersByTime(1800))
    expect(onChange).not.toHaveBeenCalled()
    expect(button('自动回放')).toBeTruthy()
  })
  it('pauses on note focus and changes draft only until explicit save; resets for a new game at the same ply', () => {
    vi.useFakeTimers()
    const initial = setView(setNote(history(), 1, '已保存'), 1), onChange = vi.fn()
    const page = render(<MoveReview session={initial} onChange={onChange} />)
    const textarea = screen.getByRole('textbox', { name: '本着笔记' }) as HTMLTextAreaElement
    expect(textarea.value).toBe('已保存'); expect(textarea.maxLength).toBe(500)
    fireEvent.click(button('自动回放')); fireEvent.focus(textarea)
    fireEvent.change(textarea, { target: { value: '草稿' } })
    act(() => vi.advanceTimersByTime(1800)); expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('草稿尚未保存。')).toBeTruthy()
    fireEvent.click(button('保存笔记'))
    expect(onChange.mock.lastCall?.[0].notes?.['1']).toBe('草稿')
    page.rerender(<MoveReview session={setView(history(), 1)} onChange={onChange} />)
    expect(textarea.value).toBe('')
    page.rerender(<MoveReview session={createSession()} onChange={onChange} />)
    expect(textarea.disabled).toBe(true)
    expect((button('保存笔记') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('saved notes in the actual app', () => {
  it('preserves notes through a real tool move and local move; undo truncates and new game clears', () => {
    const tools = new Map<string, { execute: (input: unknown) => unknown }>()
    Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool: (tool: { name: string; execute: (input: unknown) => unknown }) => tools.set(tool.name, tool) } })
    const initial = history(false)
    saveProgress(localStorage, { ...defaultProgress(), session: initial })
    render(<App />)
    fireEvent.change(screen.getByRole('textbox', { name: '本着笔记' }), { target: { value: '保留第三着' } })
    fireEvent.click(button('保存笔记'))
    act(() => { expect(tools.get('play_move')?.execute({ from: { x: 2, y: 3 }, to: { x: 2, y: 4 } })).toMatchObject({ ok: true }) })
    expect(loadProgress(localStorage).session.notes).toEqual({ '3': '保留第三着' })
    fireEvent.click(button('红兵，坐标 4,6'))
    fireEvent.click(button('交叉点 4,5，可走落点'))
    expect(loadProgress(localStorage).session.records).toHaveLength(5)
    expect(loadProgress(localStorage).session.notes).toEqual({ '3': '保留第三着' })
    fireEvent.change(screen.getByRole('textbox', { name: '本着笔记' }), { target: { value: '撤回第五着' } })
    fireEvent.click(button('保存笔记')); fireEvent.click(button('悔棋'))
    expect(loadProgress(localStorage).session.notes).toEqual({ '3': '保留第三着' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(button('重新开局'))
    expect(loadProgress(localStorage).session.notes).toEqual({})
  })
  it('opening the rules sidebar stops playback without changing the final game', () => {
    vi.useFakeTimers()
    const initial = setView(history(), 1)
    saveProgress(localStorage, { ...defaultProgress(), session: initial })
    render(<App />)
    fireEvent.click(button('自动回放')); fireEvent.click(button('查规则'))
    act(() => vi.advanceTimersByTime(1800))
    const saved = loadProgress(localStorage).session
    expect(saved.viewIndex).toBe(1); expect(saved.game).toEqual(initial.game)
    fireEvent.click(button('返回棋局工具'))
    expect(button('自动回放')).toBeTruthy()
  })
  it('reports an actual browser write failure without claiming the note survived refresh', () => {
    saveProgress(localStorage, { ...defaultProgress(), session: history(false) })
    render(<App />)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    fireEvent.change(screen.getByRole('textbox', { name: '本着笔记' }), { target: { value: '未持久保存' } })
    fireEvent.click(button('保存笔记'))
    expect(screen.getByText('浏览器保存失败；本局笔记暂留在当前页面，刷新后可能丢失。')).toBeTruthy()
    expect(screen.queryByText('本局已保存到当前浏览器。')).toBeNull()
    expect((screen.getByRole('textbox', { name: '本着笔记' }) as HTMLTextAreaElement).value).toBe('未持久保存')
  })
  it('restores notes after refresh and clear, with no milestone reaward or lost help history', () => {
    const initial = history()
    const progress = { ...defaultProgress(), session: initial, learningMatch: { active: false, standardStart: true, coachEnabled: false, coachEverUsed: true, checkpointSeen: true, toolMoveUsed: true }, milestones: { firstMatch: true, independentMatch: false } }
    saveProgress(localStorage, progress)
    const award = vi.spyOn(learning, 'awardMatchMilestones')
    const page = render(<App />)
    const afterMount = award.mock.calls.length
    fireEvent.click(button('上一步'))
    fireEvent.change(screen.getByRole('textbox', { name: '本着笔记' }), { target: { value: '看对方回应' } })
    fireEvent.click(button('保存笔记'))
    expect(loadProgress(localStorage).session.notes).toEqual({ '2': '看对方回应' })
    expect(loadProgress(localStorage).learningMatch).toEqual(progress.learningMatch)
    expect(award.mock.calls.length).toBe(afterMount)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    page.unmount(); render(<App />)
    expect((screen.getByRole('textbox', { name: '本着笔记' }) as HTMLTextAreaElement).value).toBe('看对方回应')
    fireEvent.click(button('清除笔记'))
    expect(loadProgress(localStorage).session.notes).toEqual({})
    expect(loadProgress(localStorage).milestones).toEqual(progress.milestones)
  })
})
