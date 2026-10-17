// @vitest-environment jsdom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudyWorkspace } from '../src/ui/StudyWorkspace'
import type { StudyWorkspaceProps } from '../src/ui/StudyWorkspace'
import { BoardDisplayProvider } from '../src/ui/BoardDisplayContext'
import { defaultPreferences } from '../src/core/preferences'
import { createSession, play, setView } from '../src/core/session'
import type { Session } from '../src/core/session'
import { createStudy, playStudy } from '../src/core/study'
import type { Study } from '../src/core/study'
import type { Move } from '../src/core/types'
import type { Result } from '../src/core/archive-codec'
import { inspectArchive } from '../src/core/archive-codec'
import { setNote } from '../src/core/review'
import * as captures from '../src/core/captures'

type Coordinates = [number, number, number, number]
const line: Coordinates[] = [[0, 6, 0, 5], [0, 3, 0, 4], [0, 5, 0, 4], [2, 3, 2, 4], [2, 6, 2, 5], [2, 4, 2, 5]]
const cycle: Coordinates[] = [[1, 9, 2, 7], [1, 0, 2, 2], [2, 7, 1, 9], [2, 2, 1, 0]]
const move = ([x, y, tx, ty]: Coordinates): Move => ({ from: { x, y }, to: { x: tx, y: ty } })
function value<T>(result: Result<T>): T { if (!result.ok) throw new Error(result.error); return result.value }
function played(moves: Coordinates[]): Session {
  let session = createSession()
  for (const coordinates of moves) {
    const next = play(session, move(coordinates))
    if (!next.ok) throw new Error(next.error)
    session = next.session
  }
  return session
}
function fork(source = setView(setNote(played(line), 3, '原局笔记'), 3)): Study {
  return value(createStudy(source, { kind: 'match', title: '来源实战', orientation: 'black' }))
}
function extended() {
  let study = fork()
  for (const coordinates of line.slice(3)) study = value(playStudy(study, move(coordinates)))
  return study
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }))
const seek = (index: number) => fireEvent.change(screen.getByLabelText('回看进度'), { target: { value: String(index) } })
function cell(x: number, y: number) {
  return screen.getByLabelText(new RegExp(`^(?:[^，]+，坐标 |交叉点 )${x},${y}(?:，|$)`))
}
function playCell([x, y, tx, ty]: Coordinates) { fireEvent.click(cell(x, y)); fireEvent.click(cell(tx, ty)) }
function setup(initial: Study | null = fork(), overrides: Partial<StudyWorkspaceProps> = {}) {
  let current = initial
  const changed = vi.fn(), cleared = vi.fn(), collected = vi.fn(), exported = vi.fn()
  const source = vi.fn(), match = vi.fn(), collection = vi.fn()
  function Harness() {
    const [study, setStudy] = useState(initial)
    const [display, setDisplay] = useState(defaultPreferences())
    return <BoardDisplayProvider value={display}>
      <button onClick={() => setDisplay({ ...display, boardTheme: 'clear', showCoordinates: true, showCaptured: !display.showCaptured })}>切换显示</button>
      <StudyWorkspace study={study} notice="" persistenceStatus="saved" collectionNotice="" collectionPersistenceStatus="saved"
        onChange={next => { current = next; changed(next); setStudy(next) }} onClear={cleared} onCollect={collected} onExport={exported}
        onSource={source} onMatch={match} onCollection={collection} {...overrides} />
    </BoardDisplayProvider>
  }
  const page = render(<Harness />)
  return { ...page, current: () => current!, changed, cleared, collected, exported, source, match, collection }
}
beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('standalone study workspace', () => {
  it('offers empty-state navigation and explicit cleanup for an unreadable draft', () => {
    const page = setup(null, { notice: '试走草稿无法读取' })
    expect(screen.getByRole('region', { name: '试走工作区' }).className).toContain('study-page')
    expect(screen.getByRole('heading', { name: '试走研究' })).toBeTruthy()
    expect(screen.getByText('无草稿')).toBeTruthy()
    expect(screen.getByText(/所选位置/)).toBeTruthy()
    expect(screen.getByText('试走草稿无法读取')).toBeTruthy()
    expect(screen.queryByLabelText('象棋棋盘')).toBeNull()
    click('前往对弈'); click('前往收藏')
    expect(page.match).toHaveBeenCalledOnce(); expect(page.collection).toHaveBeenCalledOnce()
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    click('清空试走'); expect(page.cleared).not.toHaveBeenCalled()
    click('清空试走'); expect(page.cleared).toHaveBeenCalledOnce()
    expect(page.changed).not.toHaveBeenCalled()
  })

  it('starts from the selected real black-to-move prefix and counts only new captures', () => {
    const source = setView(setNote(played(line), 3, '原局笔记'), 3)
    const before = structuredClone(source), page = setup(fork(source))
    expect(screen.getAllByLabelText('象棋棋盘')).toHaveLength(1)
    expect(screen.getByText(/原局第\s*3\s*着/)).toBeTruthy()
    expect(screen.getByText(/来源实战/)).toBeTruthy()
    expect(screen.getByText(/仅研究新增变化/)).toBeTruthy()
    expect(screen.getByText(/起点.*黑方/)).toBeTruthy()
    expect(screen.getByText('黑方行棋')).toBeTruthy()
    expect(cell(0, 0).style.left).toBe('95%')
    const panel = screen.getByRole('region', { name: '试走失子' })
    expect(within(panel).getByText('仅统计本次试走中的吃子')).toBeTruthy()
    expect(within(panel).getAllByText('暂无失子')).toHaveLength(2)
    expect(screen.getByRole('button', { name: '收藏试走' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: '导出试走' }).hasAttribute('disabled')).toBe(true)
    for (const coordinates of line.slice(3)) playCell(coordinates)
    expect(page.current().session.records).toHaveLength(3)
    expect(page.current().session.game.turn).toBe('red')
    expect(within(panel).getByLabelText('红方已失').textContent).toContain('红兵 × 1')
    expect(within(panel).getByLabelText('黑方已失').textContent).toContain('暂无失子')
    expect(source).toEqual(before)
    for (const name of ['认输', '提和', '重新开局', '执红对电脑']) expect(screen.queryByRole('button', { name })).toBeNull()
  })

  it('shows legal targets, reports invalid moves without changes, and undoes exactly one local ply', () => {
    const page = setup(), initial = page.current()
    fireEvent.click(cell(2, 3))
    expect(cell(2, 4).getAttribute('aria-label')).toContain('可走落点')
    fireEvent.click(cell(2, 5))
    expect(screen.getByRole('status').textContent).toMatch(/[\u4e00-\u9fff]/)
    expect(page.current()).toBe(initial); expect(page.changed).not.toHaveBeenCalled()
    fireEvent.click(cell(2, 4))
    expect(page.current().session.records).toHaveLength(1)
    expect(cell(2, 4).getAttribute('aria-label')).toContain('上一步')
    playCell(line[4]); click('悔棋')
    expect(page.current().session.records).toHaveLength(1)
    expect(page.current().session.game.turn).toBe('red')
    click('悔棋'); expect(page.current().session.game).toEqual(initial.session.game)
  })

  it('requires explicit confirmed branching and retains only earlier notes', () => {
    const initial = extended()
    initial.session = setNote(setNote(initial.session, 1, '保留'), 3, '删除')
    const page = setup(initial)
    seek(1); fireEvent.click(cell(2, 6))
    expect(screen.getByRole('status').textContent).toContain('请先从这里改走或跳到末着')
    expect(page.current().session.records).toHaveLength(3)
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    click('从这里改走'); expect(page.current().session.records).toHaveLength(3)
    click('从这里改走')
    expect(page.current().session.records).toHaveLength(1)
    expect(page.current().session.notes).toEqual({ '1': '保留' })
    expect(page.current().session.game).toBe(initial.session.snapshots[1])
    playCell(line[4]); expect(page.current().session.records).toHaveLength(2)
  })

  it('saves at most 500 note characters manually and confirms reset and clear without blanking locally', () => {
    const page = setup(extended())
    fireEvent.change(screen.getByLabelText('本着笔记'), { target: { value: '记'.repeat(520) } })
    expect(page.current().session.notes).toEqual({})
    click('保存笔记')
    expect(page.current().session.notes?.['3']).toHaveLength(500)
    expect(screen.getByText(/笔记已加入试走草稿/)).toBeTruthy()
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    click('回到试走起点'); expect(page.current().session.records).toHaveLength(3)
    click('回到试走起点')
    expect(page.current().session.records).toEqual([]); expect(page.current().session.notes).toEqual({})
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    click('清空试走'); expect(page.cleared).not.toHaveBeenCalled()
    click('清空试走'); expect(page.cleared).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('象棋棋盘')).toBeTruthy()
  })

  it('flips only study orientation and navigates back to the source', () => {
    const page = setup(), before = page.current()
    click('翻转棋盘')
    expect(page.current()).toEqual({ ...before, orientation: 'red' })
    expect(page.current().session).toBe(before.session)
    expect(cell(0, 0).style.left).toBe('5%')
    click('返回来源'); expect(page.source).toHaveBeenCalledOnce()
  })

  it('validates trimmed titles and produces independent real archives without source notes', () => {
    const page = setup(extended())
    const name = screen.getByLabelText('试走收藏名称')
    expect(name.getAttribute('maxlength')).toBe('40'); expect((name as HTMLInputElement).value).toBe('试走')
    for (const title of ['   ', '字'.repeat(41)]) {
      fireEvent.change(name, { target: { value: title } }); click('收藏试走')
      expect(page.collected).not.toHaveBeenCalled()
      expect(screen.getByRole('status').textContent).toMatch(/1.*40/)
    }
    fireEvent.change(name, { target: { value: '  新变化  ' } })
    click('收藏试走'); click('收藏试走'); click('导出试走')
    expect(page.collected).toHaveBeenCalledTimes(2); expect(page.exported).toHaveBeenCalledOnce()
    const first = page.collected.mock.calls[0][0]
    expect(first.title).toBe('新变化'); expect(first.startMoves).toEqual(line.slice(0, 3).map(move))
    expect(first.moves).toEqual(line.slice(3).map(move)); expect(first.notes ?? {}).toEqual({})
    expect(value(inspectArchive(first)).session.game).toEqual(page.current().session.game)
    expect(page.collected.mock.calls[1][0]).not.toBe(first)
    expect(page.current().session.records).toHaveLength(3)
  })

  it.each(['pending', 'saved', 'failed'] as const)('surfaces actual %s draft and collection persistence', persistenceStatus => {
    setup(extended(), { persistenceStatus, collectionPersistenceStatus: persistenceStatus, collectionNotice: '收藏容量已满' })
    const text = document.body.textContent!
    expect(text).toContain('收藏容量已满')
    if (persistenceStatus === 'pending') { expect(text).toContain('正在保存试走草稿'); expect(text).toContain('正在保存收藏') }
    if (persistenceStatus === 'saved') { expect(text).toContain('试走草稿已保存到当前浏览器'); expect(text).toContain('本机收藏已保存到当前浏览器') }
    if (persistenceStatus === 'failed') { expect(text).toContain('试走草稿暂留在当前页面'); expect(text).toContain('收藏保存失败') }
  })

  it('keeps the board, keyboard cursor, selection and capture cache through display and note changes', () => {
    const spy = vi.spyOn(captures, 'buildCaptureTimeline')
    const page = setup(extended()), board = screen.getByLabelText('象棋棋盘')
    const selected = cell(6, 6)
    fireEvent.click(selected); selected.focus()
    const calls = spy.mock.calls.length
    click('切换显示')
    expect(screen.getByLabelText('象棋棋盘')).toBe(board)
    expect(cell(6, 6)).toBe(selected); expect(document.activeElement).toBe(selected)
    expect(selected.getAttribute('aria-pressed')).toBe('true'); expect(selected.tabIndex).toBe(0)
    expect(board.parentElement?.classList.contains('board-frame--clear')).toBe(true)
    expect(board.querySelectorAll('.board-coordinate')).toHaveLength(38)
    expect(screen.queryByRole('region', { name: '试走失子' })).toBeNull()
    fireEvent.change(screen.getByLabelText('本着笔记'), { target: { value: '局部笔记' } }); click('保存笔记')
    expect(cell(6, 6)).toBe(selected); expect(selected.getAttribute('aria-pressed')).toBe('true')
    click('切换显示'); expect(spy.mock.calls.length).toBe(calls)
    expect(page.current().session.notes).toEqual({ '3': '局部笔记' })
    seek(1); expect(cell(6, 6).getAttribute('aria-pressed')).toBe('false')
    expect(spy.mock.calls.length).toBe(calls)
  })

  it('inherits a genuine 119-ply natural-limit counter and preserves the 900ms playback timer across display changes', () => {
    vi.useFakeTimers()
    const source = played(Array.from({ length: 119 }, (_, index) => cycle[index % 4]))
    const page = setup(fork(source))
    playCell(cycle[3])
    expect(page.current().session.game.result).toEqual({ winner: null, reason: 'natural-limit' })
    expect(screen.getByText('和棋 · 自然限着')).toBeTruthy()
    const ended = page.current()
    fireEvent.click(cell(0, 6))
    expect(screen.getByRole('status').textContent).toContain('试走已结束')
    expect(page.current()).toBe(ended)
    click('自动回放'); expect(page.current().session.viewIndex).toBe(0)
    act(() => vi.advanceTimersByTime(400)); click('切换显示')
    act(() => vi.advanceTimersByTime(499)); expect(page.current().session.viewIndex).toBe(0)
    act(() => vi.advanceTimersByTime(1)); expect(page.current().session.viewIndex).toBe(1)
    expect(screen.getByText(/本着造成自然限着/)).toBeTruthy()
  })

  it('stops at a genuine 600-ply history without inventing a terminal game result', () => {
    const blackFirst = [cycle[1], cycle[0], cycle[3], cycle[2]], moves: Coordinates[] = []
    for (const [index, x] of [0, 2, 6, 8, 4].entries()) {
      const waiting = index % 2 === 0 ? cycle : blackFirst
      for (let round = 0; round < 28; round++) moves.push(...waiting)
      moves.push(...(index % 2 === 0 ? [[x, 6, x, 5], [x, 3, x, 4], [x, 5, x, 4]] : [[x, 3, x, 4], [x, 6, x, 5], [x, 4, x, 5]]) as Coordinates[])
    }
    for (let index = 0; index < 24; index++) moves.push(blackFirst[index % 4])
    expect(moves).toHaveLength(599)
    const page = setup(fork(played(moves)))
    playCell(blackFirst[0]); expect(page.current().session.records).toHaveLength(1)
    expect(page.current().session.game.result).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('600着上限')
    const capped = page.current()
    fireEvent.click(cell(0, 0))
    expect(screen.getByRole('status').textContent).toContain('600着上限')
    expect(page.current()).toBe(capped)
    expect(screen.queryByRole('button', { name: '自动回放' })).toBeNull()
    click('悔棋'); expect(page.current().session.records).toHaveLength(0)
  })
})
