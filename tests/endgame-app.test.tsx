import { curriculum } from '../src/content/curriculum'
import { puzzles } from '../src/content/puzzles'
import { encodeLearningBackup, type LearningBackup } from '../src/core/learning-backup'
import { defaultOpeningTraining, transitionOpeningTraining } from '../src/core/opening-training'
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import { endgames } from '../src/content/endgames'
import { defaultEndgameLessons, transitionEndgameLessons } from '../src/core/endgame-lessons'
import { ENDGAME_STORAGE_KEY } from '../src/core/endgame-lessons-storage'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'
import { createSession } from '../src/core/session'
import { legalMoves, type Game } from '../src/core/rules'
import type { Move } from '../src/core/types'
const click = (name: string) => fireEvent.click(screen.getByText(name, { selector: 'button', exact: true }))
const enter = () => click('残局练习')
const begin = () => fireEvent.click(screen.getAllByRole('button', { name: '练 A 题' })[0])
const read = () => JSON.parse(localStorage.getItem(ENDGAME_STORAGE_KEY)!)
class HeldWorker {
  static instances: HeldWorker[] = []
  request!: { id: number; game: Game }
  onmessage: ((event: { data: { id: number; move: Move } }) => void) | null = null
  terminate = vi.fn()
  constructor() { HeldWorker.instances.push(this) }
  postMessage(request: HeldWorker['request']) { this.request = request }
  reply() { this.onmessage?.({ data: { id: this.request.id, move: legalMoves(this.request.game.board, this.request.game.turn)[0] } }) }
}
beforeEach(() => { localStorage.clear(); HeldWorker.instances = []; vi.stubGlobal('Worker', HeldWorker) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete (document as Document & { modelContext?: unknown }).modelContext })
describe('endgame App integration', () => {
  it('defaults to the teaching directory and retains a round through leaving and single-step mode', () => {
    render(<App />); enter()
    expect(screen.getByRole('heading', { name: '残局分步教学' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: '象棋棋盘' })).toBeNull()
    begin(); click('示范本步'); const saved = localStorage.getItem(ENDGAME_STORAGE_KEY)
    click('基础单步题'); expect(screen.queryByRole('heading', { name: '残局分步教学' })).toBeNull()
    click('分步教学'); expect(screen.getByRole('button', { name: '继续上次练习' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: '象棋棋盘' })).toBeNull()
    click('继续上次练习'); expect(screen.getByRole('heading', { name: '轮到对方行棋' })).toBeTruthy()
    click('规则手册'); enter(); expect(screen.getByRole('button', { name: '继续上次练习' })).toBeTruthy()
    expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBe(saved)
    click('继续上次练习'); expect(read().round.ply).toBe(1)
  })
  it('writes only its own key and shows truthful progress in the overview with an explicit directory entry', () => {
    render(<App />)
    const previous = Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]))
    const write = vi.spyOn(Storage.prototype, 'setItem')
    enter(); begin(); click('提示第 1 层'); click('示范本步')
    click('新手课堂'); click('学习总览')
    const card = screen.getByRole('region', { name: '残局分步教学记录' })
    expect(card.textContent).toContain('曾完成 0 / 6')
    expect(card.textContent).toContain('曾本轮无提示且无错误完成 0 / 6')
    expect(card.textContent).toContain('已走 1 / 3 着')
    const pending = screen.getByRole('region', { name: '接下来可以做' })
    expect(pending.textContent).toContain('已走 1 / 3 着')
    expect(pending.textContent).not.toContain('已结束 1 / 3 题')
    fireEvent.click(within(card).getByRole('button', { name: '前往残局分步教学' }))
    expect(screen.getByRole('button', { name: '继续上次练习' })).toBeTruthy()
    expect(write.mock.calls.every(([key]) => key === ENDGAME_STORAGE_KEY)).toBe(true)
    for (const [key, raw] of Object.entries(previous)) expect(localStorage.getItem(key)).toBe(raw)
  })
  it('shows unknown protected history and a temporary round instead of zero historical counts', () => {
    localStorage.setItem(ENDGAME_STORAGE_KEY, 'protected')
    render(<App />); enter(); begin(); click('示范本步')
    click('新手课堂'); click('学习总览')
    const card = screen.getByRole('region', { name: '残局分步教学记录' })
    expect(card.textContent).toContain('记录暂不可恢复')
    expect(card.textContent).toContain('临时练习')
    expect(card.textContent).not.toContain('曾完成 0')
    expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBe('protected')
  })
  it('cancels the formal worker, ignores late replies and resumes the same real position', () => {
    const progress = defaultProgress(); progress.session = createSession('ai', 'black'); saveProgress(localStorage, progress)
    render(<App />); const old = HeldWorker.instances[0]; enter(); expect(old.terminate).toHaveBeenCalled()
    act(() => old.reply()); expect(loadProgress(localStorage).session.records).toHaveLength(0)
    begin(); click('示范本步'); const saved = localStorage.getItem(ENDGAME_STORAGE_KEY)
    expect(HeldWorker.instances).toHaveLength(1)
    click('开始对弈'); expect(HeldWorker.instances).toHaveLength(2)
    const fresh = HeldWorker.instances[1]
    expect(fresh.request.game).toEqual(progress.session.game)
    act(() => fresh.reply())
    const session = loadProgress(localStorage).session
    expect(session.records).toHaveLength(1)
    expect(legalMoves(progress.session.game.board, 'red')).toContainEqual(session.records[0].move)
    enter(); click('继续上次练习'); expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBe(saved)
  })
  it('keeps tools acting on the formal session and retains the teaching round after their navigation', () => {
    type Tool = { name: string; execute: (input: unknown) => unknown }; const tools = new Map<string, Tool>()
    Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool(tool: Tool) { tools.set(tool.name, tool) } } })
    render(<App />); enter(); begin(); click('示范本步'); const saved = localStorage.getItem(ENDGAME_STORAGE_KEY)
    expect(tools.get('read_game_state')!.execute({})).toMatchObject({ moveCount: 0 })
    act(() => { expect(tools.get('play_move')!.execute({ from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })).toMatchObject({ ok: true }) })
    expect(loadProgress(localStorage).session.records).toHaveLength(1)
    enter(); click('继续上次练习'); expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBe(saved)
  })
})

