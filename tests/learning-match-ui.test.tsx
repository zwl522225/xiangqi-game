// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../src/ui/App'
import { createSession, play, resign, setView } from '../src/core/session'
import type { Session } from '../src/core/session'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'
import { setCoachEnabled, startLearningMatch } from '../src/core/learning'
import * as learning from '../src/core/learning'
import { createGame } from '../src/core/rules'
import { puzzles } from '../src/content/puzzles'
import { curriculum } from '../src/content/curriculum'

const cycle = [
  { from: { x: 0, y: 9 }, to: { x: 0, y: 8 } },
  { from: { x: 0, y: 0 }, to: { x: 0, y: 1 } },
  { from: { x: 0, y: 8 }, to: { x: 0, y: 9 } },
  { from: { x: 0, y: 1 }, to: { x: 0, y: 0 } },
]
const games = new Map<string, Session>()
function matchAt(plies: number, playerSide: 'red' | 'black' = 'red'): Session {
  const key = `${plies}-${playerSide}`
  const cached = games.get(key)
  if (cached) return cached
  let session = createSession('ai', playerSide)
  for (let index = 0; index < plies; index++) {
    const result = play(session, cycle[index % 4])
    if (!result.ok) throw new Error(result.error)
    session = result.session
  }
  games.set(key, session)
  return session
}
function seed(plies: number, coach = false, playerSide: 'red' | 'black' = 'red') {
  const progress = setCoachEnabled(startLearningMatch(defaultProgress(), createSession('ai', playerSide)), coach)
  const next = { ...progress, session: matchAt(plies, playerSide) }
  saveProgress(localStorage, next)
  return next
}

function connectTools() {
  const registered = new Map<string, { execute: (input: unknown) => unknown }>()
  Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool: (tool: { name: string; execute: (input: unknown) => unknown }) => registered.set(tool.name, tool) } })
  return registered
}

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); delete (document as Document & { modelContext?: unknown }).modelContext })

