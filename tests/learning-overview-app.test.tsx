// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import { curriculum } from '../src/content/curriculum'
import { openings } from '../src/content/openings'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'
import { startPractice } from '../src/core/practice'
import { defaultOpeningTraining, transitionOpeningTraining } from '../src/core/opening-training'
import { saveOpeningTraining } from '../src/core/opening-training-storage'
import { defaultTactics, transitionTactics } from '../src/core/tactics'
import { saveTactics } from '../src/core/tactics-storage'
import { createSession } from '../src/core/session'
import { legalMoves, type Game } from '../src/core/rules'
import type { Move } from '../src/core/types'

const click = (name: string) => fireEvent.click(screen.getByText(name, { selector: 'button', exact: true }))
const overview = () => screen.getByRole('region', { name: '学习总览' })
const openOverview = () => { click('新手课堂'); click('学习总览') }
function move(from: string, to: string) {
  fireEvent.click(screen.getByLabelText(new RegExp(from)))
  fireEvent.click(screen.getByLabelText(new RegExp(to)))
}
function challenge() { click('开始原局面练习'); move('红兵，坐标 0,6', '交叉点 0,5.*可走落点'); click('进入未见变式') }
const snapshot = () => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]))
beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete (document as Document & { modelContext?: unknown }).modelContext })