describe('endgame real App backup and old training preservation', () => {
  function openBackup() { click('新手课堂'); click('学习总览'); click('备份与恢复') }
  async function choose(modules: LearningBackup['modules'], version: 1 | 2 = 2) {
    const source: LearningBackup = { format: 'yixiang-learning-backup', version, exportedAt: '2026-10-24T01:02:03.000Z', modules }
    fireEvent.change(screen.getByLabelText('选择学习备份文件'), { target: { files: [new File([encodeLearningBackup(source)], 'learning.json', { type: 'application/json' })] } })
    await screen.findByRole('region', { name: '备份预览' })
  }
  it('preserves all six original single-step puzzles, their completion callbacks and existing records', () => {
    const progress = defaultProgress(); progress.solvedPuzzles = [puzzles[5].id]; saveProgress(localStorage, progress)
    render(<App />); enter(); click('基础单步题')
    expect(screen.getByText('残局题册')).toBeTruthy()
    for (let index = 0; index < puzzles.length; index++) {
      const puzzle = puzzles[index], { from, to } = puzzle.target
      const board = screen.getByRole('group', { name: '象棋棋盘' })
      fireEvent.click(within(board).getByRole('button', { name: new RegExp(`坐标 ${from.x},${from.y}(?:，|$)`) }))
      fireEvent.click(within(board).getByRole('button', { name: new RegExp(`(?:坐标|交叉点) ${to.x},${to.y}(?:，|$)`) }))
      expect(screen.getByText('练习完成', { selector: 'strong' })).toBeTruthy()
      expect(loadProgress(localStorage).solvedPuzzles).toContain(puzzle.id)
      if (index < puzzles.length - 1) click('下一题')
    }
    expect(new Set(loadProgress(localStorage).solvedPuzzles)).toEqual(new Set(puzzles.map(puzzle => puzzle.id)))
    expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBeNull()
  })
  it('cancels and fails a restore without changing raw or memory, then restores without replying or awarding', async () => {
    render(<App />); enter(); begin(); click('示范本步')
    const incoming = transitionEndgameLessons(defaultEndgameLessons(), { type: 'start', id: endgames[1].id }).data
    openBackup(); await choose({ endgame: incoming })
    const previous = read(), formal = localStorage.getItem('xiangqi-progress'), raw = localStorage.getItem(ENDGAME_STORAGE_KEY)
    const original = Storage.prototype.setItem, write = vi.spyOn(Storage.prototype, 'setItem')
    click('恢复残局分步教学'); click('取消恢复')
    expect(write).not.toHaveBeenCalled(); expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBe(raw)
    write.mockImplementation(() => { throw Error('quota') })
    click('恢复残局分步教学'); click('确认恢复残局分步教学')
    expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBe(raw)
    click('返回学习总览'); fireEvent.click(within(screen.getByRole('region', { name: '残局分步教学记录' })).getByRole('button', { name: '前往残局分步教学' }))
    click('继续上次练习'); expect(screen.getByRole('heading', { name: '轮到对方行棋' })).toBeTruthy(); expect(read()).toEqual(previous)
    write.mockImplementation(original); openBackup(); await choose({ endgame: incoming })
    write.mockClear(); click('恢复残局分步教学'); click('确认恢复残局分步教学')
    expect(write.mock.calls.map(([key]) => key)).toEqual([ENDGAME_STORAGE_KEY])
    expect(read()).toEqual(incoming); expect(localStorage.getItem('xiangqi-progress')).toBe(formal)
    click('返回学习总览'); fireEvent.click(within(screen.getByRole('region', { name: '残局分步教学记录' })).getByRole('button', { name: '前往残局分步教学' }))
    click('继续上次练习'); expect(screen.getByText(`${endgames[1].title} · 你执黑`)).toBeTruthy()
    expect(read().round.ply).toBe(0)
  })
  it('restores old version 1 modules without touching the endgame key or controller memory', async () => {
    render(<App />); enter(); begin(); click('提示第 1 层'); const raw = localStorage.getItem(ENDGAME_STORAGE_KEY)
    openBackup(); await choose({ opening: transitionOpeningTraining(defaultOpeningTraining(), { type: 'start', openingId: 'central-cannon', side: 'red' }).data }, 1)
    const write = vi.spyOn(Storage.prototype, 'setItem')
    click('恢复开局跟练'); click('确认恢复开局跟练')
    expect(write.mock.calls.some(([key]) => key === ENDGAME_STORAGE_KEY)).toBe(false)
    expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBe(raw)
    click('返回学习总览'); fireEvent.click(within(screen.getByRole('region', { name: '残局分步教学记录' })).getByRole('button', { name: '前往残局分步教学' }))
    click('继续上次练习'); expect(screen.getByRole('button', { name: '提示第 2 层' })).toBeTruthy()
  })
  it('writes even default backup data before releasing a blocked original', async () => {
    localStorage.setItem(ENDGAME_STORAGE_KEY, 'protected')
    render(<App />); openBackup()
    expect((screen.getByLabelText('残局分步教学') as HTMLInputElement).disabled).toBe(true)
    await choose({ endgame: defaultEndgameLessons() })
    const original = Storage.prototype.setItem, write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota') })
    click('恢复残局分步教学'); expect(screen.getByRole('dialog').textContent).toContain('受保护存档'); click('确认恢复残局分步教学')
    expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBe('protected')
    expect((screen.getByLabelText('残局分步教学') as HTMLInputElement).disabled).toBe(true)
    write.mockImplementation(original); write.mockClear()
    click('恢复残局分步教学'); click('确认恢复残局分步教学')
    expect(write.mock.calls.map(([key]) => key)).toEqual([ENDGAME_STORAGE_KEY])
    expect(read()).toEqual(defaultEndgameLessons())
    expect((screen.getByLabelText('残局分步教学') as HTMLInputElement).disabled).toBe(false)
  })
  it('keeps the mounted course challenge, hint and seen variants when only endgame is restored', async () => {
    render(<App />); click('新手课堂'); click('开始原局面练习')
    fireEvent.click(screen.getByRole('button', { name: '红兵，坐标 0,6' })); fireEvent.click(screen.getByRole('button', { name: /交叉点 0,5.*可走落点/ }))
    click('进入未见变式'); click('提示 1 · 观察')
    const board = screen.getByRole('group', { name: '象棋棋盘' })
    click('学习总览'); click('备份与恢复')
    await choose({ endgame: transitionEndgameLessons(defaultEndgameLessons(), { type: 'start', id: endgames[0].id }).data })
    click('恢复残局分步教学'); click('确认恢复残局分步教学'); click('返回学习总览'); click('章节学习')
    expect(screen.getByRole('group', { name: '象棋棋盘' })).toBe(board)
    expect(screen.getByRole('button', { name: '提示 2 · 规则与思路' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '黑卒，坐标 2,3' })).toBeTruthy()
    click('学习总览'); click(`学习本章：${curriculum[1].title}`)
    click('学习总览'); click(`学习本章：${curriculum[0].title}`); click('开始原局面练习')
    fireEvent.click(screen.getByRole('button', { name: '红兵，坐标 0,6' })); fireEvent.click(screen.getByRole('button', { name: /交叉点 0,5.*可走落点/ }))
    click('进入未见变式')
    expect(screen.getByRole('button', { name: '红兵，坐标 6,6' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '黑卒，坐标 2,3' })).toBeNull()
  })
})