describe('learning match', { timeout: 15000 }, () => {
  it('toggles observations without moving and keeps coach history after closing, undoing and reloading', async () => {
    seed(4)
    const user = userEvent.setup()
    const page = render(<App />)
    const before = loadProgress(localStorage).session
    await user.click(screen.getByRole('button', { name: '开启实战教练' }))
    const coach = screen.getByRole('region', { name: '实战教练' })
    expect(within(coach).getByText(/先看将帅安全/)).toBeTruthy()
    expect(loadProgress(localStorage).session).toEqual(before)
    await user.click(screen.getByRole('button', { name: '关闭实战教练' }))
    expect(loadProgress(localStorage).session).toEqual(before)
    await user.click(screen.getByRole('button', { name: '悔棋' }))
    expect(loadProgress(localStorage).learningMatch?.coachEverUsed).toBe(true)
    const saved = loadProgress(localStorage).session
    page.unmount()
    render(<App />)
    expect(screen.getByRole('button', { name: '开启实战教练' })).toBeTruthy()
    expect(loadProgress(localStorage).learningMatch).toMatchObject({ coachEnabled: false, coachEverUsed: true })
    expect(loadProgress(localStorage).session).toEqual(saved)
  })

  it.each(['重新开局', '执红对电脑', '本机双人'])('resets match metadata when starting with %s', async label => {
    seed(4, true)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: label }))
    const next = loadProgress(localStorage)
    expect(next.session.records).toHaveLength(0)
    expect(next.learningMatch).toMatchObject({ coachEverUsed: false, coachEnabled: false, checkpointSeen: false, active: label !== '本机双人' })
  })

  it('keeps the new local match playable when switching while the computer is thinking', async () => {
    seed(0, true, 'black')
    vi.stubGlobal('Worker', class { postMessage() {} terminate() {} })
    const setTimeout = window.setTimeout.bind(window)
    vi.spyOn(window, 'setTimeout').mockImplementation((handler, delay, ...args) => setTimeout(handler, delay === 1400 ? 60000 : delay, ...args))
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getAllByRole('status').find(element => element.classList.contains('status-line'))!.textContent).toBe('电脑正在思考…')
    await user.click(screen.getByRole('button', { name: '本机双人' }))
    expect(screen.getAllByRole('status').find(element => element.classList.contains('status-line'))!.textContent).toBe('本机双人对局开始。')
    await user.click(screen.getByRole('button', { name: '红兵，坐标 0,6' }))
    await user.click(screen.getByRole('button', { name: /交叉点 0,5.*可走落点/ }))
    expect(loadProgress(localStorage).session.records).toHaveLength(1)
    expect(loadProgress(localStorage).learningMatch?.coachEverUsed).toBe(false)
  })

  it('resets coach history for an opening position and preserves the cancel protection', async () => {
    seed(4, true)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '棋路馆' }))
    await user.click(screen.getByRole('button', { name: '下一着' }))
    await user.click(screen.getByRole('button', { name: '从此局面练习' }))
    expect(loadProgress(localStorage).learningMatch?.coachEverUsed).toBe(true)
    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '从此局面练习' }))
    expect(loadProgress(localStorage).learningMatch).toMatchObject({ active: false, coachEverUsed: false, coachEnabled: false, standardStart: false })
  })

  it('shows the ten full turn reminder once when the twentieth ply is played, persists it and preserves the game on reload', async () => {
    seed(18)
    vi.stubGlobal('Worker', class {
      onmessage: ((event: { data: { move: typeof cycle[number] } }) => void) | null = null
      postMessage() { this.onmessage?.({ data: { move: cycle[3] } }) }
      terminate() {}
    })
    const user = userEvent.setup()
    const page = render(<App />)
    await user.click(screen.getByRole('button', { name: /红车，坐标 0,8/ }))
    await user.click(screen.getByRole('button', { name: /交叉点 0,9.*可走落点/ }))
    const checkpoint = await screen.findByRole('region', { name: '十回合提醒' })
    expect(within(checkpoint).getByText(/20 着.*10 个完整回合/)).toBeTruthy()
    expect(loadProgress(localStorage).learningMatch?.checkpointSeen).toBe(true)
    await user.click(within(checkpoint).getByRole('button', { name: '继续下棋' }))
    expect(screen.queryByRole('region', { name: '十回合提醒' })).toBeNull()
    const saved = loadProgress(localStorage).session
    page.unmount()
    render(<App />)
    expect(screen.queryByRole('region', { name: '十回合提醒' })).toBeNull()
    expect(loadProgress(localStorage).session).toEqual(saved)
  })

  it('waits to mark the checkpoint seen until the reminder is visible beside the board', async () => {
    seed(18)
    let reply: (() => void) | undefined
    vi.stubGlobal('Worker', class {
      onmessage: ((event: { data: { move: typeof cycle[number] } }) => void) | null = null
      postMessage() { reply = () => this.onmessage?.({ data: { move: cycle[3] } }) }
      terminate() {}
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /红车，坐标 0,8/ }))
    await user.click(screen.getByRole('button', { name: /交叉点 0,9.*可走落点/ }))
    await user.click(screen.getByRole('button', { name: '术语词典' }))
    act(() => reply?.())
    expect(loadProgress(localStorage).session.records).toHaveLength(20)
    expect(screen.queryByRole('region', { name: '十回合提醒' })).toBeNull()
    expect(loadProgress(localStorage).learningMatch?.checkpointSeen).toBe(false)
    await user.click(screen.getByRole('button', { name: '返回棋局工具' }))
    expect(screen.getByRole('region', { name: '十回合提醒' })).toBeTruthy()
    expect(loadProgress(localStorage).learningMatch?.checkpointSeen).toBe(true)
  })

  it('uses the actual move count when restoring an unseen checkpoint beyond twenty plies', () => {
    seed(22)
    render(<App />)
    const checkpoint = screen.getByRole('region', { name: '十回合提醒' })
    expect(within(checkpoint).getByText(/22 着.*11 个完整回合/)).toBeTruthy()
    expect(within(checkpoint).getByText(/可以继续下棋，刷新后可恢复本局/)).toBeTruthy()
    expect(loadProgress(localStorage).learningMatch?.checkpointSeen).toBe(true)
  })

  it.each([false, true])('awards a real terminal match, keeping independent eligibility tied to coach history (%s)', async coached => {
    seed(119, coached, 'black')
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /黑车，坐标 0,1/ }))
    await user.click(screen.getByRole('button', { name: /交叉点 0,0.*可走落点/ }))
    expect(loadProgress(localStorage).milestones).toEqual({ firstMatch: true, independentMatch: !coached })
    const summary = screen.getByRole('region', { name: '本局小结' })
    expect(within(summary).getByText(/120 着.*60 个完整回合/)).toBeTruthy()
    expect(within(summary).getByText(/连续 120 着没有吃子.*自然限着/)).toBeTruthy()
    expect(within(summary).getByText('已完成首盘')).toBeTruthy()
    expect(within(summary).queryByText('已完成独立首盘') !== null).toBe(!coached)
    await user.click(within(summary).getByRole('button', { name: '从头回看棋谱' }))
    expect(screen.getByText('回看开局 · 红方行棋')).toBeTruthy()
    expect(within(summary).getByText(/120 着.*60 个完整回合/)).toBeTruthy()
    await user.click(within(summary).getByRole('button', { name: '返回课堂复习' }))
    expect(screen.getByRole('heading', { name: '01 · 棋盘与先后手' })).toBeTruthy()
  })

  it('recovers pending terminal awards once and avoids replay during ordinary moves and review', async () => {
    seed(118)
    const award = vi.spyOn(learning, 'awardMatchMilestones')
    const user = userEvent.setup()
    let page = render(<App />)
    await user.click(screen.getByRole('button', { name: '开启实战教练' }))
    await user.click(screen.getByRole('button', { name: '关闭实战教练' }))
    await user.click(screen.getByRole('button', { name: '上一步' }))
    expect(award).not.toHaveBeenCalled()
    page.unmount()
    seed(120)
    page = render(<App />)
    expect(loadProgress(localStorage).milestones).toEqual({ firstMatch: true, independentMatch: true })
    expect(award).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: '上一步' }))
    expect(award).toHaveBeenCalledTimes(1)
    page.unmount()
    render(<App />)
    expect(award).toHaveBeenCalledTimes(1)
  })

  it('uses the same terminal award path for the registered move tool without resetting coach history', async () => {
    seed(119, true, 'black')
    const registered = new Map<string, { execute: (input: unknown) => unknown }>()
    Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool: (tool: { name: string; execute: (input: unknown) => unknown }) => registered.set(tool.name, tool) } })
    render(<App />)
    act(() => { expect(registered.get('play_move')?.execute(cycle[3])).toMatchObject({ ok: true }) })
    await waitFor(() => expect(loadProgress(localStorage).milestones).toEqual({ firstMatch: true, independentMatch: false }))
    expect(loadProgress(localStorage).learningMatch?.coachEverUsed).toBe(true)
    expect(screen.getByRole('region', { name: '本局小结' })).toBeTruthy()
  })

  it('awards first match but not independent match when a successful tool completes an uncoached standard game', () => {
    seed(119, false, 'black')
    const tools = connectTools()
    const award = vi.spyOn(learning, 'awardMatchMilestones')
    const page = render(<App />)
    act(() => { expect(tools.get('play_move')?.execute(cycle[3])).toMatchObject({ ok: true }) })
    expect(loadProgress(localStorage).milestones).toEqual({ firstMatch: true, independentMatch: false })
    expect(loadProgress(localStorage).learningMatch).toMatchObject({ toolMoveUsed: true, coachEverUsed: false })
    const summary = screen.getByRole('region', { name: '本局小结' })
    expect(within(summary).getByText(/本局曾使用工具代走.*不计独立首盘/)).toBeTruthy()
    expect(within(summary).queryByText('已完成独立首盘')).toBeNull()
    expect(award).toHaveBeenCalledTimes(1)
    page.unmount()
    render(<App />)
    expect(loadProgress(localStorage).learningMatch?.toolMoveUsed).toBe(true)
    expect(award).toHaveBeenCalledTimes(1)
  })

  it('keeps tool history through undo to zero, coach toggles and reload, then clears it for a new AI match', async () => {
    seed(0)
    vi.stubGlobal('Worker', class {
      onmessage: ((event: { data: { move: typeof cycle[number] } }) => void) | null = null
      postMessage() { this.onmessage?.({ data: { move: cycle[1] } }) }
      terminate() {}
    })
    const tools = connectTools()
    const user = userEvent.setup()
    const page = render(<App />)
    act(() => { expect(tools.get('play_move')?.execute(cycle[0])).toMatchObject({ ok: true }) })
    expect(loadProgress(localStorage).session.records).toHaveLength(2)
    expect(loadProgress(localStorage).learningMatch).toMatchObject({ toolMoveUsed: true, coachEverUsed: false })
    await user.click(screen.getByRole('button', { name: '悔棋' }))
    expect(loadProgress(localStorage).session.records).toHaveLength(0)
    page.unmount()
    render(<App />)
    expect(loadProgress(localStorage).learningMatch).toMatchObject({ toolMoveUsed: true, coachEverUsed: false })
    expect(screen.getByText(/本局曾使用工具代走/)).toBeTruthy()
    expect(screen.queryByText(/可记录独立首盘/)).toBeNull()
    await user.click(screen.getByRole('button', { name: '开启实战教练' }))
    await user.click(screen.getByRole('button', { name: '关闭实战教练' }))
    expect(loadProgress(localStorage).learningMatch).toMatchObject({ toolMoveUsed: true, coachEnabled: false })
    await user.click(screen.getByRole('button', { name: '执红对电脑' }))
    expect(loadProgress(localStorage).learningMatch).toMatchObject({ toolMoveUsed: false, coachEverUsed: false })
  })

  it('does not mark tool history for reads, rejected moves or successful local moves', async () => {
    seed(0)
    const tools = connectTools()
    const user = userEvent.setup()
    render(<App />)
    act(() => {
      expect(tools.get('read_game_state')?.execute({})).toMatchObject({ moveCount: 0 })
      expect(tools.get('play_move')?.execute({ from: { x: 0, y: 9 }, to: { x: 1, y: 8 } })).toMatchObject({ ok: false })
    })
    expect(loadProgress(localStorage).learningMatch?.toolMoveUsed).toBe(false)
    expect(loadProgress(localStorage).learningMatch?.coachEverUsed).toBe(false)
    await user.click(screen.getByRole('button', { name: '本机双人' }))
    act(() => { expect(tools.get('play_move')?.execute(cycle[0])).toMatchObject({ ok: true }) })
    expect(loadProgress(localStorage).learningMatch?.toolMoveUsed).toBe(false)
  })

  it('keeps independent eligibility when the player clicks a move and the AI worker completes the real terminal game', async () => {
    seed(118)
    vi.stubGlobal('Worker', class {
      onmessage: ((event: { data: { move: typeof cycle[number] } }) => void) | null = null
      postMessage() { this.onmessage?.({ data: { move: cycle[3] } }) }
      terminate() {}
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /红车，坐标 0,8/ }))
    await user.click(screen.getByRole('button', { name: /交叉点 0,9.*可走落点/ }))
    expect(loadProgress(localStorage).session.records).toHaveLength(120)
    expect(loadProgress(localStorage).learningMatch).toMatchObject({ toolMoveUsed: false, coachEverUsed: false })
    expect(loadProgress(localStorage).milestones).toEqual({ firstMatch: true, independentMatch: true })
  })

  it('shows resignation normally without awarding, including when the learner reviews the opening', async () => {
    const progress = seed(4)
    saveProgress(localStorage, { ...progress, session: setView(resign(progress.session, 'red'), 0) })
    render(<App />)
    const summary = screen.getByRole('region', { name: '本局小结' })
    expect(within(summary).getByText(/红方认输.*黑方获胜/)).toBeTruthy()
    expect(within(summary).getByText(/4 着.*2 个完整回合/)).toBeTruthy()
    expect(loadProgress(localStorage).milestones).toEqual({ firstMatch: false, independentMatch: false })
    expect(within(summary).queryByText('已完成首盘')).toBeNull()
    expect(screen.getByText('回看开局 · 红方行棋')).toBeTruthy()
    const user = userEvent.setup()
    await user.click(within(summary).getByRole('button', { name: '查看结束规则' }))
    expect(screen.getByRole('heading', { name: '规则手册' })).toBeTruthy()
  })

  it('does not claim a milestone for a forged or nonstandard terminal result', () => {
    const progress = seed(0)
    const game = { ...progress.session.game, result: { winner: 'red' as const, reason: 'checkmate' as const } }
    saveProgress(localStorage, { ...progress, session: { ...progress.session, game, snapshots: [game] } })
    render(<App />)
    expect(screen.getByRole('region', { name: '本局小结' })).toBeTruthy()
    expect(screen.queryByText('已完成首盘')).toBeNull()
    expect(loadProgress(localStorage).milestones.firstMatch).toBe(false)
  })

  it.each(['mate', 'stalemate'])('explains the real %s loss from a nonstandard position without awarding a first match', async id => {
    const puzzle = puzzles.find(item => item.id === id)!
    const game = createGame(puzzle.board, puzzle.turn)
    const session = { ...createSession('ai'), game, snapshots: [game] }
    saveProgress(localStorage, startLearningMatch(defaultProgress(), session))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: `红车，坐标 ${puzzle.target.from.x},${puzzle.target.from.y}` }))
    await user.click(screen.getByRole('button', { name: new RegExp(`交叉点 ${puzzle.target.to.x},${puzzle.target.to.y}.*可走落点`) }))
    const summary = screen.getByRole('region', { name: '本局小结' })
    expect(within(summary).getByText(id === 'mate' ? /黑方被将军且没有合法应将着法.*红方获胜/ : /黑方虽未被将军.*没有任何合法着法.*判负.*红方获胜/)).toBeTruthy()
    expect(within(summary).getByText(/1 着.*0 个完整回合.*另有 1 着/)).toBeTruthy()
    expect(loadProgress(localStorage).milestones).toEqual({ firstMatch: false, independentMatch: false })
    await user.click(within(summary).getByRole('button', { name: '查看结束规则' }))
    expect(screen.getByRole('heading', { name: id === 'mate' ? '将死' : '困毙' })).toBeTruthy()
  })

  it('shows an agreed draw with no milestone', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '提和' }))
    await user.click(screen.getByRole('button', { name: '接受提和' }))
    const summary = screen.getByRole('region', { name: '本局小结' })
    expect(within(summary).getByText('双方同意议和，本局和棋。')).toBeTruthy()
    expect(loadProgress(localStorage).milestones).toEqual({ firstMatch: false, independentMatch: false })
  })

  it('counts actual sides in the summary even when a nonstandard game starts with black', () => {
    const game = createGame(createSession().game.board, 'black')
    let session: Session = { ...createSession(), game, snapshots: [game] }
    for (const move of [cycle[1], cycle[0], cycle[3]]) {
      const result = play(session, move)
      if (!result.ok) throw new Error(result.error)
      session = result.session
    }
    saveProgress(localStorage, { ...defaultProgress(), session: resign(session, 'black') })
    render(<App />)
    const summary = screen.getByRole('region', { name: '本局小结' })
    expect(within(summary).getByText(/红方 1 着.*黑方 2 着/)).toBeTruthy()
    expect(within(summary).getByText(/共 3 着.*1 个完整回合.*另有 1 着/)).toBeTruthy()
  })

  it('opens the natural-limit course unit directly and resets the target on ordinary course navigation', async () => {
    seed(120)
    const user = userEvent.setup()
    render(<App />)
    const summary = screen.getByRole('region', { name: '本局小结' })
    expect(within(summary).getByText(/红方 60 着.*黑方 60 着/)).toBeTruthy()
    const related = within(summary).getByRole('region', { name: '本局相关课程' })
    expect(within(related).getByText('本局达到自然限着。')).toBeTruthy()
    expect(within(related).queryByRole('button', { name: '复习：认出将军' })).toBeNull()
    expect(within(related).queryByRole('button', { name: '复习：吃到指定棋子' })).toBeNull()
    await user.click(within(related).getByRole('button', { name: '复习：困毙与两类和棋' }))
    expect(screen.getByRole('heading', { name: '困毙与两类和棋' })).toBeTruthy()
    expect(screen.getByText('演示 · 先看一遍')).toBeTruthy()
    expect(loadProgress(localStorage).practicedUnits).toEqual([])
    await user.click(screen.getByRole('button', { name: '开始对弈' }))
    await user.click(screen.getByRole('button', { name: '新手课堂' }))
    expect(screen.getByRole('heading', { name: '交叉点与轮流行棋' })).toBeTruthy()
  })

  it('offers only courses supported by the real terminal reason and recorded checks and captures', async () => {
    const unit = curriculum.flatMap(chapter => chapter.units).find(value => value.id === 'checkmate')!
    if (unit.demo.kind !== 'move') throw new Error('expected a move task')
    const game = createGame(unit.demo.board, unit.demo.turn)
    const initial = { ...createSession(), game, snapshots: [game] }
    const result = play(initial, unit.demo.solutions[0])
    if (!result.ok) throw new Error(result.error)
    expect(result.session.records[0]).toMatchObject({ captured: true, check: true })
    saveProgress(localStorage, { ...defaultProgress(), session: result.session })
    const user = userEvent.setup()
    render(<App />)
    const related = screen.getByRole('region', { name: '本局相关课程' })
    expect(within(related).getByText('本局以将死结束。')).toBeTruthy()
    expect(within(related).getByText('棋谱记录了 1 次将军。')).toBeTruthy()
    expect(within(related).getByText('棋谱记录了 1 次吃子。')).toBeTruthy()
    expect(within(related).getAllByRole('button')).toHaveLength(3)
    for (const title of ['将死', '认出将军', '吃到指定棋子']) {
      await user.click(screen.getByRole('button', { name: `复习：${title}` }))
      expect(screen.getByRole('heading', { name: title })).toBeTruthy()
      expect(screen.getByText('演示 · 先看一遍')).toBeTruthy()
      await user.click(screen.getByRole('button', { name: '开始对弈' }))
    }
    expect(loadProgress(localStorage).session).toEqual(result.session)
    expect(loadProgress(localStorage).practicedUnits).toEqual([])
    expect(loadProgress(localStorage).milestones.firstMatch).toBe(false)
  })

  it('opens the stalemate knowledge point rather than the first unit of its chapter', async () => {
    const puzzle = puzzles.find(value => value.id === 'stalemate')!
    const game = createGame(puzzle.board, puzzle.turn)
    const result = play({ ...createSession(), game, snapshots: [game] }, puzzle.target)
    if (!result.ok) throw new Error(result.error)
    saveProgress(localStorage, { ...defaultProgress(), session: result.session })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '复习：困毙' }))
    expect(screen.getByRole('heading', { name: '困毙' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '将死' })).toBeNull()
    expect(screen.getByText('演示 · 先看一遍')).toBeTruthy()
  })
})
