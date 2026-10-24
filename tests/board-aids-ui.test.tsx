// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import { Match } from '../src/ui/Match'
import { BoardDisplayProvider } from '../src/ui/BoardDisplayContext'
import { defaultPreferences, loadPreferences } from '../src/core/preferences'
import { createSession, play, resign, setView } from '../src/core/session'
import type { Session } from '../src/core/session'
import { setNote } from '../src/core/review'
import { archiveSession, inspectArchive } from '../src/core/archive-codec'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'
import { defaultPractice, showPracticeHint, startPractice } from '../src/core/practice'
import { legalMoves } from '../src/core/rules'
import type { Game } from '../src/core/rules'
import type { Move } from '../src/core/types'
import * as captures from '../src/core/captures'

const tuples = [[0, 6, 0, 5], [0, 3, 0, 4], [0, 5, 0, 4], [2, 3, 2, 4], [2, 6, 2, 5], [2, 4, 2, 5]]
const moves = tuples.map(([x, y, tx, ty]) => ({ from: { x, y }, to: { x: tx, y: ty } }))
function history(count = 6) {
  let session = createSession()
  for (const move of moves.slice(0, count)) {
    const result = play(session, move)
    if (!result.ok) throw new Error(result.error)
    session = result.session
  }
  return session
}
function archive(session = history()) {
  const result = archiveSession(session, '真实吃子棋谱')
  if (!result.ok) throw new Error(result.error)
  return result.value
}
const click = (name: string) => {
  const label = screen.getByText(name, { selector: 'button', exact: true })
  fireEvent.click(within(label.parentElement!).getByRole('button', { name, exact: true }))
}
const seek = (index: number) => fireEvent.change(screen.getByLabelText('回看进度'), { target: { value: String(index) } })
const panel = () => screen.getByRole('region', { name: '本局失子' })
function expectLost(red: string, black: string) {
  expect(within(panel()).getByLabelText('红方已失').textContent).toContain(red)
  expect(within(panel()).getByLabelText('黑方已失').textContent).toContain(black)
  expect(within(panel()).getByText('仅统计本局棋谱中的吃子')).toBeTruthy()
}
const settings = () => screen.getByRole('dialog', { name: '棋盘显示' })
function changeDisplay() {
  fireEvent.change(within(settings()).getByLabelText('棋盘主题'), { target: { value: 'clear' } })
  fireEvent.click(within(settings()).getByLabelText('显示数字坐标'))
}
function expectBoardsDisplay() {
  const boards = screen.getAllByLabelText('象棋棋盘')
  expect(boards.length).toBeGreaterThan(0)
  for (const board of boards) {
    expect(board.parentElement?.classList.contains('board-frame--clear')).toBe(true)
    expect(board.querySelectorAll('.board-coordinate')).toHaveLength(38)
  }
}
function match(session: Session, value = defaultPreferences()) {
  return <BoardDisplayProvider value={value}><Match session={session} onChange={vi.fn()} onStart={vi.fn()} learningMatch={null} milestones={{ firstMatch: false, independentMatch: false }} onCoachChange={vi.fn()} onCheckpointSeen={vi.fn()} onLearn={vi.fn()} help={null} onHelpChange={vi.fn()} onOpeningPractice={vi.fn()} termId="" onTerm={vi.fn()} preferences={defaultPreferences()} onPreferencesChange={vi.fn()} /></BoardDisplayProvider>
}
beforeEach(() => { localStorage.clear(); vi.spyOn(window, 'confirm').mockReturnValue(true) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('global board display integration', () => {
  it('opens from the header, preserves the live board and selection, and applies to every teaching board without changing orientation', () => {
    localStorage.setItem('xiangqi-preferences', JSON.stringify({ version: 1, preferences: { ...defaultPreferences(), boardView: 'black' } }))
    render(<App />)
    const liveBoard = screen.getByLabelText('象棋棋盘')
    fireEvent.click(screen.getByLabelText('红兵，坐标 0,6'))
    click('棋盘显示'); changeDisplay()
    expect(screen.getByLabelText('象棋棋盘')).toBe(liveBoard)
    expect(screen.getByLabelText('红兵，坐标 0,6，已选中').getAttribute('aria-pressed')).toBe('true')
    expectBoardsDisplay()
    expect(within(liveBoard).getByLabelText('黑车，坐标 0,0').style.left).toBe('95%')
    expect(screen.getByRole('navigation', { name: '主导航' }).querySelector('[aria-current="page"]')?.textContent).toBe('开始对弈')
    expect(within(screen.getByRole('navigation', { name: '主导航' })).queryByRole('button', { name: '棋盘显示' })).toBeNull()
    click('关闭设置'); click('规则手册')
    expectBoardsDisplay()
    const boards = screen.getAllByLabelText('象棋棋盘')
    expect(boards.length).toBeGreaterThan(1)
    expect(within(boards[1]).getByLabelText('黑车，坐标 0,0').style.left).toBe('5%')
    expect(screen.queryByRole('region', { name: '本局失子' })).toBeNull()
    click('新手课堂'); expectBoardsDisplay()
    expect(screen.queryByRole('region', { name: '本局失子' })).toBeNull()
    click('棋盘显示')
    expect(screen.getByRole('navigation', { name: '主导航' }).querySelector('[aria-current="page"]')?.textContent).toBe('新手课堂')
    click('关闭设置')
    for (const section of ['棋路馆', '术语词典', '残局练习']) {
      click(section); if (section === '残局练习') click('基础单步题'); expectBoardsDisplay()
      expect(screen.queryByRole('region', { name: '本局失子' })).toBeNull()
    }
    click('主题练习'); click('推荐练习'); expectBoardsDisplay()
    expect(screen.queryByRole('region', { name: '本局失子' })).toBeNull()
  })

  it('persists only preferences and preserves the complete progress and archive schema through toggles and reload', () => {
    const initial = { ...defaultProgress(), session: setNote(history(), 3, '吃掉黑卒'), completedLessons: ['welcome'], solvedPuzzles: ['puzzle'], practicedUnits: ['capture-target'], masteredUnits: ['give-check'], assistedVariants: ['hint-used'], milestones: { firstMatch: true, independentMatch: false }, learningMatch: { active: false, standardStart: true, coachEnabled: false, coachEverUsed: true, checkpointSeen: true, toolMoveUsed: true }, collection: { version: 1 as const, items: [{ id: 'capture', savedAt: 1700000000000, archive: archive() }] } }
    initial.practice = showPracticeHint(startPractice(defaultPractice(), { mode: 'recommended' }, initial))
    saveProgress(localStorage, initial)
    const page = render(<App />)
    const before = loadProgress(localStorage), rawBefore = localStorage.getItem('xiangqi-progress')
    const originalArchive = archive(before.session)
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    click('棋盘显示'); changeDisplay()
    fireEvent.click(within(settings()).getByLabelText('显示本局失子'))
    expect(screen.queryByRole('region', { name: '本局失子' })).toBeNull()
    expect(within(settings()).getByRole('status').textContent).toBe('已保存')
    expect(loadPreferences(localStorage)).toEqual({ ...defaultPreferences(), boardTheme: 'clear', showCoordinates: true, showCaptured: false })
    expect(writes.mock.calls.filter(([key]) => key === 'xiangqi-progress')).toEqual([])
    expect(localStorage.getItem('xiangqi-progress')).toBe(rawBefore)
    expect(loadProgress(localStorage)).toEqual(before)
    expect(archive(loadProgress(localStorage).session)).toEqual(originalArchive)
    expect(Object.keys(originalArchive).sort()).toEqual(['ending', 'format', 'moves', 'notes', 'startMoves', 'title', 'version'])
    page.unmount(); render(<App />)
    expectBoardsDisplay(); expect(screen.queryByRole('region', { name: '本局失子' })).toBeNull()
    expect(loadProgress(localStorage)).toEqual(before)
    click('棋盘显示'); fireEvent.click(within(settings()).getByLabelText('显示本局失子'))
    expectLost('红兵 × 1', '黑卒 × 1')
  })

  it('shows real preference write failure, retains choices, then saves a later selection after storage recovers', () => {
    render(<App />)
    const nativeWrite = Storage.prototype.setItem
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'xiangqi-preferences') throw new Error('quota')
      nativeWrite.call(this, key, value)
    })
    click('棋盘显示'); changeDisplay()
    expect(within(settings()).getByRole('status').textContent).toContain('保存失败')
    expect(within(settings()).queryByText('已保存')).toBeNull(); expectBoardsDisplay()
    expect(loadPreferences(localStorage).boardTheme).toBe('classic')
    write.mockImplementation(nativeWrite)
    fireEvent.click(within(settings()).getByLabelText('显示本局失子'))
    expect(within(settings()).getByRole('status').textContent).toBe('已保存')
    expect(loadPreferences(localStorage)).toEqual({ ...defaultPreferences(), boardTheme: 'clear', showCoordinates: true, showCaptured: false })
  })

  it('handles a blocked localStorage getter during preference saving and later recovers', () => {
    render(<App />)
    const storage = window.localStorage
    const getter = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked') })
    click('棋盘显示'); changeDisplay()
    expect(within(settings()).getByRole('status').textContent).toContain('保存失败')
    getter.mockRestore()
    fireEvent.click(within(settings()).getByLabelText('显示本局失子'))
    expect(within(settings()).getByRole('status').textContent).toBe('已保存')
    expect(loadPreferences(storage).boardTheme).toBe('clear')
  })
})