describe('learning overview navigation and isolation', () => {
  it('starts on the existing match, opens ordinary chapters, and resets the view on main navigation', () => {
    render(<App />)
    expect(screen.getByRole('group', { name: '象棋棋盘' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '学习总览' })).toBeNull()
    openOverview()
    expect(overview()).toBeTruthy()
    click('新手课堂')
    expect(screen.queryByRole('region', { name: '学习总览' })).toBeNull()
    expect(screen.getByText('演示 · 先看一遍')).toBeTruthy()
  })

  it('keeps the same hidden board, stage, hint and selection, moving focus only into the visible panel', async () => {
    const user = userEvent.setup()
    render(<App />); click('新手课堂'); challenge(); click('提示 1 · 观察')
    fireEvent.click(screen.getByRole('button', { name: '黑卒，坐标 2,3' }))
    const board = screen.getByRole('group', { name: '象棋棋盘' })
    const coursePanel = board.closest('[data-learning-panel="course"]')!
    click('学习总览')
    expect(coursePanel.hasAttribute('hidden')).toBe(true)
    expect(screen.queryByRole('group', { name: '象棋棋盘' })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '学习总览' }))
    await user.tab()
    expect(coursePanel.contains(document.activeElement)).toBe(false)
    click('章节学习')
    expect(screen.getByRole('group', { name: '象棋棋盘' })).toBe(board)
    expect(screen.getByText('挑战 · 未见变式')).toBeTruthy()
    expect(screen.getByRole('button', { name: '提示 2 · 规则与思路' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /黑卒，坐标 2,3/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /交叉点 2,4.*可走落点/ })).toBeTruthy()
    expect(document.activeElement?.tagName).toBe('H2')
    fireEvent.click(screen.getByRole('button', { name: /交叉点 2,4.*可走落点/ }))
    expect(loadProgress(localStorage).masteredUnits).toEqual([])
  })

  it('preserves an answered board and its next-stage action across panel switches', () => {
    render(<App />); click('新手课堂'); click('开始原局面练习')
    move('红兵，坐标 0,6', '交叉点 0,5.*可走落点')
    const board = screen.getByRole('group', { name: '象棋棋盘' })
    click('学习总览'); click('章节学习')
    expect(screen.getByRole('group', { name: '象棋棋盘' })).toBe(board)
    expect(screen.getByRole('button', { name: /红兵，坐标 0,5.*上一步/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: '进入未见变式' })).toBeTruthy()
  })

  it('keeps seen challenges across internal chapter jumps and clears positioning requests on exit', () => {
    render(<App />); click('新手课堂'); challenge()
    expect(screen.getByRole('button', { name: '黑卒，坐标 2,3' })).toBeTruthy()
    click('学习总览'); click(`学习本章：${curriculum[1].title}`)
    expect(screen.getByRole('heading', { name: curriculum[1].title })).toBeTruthy()
    click('学习总览'); click(`学习本章：${curriculum[0].title}`); challenge()
    expect(screen.getByRole('button', { name: '红兵，坐标 6,6' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '黑卒，坐标 2,3' })).toBeNull()
    click('学习总览'); click(`学习本章：${curriculum[5].title}`)
    click('开始对弈'); click('新手课堂')
    expect(screen.getByRole('heading', { name: curriculum[0].title })).toBeTruthy()
  })

  it('selects the first unmastered chapter unit and reviews the first unit when all are mastered', () => {
    const progress = defaultProgress()
    progress.masteredUnits = [...curriculum[1].units.map(unit => unit.id), curriculum[5].units[0].id]
    saveProgress(localStorage, progress); render(<App />); openOverview()
    click(`学习本章：${curriculum[5].title}`)
    expect(screen.getByRole('heading', { name: curriculum[5].units[1].title })).toBeTruthy()
    click('学习总览'); click(`复习本章：${curriculum[1].title}`)
    expect(screen.getByRole('heading', { name: curriculum[1].units[0].title })).toBeTruthy()
    expect(screen.getByText('演示 · 先看一遍')).toBeTruthy()
  })

  it('positions the suggested knowledge point within the existing course instance', () => {
    const progress = defaultProgress()
    progress.masteredUnits = curriculum.slice(0, 5).flatMap(chapter => chapter.units.map(unit => unit.id))
    saveProgress(localStorage, progress); render(<App />); click('新手课堂')
    const board = screen.getByRole('group', { name: '象棋棋盘' })
    click('学习总览'); click(`学习：${curriculum[5].units[0].title}`)
    expect(screen.getByRole('heading', { name: curriculum[5].units[0].title })).toBeTruthy()
    expect(screen.getByRole('group', { name: '象棋棋盘' })).toBe(board)
    expect(screen.getByText('演示 · 先看一遍')).toBeTruthy()
  })

  it.each(['single', 'opening', 'tactics'] as const)('every %s overview action opens its existing directory without any storage writes', kind => {
    const progress = defaultProgress()
    progress.practice = startPractice(progress.practice!, { mode: 'recommended' }); saveProgress(localStorage, progress)
    saveOpeningTraining(localStorage, transitionOpeningTraining(defaultOpeningTraining(), { type: 'start', openingId: openings[0].id, side: 'black' }).data)
    saveTactics(localStorage, transitionTactics(defaultTactics(), { type: 'start', request: { mode: 'recommended' } }).data)
    render(<App />)
    // Previously selected alternative modes must not influence overview destinations.
    click('主题练习'); click('多步战术'); openOverview()
    const label = { single: '前往单步练习', opening: '前往开局跟练', tactics: '前往多步战术' }[kind]
    const number = within(overview()).getAllByRole('button', { name: label }).length
    const before = snapshot(), set = vi.spyOn(Storage.prototype, 'setItem'), remove = vi.spyOn(Storage.prototype, 'removeItem')
    for (let index = 0; index < number; index++) {
      fireEvent.click(within(overview()).getAllByRole('button', { name: label })[index])
      expect(screen.getByRole('region', { name: { single: '练习目录', opening: '选择跟练组', tactics: '战术目录' }[kind] })).toBeTruthy()
      expect(screen.queryByRole('group', { name: '象棋棋盘' })).toBeNull()
      if (kind !== 'opening') expect(screen.getByRole('button', { name: kind === 'single' ? '单步练习' : '多步战术' }).getAttribute('aria-pressed')).toBe('true')
      openOverview()
    }
    click('章节学习'); click('学习总览')
    expect(snapshot()).toEqual(before)
    expect(set).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled()
  })

  it('shows unsaved current-page progress after a real write failure without reverting it', () => {
    render(<App />); click('新手课堂')
    const before = snapshot()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    click('开始原局面练习'); move('红兵，坐标 0,6', '交叉点 0,5.*可走落点'); click('学习总览')
    const course = within(overview()).getByRole('region', { name: '课堂进度' })
    expect(course.textContent).toContain('已练未掌握 1 / 21')
    expect(course.textContent).toContain('当前页面未保存记录，刷新可能丢失')
    expect(snapshot()).toEqual(before)
  })

  it('keeps operation tools tied to the formal session while the overview is visible', () => {
    const tools: Record<string, { execute: (input: unknown) => unknown }> = {}
    Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool: (tool: { name: string; execute: (input: unknown) => unknown }) => { tools[tool.name] = tool } } })
    render(<App />); openOverview()
    expect(tools.read_game_state.execute({})).toMatchObject({ moveCount: 0 })
    act(() => { expect(tools.play_move.execute({ from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })).toMatchObject({ ok: true }) })
    expect(screen.queryByRole('region', { name: '学习总览' })).toBeNull()
    expect(loadProgress(localStorage).session.records).toHaveLength(1)
    expect(loadProgress(localStorage).practicedUnits).toEqual([])
  })

  it('cancels the real match worker lifecycle, ignores its late reply and resumes the same session', () => {
    class HeldWorker {
      static instances: HeldWorker[] = []
      request!: { id: number; game: Game }
      onmessage: ((event: { data: { id: number; move: Move } }) => void) | null = null
      terminate = vi.fn()
      constructor() { HeldWorker.instances.push(this) }
      postMessage(request: HeldWorker['request']) { this.request = request }
      reply() { this.onmessage?.({ data: { id: this.request.id, move: legalMoves(this.request.game.board, this.request.game.turn)[0] } }) }
    }
    vi.stubGlobal('Worker', HeldWorker)
    saveProgress(localStorage, { ...defaultProgress(), session: createSession('ai', 'black') })
    render(<App />)
    const old = HeldWorker.instances[0], initial = snapshot()
    openOverview()
    expect(old.terminate).toHaveBeenCalledOnce()
    act(() => old.reply())
    expect(snapshot()).toEqual(initial)
    click('返回当前对局')
    expect(HeldWorker.instances).toHaveLength(2)
    expect(loadProgress(localStorage).session.records).toHaveLength(0)
    act(() => HeldWorker.instances[1].reply())
    expect(loadProgress(localStorage).session.records).toHaveLength(1)
  })
})
