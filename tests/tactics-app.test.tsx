// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'
import { createSession, play } from '../src/core/session'
import { defaultPreferences, savePreferences } from '../src/core/preferences'
import { createStudy } from '../src/core/study'
import { saveStudy } from '../src/core/study-storage'
import { defaultOpeningTraining, transitionOpeningTraining } from '../src/core/opening-training'
import { saveOpeningTraining } from '../src/core/opening-training-storage'
import { legalMoves, type Game } from '../src/core/rules'
import { currentTactic } from '../src/core/tactics'
import { TACTICS_KEY, loadTactics } from '../src/core/tactics-storage'
import type { Move } from '../src/core/types'

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }))
function enter() { click('主题练习'); click('多步战术') }
class HeldWorker {
  static instances: HeldWorker[] = []
  request!: { id: number; game: Game }
  onmessage: ((event: { data: { id: number; move: Move } }) => void) | null = null
  terminate = vi.fn()
  constructor() { HeldWorker.instances.push(this) }
  postMessage(request: HeldWorker['request']) { this.request = request }
  reply() { this.onmessage?.({ data: { id: this.request.id, move: legalMoves(this.request.game.board, this.request.game.turn)[0] } }) }
}
beforeEach(() => { localStorage.clear(); HeldWorker.instances = []; vi.stubGlobal('Worker', HeldWorker); vi.spyOn(window, 'confirm').mockReturnValue(true) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); delete (document as Document & { modelContext?: unknown }).modelContext })

describe('tactics application isolation', () => {
  it('keeps formal progress, study, opening training and preferences byte-identical with no writes from tactics', () => {
    const progress = defaultProgress(); const played = play(createSession(), { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } }); if (!played.ok) throw Error(played.error)
    progress.session = played.session; progress.completedLessons = ['welcome']; progress.solvedPuzzles = ['puzzle']
    saveProgress(localStorage, progress); savePreferences(localStorage, { ...defaultPreferences(), boardTheme: 'clear', showCoordinates: true })
    const study = createStudy(progress.session, { kind: 'match', title: '正式草稿', orientation: 'black' }); if (!study.ok) throw Error(study.error); saveStudy(localStorage, study.value)
    saveOpeningTraining(localStorage, transitionOpeningTraining(defaultOpeningTraining(), { type: 'start', openingId: 'central-cannon', side: 'red' }).data)
    render(<App />)
    const snapshots = Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]))
    const writes = vi.spyOn(Storage.prototype, 'setItem'); enter(); click('按主题练：连续将军'); click('提示第 1 层'); click('示范本步'); click('查看对方应手'); click('查看完整变化'); click('下一题'); click('跳过本题'); click('查看本轮小结')
    expect(writes.mock.calls.every(([key]) => key === TACTICS_KEY)).toBe(true)
    for (const [key, value] of Object.entries(snapshots)) expect(localStorage.getItem(key)).toBe(value)
    click('开始对弈'); expect(loadProgress(localStorage).session.records).toHaveLength(1)
  })

  it('terminates the formal worker, ignores its late reply, creates no training workers and resumes formal AI', () => {
    const progress = defaultProgress(); progress.session = createSession('ai', 'black'); saveProgress(localStorage, progress)
    render(<App />); const old = HeldWorker.instances[0]; enter(); expect(old.terminate).toHaveBeenCalled()
    act(() => old.reply()); expect(loadProgress(localStorage).session.records).toHaveLength(0)
    click('按主题练：连续将军'); click('示范本步'); click('查看对方应手'); const saved = localStorage.getItem(TACTICS_KEY)
    expect(HeldWorker.instances).toHaveLength(1); expect(screen.getAllByLabelText('象棋棋盘')).toHaveLength(1)
    click('开始对弈'); expect(HeldWorker.instances).toHaveLength(2); act(() => HeldWorker.instances[1].reply())
    expect(loadProgress(localStorage).session.records).toHaveLength(1)
    click('主题练习'); click('继续上轮战术'); expect(localStorage.getItem(TACTICS_KEY)).toBe(saved)
  })

  it('keeps registered tools scoped to the formal game and preserves the training round through tool navigation', () => {
    type Tool = { name: string; execute: (input: unknown) => unknown }; const tools = new Map<string, Tool>()
    Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool(tool: Tool) { tools.set(tool.name, tool) } } })
    render(<App />); enter(); click('推荐战术练习'); click('示范本步'); const saved = localStorage.getItem(TACTICS_KEY)
    expect(tools.size).toBe(2); expect(tools.get('read_game_state')!.execute({})).toMatchObject({ moveCount: 0, turn: 'red' })
    act(() => { expect(tools.get('play_move')!.execute({ from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })).toMatchObject({ ok: true }) })
    expect(screen.getByRole('region', { name: '对弈' })).toBeTruthy(); expect(loadProgress(localStorage).session.records).toHaveLength(1)
    click('主题练习'); click('继续上轮战术'); expect(localStorage.getItem(TACTICS_KEY)).toBe(saved)
    expect(currentTactic(loadTactics(localStorage).data)?.item.path).toHaveLength(1)
  })
})