describe('loss panel from the real replay', () => {
  it('tracks the viewed ply, undo, reload and a new game without inferring missing starting pieces', () => {
    saveProgress(localStorage, { ...defaultProgress(), session: history() })
    let page = render(<App />)
    expectLost('红兵 × 1', '黑卒 × 1')
    seek(2); expectLost('暂无失子', '暂无失子')
    seek(3); expectLost('暂无失子', '黑卒 × 1')
    click('回到当前'); click('悔棋'); expectLost('暂无失子', '黑卒 × 1')
    page.unmount(); page = render(<App />); expectLost('暂无失子', '黑卒 × 1')
    click('重新开局'); expectLost('暂无失子', '暂无失子')
    expect(loadProgress(localStorage).session.records).toHaveLength(0)
    page.unmount()
    const prefix = { ...archive(), startMoves: moves.slice(0, 3), moves: moves.slice(3, 4), notes: {} }
    const inspected = inspectArchive(prefix)
    if (!inspected.ok) throw new Error(inspected.error)
    saveProgress(localStorage, { ...defaultProgress(), session: inspected.value.session })
    render(<App />); expectLost('暂无失子', '暂无失子')
  })

  it('keeps collection preview, notes and view independent while applying the display preferences globally', () => {
    saveProgress(localStorage, { ...defaultProgress(), session: setView(history(), 2), collection: { version: 1, items: [{ id: 'one', savedAt: 1700000000000, archive: archive(setNote(history(), 3, '收藏笔记')) }] } })
    render(<App />)
    const before = loadProgress(localStorage)
    click('棋局收藏'); click('查看'); expectLost('红兵 × 1', '黑卒 × 1')
    const previewBoard = screen.getByLabelText('象棋棋盘')
    seek(3); expectLost('暂无失子', '黑卒 × 1'); expect(screen.getByText('收藏笔记')).toBeTruthy()
    click('棋盘显示'); changeDisplay(); click('关闭设置')
    expect(screen.getByLabelText('象棋棋盘')).toBe(previewBoard)
    expect((screen.getByLabelText('回看进度') as HTMLInputElement).value).toBe('3')
    expectBoardsDisplay(); expect(loadProgress(localStorage)).toEqual(before)
    click('开始对弈'); expectLost('暂无失子', '暂无失子')
    expect((screen.getByLabelText('回看进度') as HTMLInputElement).value).toBe('2')
  })

  it('distinguishes unknown from zero and retains a valid prefix before a damaged record', () => {
    const session = history()
    const broken = { ...session, records: session.records.map((record, i) => i === 3 ? { ...record, move: { from: { x: 4, y: 3 }, to: { x: 4, y: 4 } } } : record) }
    const page = render(match(setView(broken, 3)))
    expectLost('暂无失子', '黑卒 × 1')
    page.rerender(match(setView(broken, 4)))
    expect(within(panel()).getByText('本段吃子记录暂无法核对')).toBeTruthy()
    expect(within(panel()).queryByText('暂无失子')).toBeNull()
    expect(within(panel()).getByText('仅统计本局棋谱中的吃子')).toBeTruthy()
  })

  it('builds once per records/snapshots identity, reusing the timeline for view, notes and display changes', () => {
    const build = vi.spyOn(captures, 'buildCaptureTimeline')
    const initial = history()
    const page = render(match(initial))
    expect(build).toHaveBeenCalledTimes(1)
    const viewed = setView(initial, 3)
    page.rerender(match(viewed)); expect(build).toHaveBeenCalledTimes(1)
    page.rerender(match(setNote(viewed, 3, '观察'))); expect(build).toHaveBeenCalledTimes(1)
    page.rerender(match(viewed, { ...defaultPreferences(), boardTheme: 'clear', showCoordinates: true, showCaptured: false })); expect(build).toHaveBeenCalledTimes(1)
    page.rerender(match(viewed)); expect(build).toHaveBeenCalledTimes(1)
    const replacedRecords = { ...viewed, records: [...viewed.records] }
    page.rerender(match(replacedRecords)); expect(build).toHaveBeenCalledTimes(2)
    page.rerender(match({ ...replacedRecords, snapshots: [...viewed.snapshots] })); expect(build).toHaveBeenCalledTimes(3)
  })
})

describe('ongoing work survives display settings', () => {
  it('keeps the original computer request active, accepts its legal reply, and still cancels when leaving the match', () => {
    vi.useFakeTimers()
    const instances: HeldWorker[] = []
    class HeldWorker {
      request!: { id: number; game: Game }
      onmessage: ((event: { data: { id: number; move: Move } }) => void) | null = null
      terminate = vi.fn()
      postMessage = vi.fn((request: HeldWorker['request']) => { this.request = request })
      constructor() { instances.push(this) }
      reply() { this.onmessage?.({ data: { id: this.request.id, move: legalMoves(this.request.game.board, this.request.game.turn)[0] } }) }
    }
    vi.stubGlobal('Worker', HeldWorker)
    saveProgress(localStorage, { ...defaultProgress(), session: createSession('ai', 'black') })
    render(<App />)
    const worker = instances[0]
    click('棋盘显示'); changeDisplay(); fireEvent.click(within(settings()).getByLabelText('显示本局失子')); click('关闭设置')
    expect(instances).toHaveLength(1); expect(worker.postMessage).toHaveBeenCalledTimes(1); expect(worker.terminate).not.toHaveBeenCalled()
    act(() => worker.reply())
    expect(loadProgress(localStorage).session.records).toHaveLength(1)
    expect(legalMoves(worker.request.game.board, worker.request.game.turn)).toContainEqual(loadProgress(localStorage).session.records[0].move)
    click('重新开局')
    const current = instances[1]
    click('新手课堂'); expect(current.terminate).toHaveBeenCalled()
    act(() => current.reply()); expect(loadProgress(localStorage).session.records).toHaveLength(0)
  })

  it('keeps autoplay on its original 900ms schedule when settings open and display changes', () => {
    vi.useFakeTimers()
    saveProgress(localStorage, { ...defaultProgress(), session: setView(resign(history(), 'red'), 0) })
    render(<App />)
    click('自动回放'); act(() => vi.advanceTimersByTime(400))
    click('棋盘显示'); changeDisplay()
    act(() => vi.advanceTimersByTime(500))
    expect((screen.getByLabelText('回看进度') as HTMLInputElement).value).toBe('1')
    expect(loadProgress(localStorage).session.viewIndex).toBe(1)
    click('关闭设置'); expect(screen.getByRole('button', { name: '暂停' })).toBeTruthy()
  })
})
