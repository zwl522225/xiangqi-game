// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import { currentTactic, defaultTactics, transitionTactics, type TacticsData } from '../src/core/tactics'
import { TACTICS_KEY, loadTactics, saveTactics } from '../src/core/tactics-storage'
import { tacticFeedback } from '../src/core/tactics-view'
import { legalMoves, tryMove } from '../src/core/rules'
import { defaultPreferences, savePreferences } from '../src/core/preferences'
import type { Move } from '../src/core/types'

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }))
const region = () => screen.getByRole('region', { name: '多步战术' })
const read = () => loadTactics(localStorage).data
const current = () => currentTactic(read())!
function cell(x: number, y: number) { return within(region()).getByLabelText(new RegExp(`^(?:[^，]+，坐标 |交叉点 )${x},${y}(?:，|$)`)) }
function move(value: Move) { fireEvent.click(cell(value.from.x, value.from.y)); fireEvent.click(cell(value.to.x, value.to.y)) }
function open() { const page = render(<App />); click('主题练习'); click('多步战术'); return page }
const topic = (name = '连续将军') => click(`按主题练：${name}`)
function finish() {
  while (!current().item.result) {
    const { view } = current()
    if (view.learnerTurn) move(view.correctMoves.at(-1)!)
    else click('查看对方应手')
  }
}
function wrong() { const { view, item } = current(); return legalMoves(view.game.board, view.game.turn).find(m => tacticFeedback(item.id, item.path, m).status === 'not-goal')! }
function seed(data: TacticsData) { expect(saveTactics(localStorage, data)).toBe(true) }
beforeEach(() => { localStorage.clear(); vi.spyOn(window, 'confirm').mockReturnValue(true) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

describe('multi move tactics interface through the real application', () => {
  it('defaults to single practice and offers the six original puzzles through three topics and bounded rounds', () => {
    render(<App />); click('主题练习')
    expect(screen.getByRole('button', { name: '单步练习' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('region', { name: '多步战术' })).toBeNull()
    click('多步战术')
    expect(within(region()).queryByLabelText('象棋棋盘')).toBeNull()
    expect(within(screen.getByRole('region', { name: '六题战术记录' })).getAllByRole('listitem')).toHaveLength(6)
    expect(localStorage.getItem(TACTICS_KEY)).toBeNull()
    click('战术错题再练'); expect(read().round?.items).toHaveLength(0)
    expect(screen.getByRole('region', { name: '本轮战术小结' }).textContent).toContain('暂无待复习错题')
    click('返回战术目录'); click('推荐战术练习'); expect(read().round?.items).toHaveLength(3)
  })

  it.each(['连续将军', '吃子获利', '解将反击'])('completes both sides of %s with explicit replies and next, preserving actual paths', title => {
    open(); topic(title)
    for (let index = 0; index < 2; index++) {
      const before = current()
      expect(cell(0, 0).style.left).toBe(index === 0 ? '95%' : '5%')
      expect(region().textContent).toContain(`你执${index === 0 ? '黑' : '红'}`)
      expect(region().textContent).toContain(before.view.tactic.objective)
      finish()
      expect(read().round?.index).toBe(index)
      expect(current().item.result).toBe('independent')
      expect(screen.getByText('本轮首次无提示且无错误完成')).toBeTruthy()
      const saved = localStorage.getItem(TACTICS_KEY)
      fireEvent.change(screen.getByRole('slider', { name: '变化回看位置' }), { target: { value: '0' } })
      expect(localStorage.getItem(TACTICS_KEY)).toBe(saved)
      expect(screen.getByRole('region', { name: '战术失子' }).textContent).toContain('第 0 着')
      click(index === 0 ? '下一题' : '查看本轮小结')
    }
    expect(screen.getByRole('region', { name: '本轮战术小结' }).textContent).toContain('独立完成 2')
    expect(read().records.filter(record => record.everIndependent)).toHaveLength(2)
  })

  it('uses all real legal targets, distinguishes illegal submissions, and shows historical error at its own prefix', () => {
    open(); topic()
    const { view } = current(); const bad = wrong()
    fireEvent.click(cell(bad.from.x, bad.from.y))
    expect(cell(bad.to.x, bad.to.y).getAttribute('aria-label')).toContain('可走落点')
    expect(current().item.errors).toBe(0)
    fireEvent.keyDown(cell(bad.from.x, bad.from.y), { key: 'Escape' })
    expect(cell(bad.from.x, bad.from.y).getAttribute('aria-pressed')).toBe('false')
    const illegal = Array.from({ length: 90 }, (_, n) => ({ from: bad.from, to: { x: n % 9, y: Math.floor(n / 9) } })).find(m => view.game.board[m.to.y][m.to.x]?.side !== view.tactic.side && !tryMove(view.game, m).ok)!
    move(illegal); expect(current().item.errors).toBe(1)
    expect(screen.getByRole('status', { name: '战术反馈' }).textContent).not.toContain('合法，但不能保证')
    move(bad); expect(current().item.errors).toBe(2)
    expect(screen.getByRole('status', { name: '战术反馈' }).textContent).toContain('合法，但不能保证')
    const path = current().item.path; move(view.correctMoves[0]); click('查看对方应手')
    expect(screen.getByRole('region', { name: '最近错误提交' }).textContent).toContain(`历史局面：第 ${path.length} 着`)
    click('查看反例'); expect(current().item.refutationViewed).toBe(true)
    expect(screen.getByRole('region', { name: '错误变化回看' }).textContent).toContain('错误提交')
    expect(current().item.path).toHaveLength(2)
  })

  it('expands three branch hints and only one demonstration, locks opponent clicks and does not auto reply', () => {
    open(); topic()
    for (let n = 1; n <= 3; n++) { click(`提示第 ${n} 层`); expect(within(screen.getByRole('list', { name: '本步已展开提示' })).getAllByRole('listitem')).toHaveLength(n) }
    click('示范本步'); expect(current().item.path).toHaveLength(1)
    const value = localStorage.getItem(TACTICS_KEY); move(current().view.reply!)
    expect(localStorage.getItem(TACTICS_KEY)).toBe(value)
    const reply = screen.getByRole('button', { name: '查看对方应手' })
    act(() => { fireEvent.click(reply); fireEvent.click(reply) })
    expect(current().item.path).toHaveLength(2)
    expect(screen.queryByRole('list', { name: '本步已展开提示' })).toBeNull()
    finish(); expect(current().item.result).toBe('assisted')
    expect(screen.getByText('提示、重试或错误后完成')).toBeTruthy()
  })

  it('continues an alternate correct prefix into a marked answer suffix and retries without washing help history', () => {
    open(); topic(); const first = current().view.correctMoves.at(-1)!; move(first)
    click('查看完整变化')
    expect(current().item).toMatchObject({ result: 'revealed', answerFrom: 1 })
    expect(current().item.path[0]).toEqual(first)
    expect(screen.getAllByText(/答案示范后缀/).length).toBeGreaterThan(0)
    click('重新挑战本题'); expect(current().item).toMatchObject({ retried: true, revealed: true, answerFrom: null, path: [] })
    finish(); expect(current().item.result).toBe('assisted')
    click('下一题'); click('跳过本题'); expect(current().item.path).toHaveLength(0)
    expect(screen.getByText('尚无实际走棋记录')).toBeTruthy()
    click('查看本轮小结')
    expect(screen.getByRole('region', { name: '本轮战术小结' }).textContent).toContain('跳过 1')
  })

  it('cancels replacement, retry and reset without losing selected pieces, progress or focus', async () => {
    open(); topic(); const first = current().view.correctMoves[0]; fireEvent.click(cell(first.from.x, first.from.y))
    click('返回战术目录'); const saved = localStorage.getItem(TACTICS_KEY)
    vi.mocked(window.confirm).mockReturnValue(false); const user = userEvent.setup()
    const replacement = screen.getByRole('button', { name: '推荐战术练习' }); await user.click(replacement)
    expect(document.activeElement).toBe(replacement); expect(localStorage.getItem(TACTICS_KEY)).toBe(saved)
    click('继续上轮战术'); fireEvent.click(cell(first.from.x, first.from.y))
    const retry = screen.getByRole('button', { name: '重新挑战本题' }); await user.click(retry)
    expect(document.activeElement).toBe(retry); expect(cell(first.from.x, first.from.y).getAttribute('aria-pressed')).toBe('true')
    const reset = screen.getByRole('button', { name: '重置战术记录' }); await user.click(reset)
    expect(document.activeElement).toBe(reset); expect(localStorage.getItem(TACTICS_KEY)).toBe(saved)
    expect(cell(first.from.x, first.from.y).getAttribute('aria-pressed')).toBe('true')
  })

  it('restores explicitly, keeps mode across navigation, and follows captured display preferences and review position', () => {
    savePreferences(localStorage, { ...defaultPreferences(), boardTheme: 'clear', showCoordinates: true, showCaptured: true })
    const page = open(); topic('解将反击'); click('示范本步'); const saved = localStorage.getItem(TACTICS_KEY)
    expect(screen.getByRole('region', { name: '战术失子' }).textContent).toContain('红马 × 1')
    expect(region().querySelector('.board-frame--clear')).toBeTruthy(); expect(region().querySelectorAll('.board-coordinate')).toHaveLength(38)
    click('新手课堂'); click('主题练习'); expect(region()).toBeTruthy(); click('继续上轮战术')
    expect(current().item.path).toHaveLength(1); page.unmount()
    render(<App />); expect(screen.getByRole('region', { name: '对弈' })).toBeTruthy(); click('主题练习')
    expect(screen.getByRole('button', { name: '单步练习' }).getAttribute('aria-pressed')).toBe('true')
    click('多步战术'); expect(within(region()).queryByLabelText('象棋棋盘')).toBeNull(); click('继续上轮战术')
    expect(localStorage.getItem(TACTICS_KEY)).toBe(saved)
  })

  it('keeps blocked raw storage intact, reports saving separately and resets only after successful clear', () => {
    localStorage.setItem(TACTICS_KEY, '{damaged'); open(); topic(); click('提示第 1 层')
    expect(localStorage.getItem(TACTICS_KEY)).toBe('{damaged')
    expect(screen.getByRole('status', { name: '战术保存状态' }).textContent).toContain('原存档已保留')
    expect(screen.getByRole('status', { name: '战术反馈' }).textContent).toContain('当前已走')
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw Error('blocked') })
    click('重置战术记录'); expect(screen.getByRole('status', { name: '战术保存状态' }).textContent).toContain('重置多步战术失败')
    expect(screen.getByLabelText('象棋棋盘')).toBeTruthy(); remove.mockRestore(); click('重置战术记录')
    expect(localStorage.getItem(TACTICS_KEY)).toBeNull(); expect(within(region()).queryByLabelText('象棋棋盘')).toBeNull()
    expect(window.confirm).toHaveBeenLastCalledWith(expect.stringMatching(/仅.*六题.*本轮/))
  })

  it('retains unsaved memory, displays exact failed reset notice and retries the dirty save', () => {
    open(); topic(); const saved = localStorage.getItem(TACTICS_KEY)
    const native = Storage.prototype.setItem
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key, value) { if (key === TACTICS_KEY) throw Error('quota'); native.call(this, key, value) })
    click('提示第 1 层'); expect(screen.getByRole('status', { name: '战术保存状态' }).textContent).toContain('未保存')
    expect(screen.getByRole('button', { name: '重试保存' })).toBeTruthy()
    expect(localStorage.getItem(TACTICS_KEY)).toBe(saved); click('新手课堂'); click('主题练习'); click('继续上轮战术')
    expect(region().textContent).toContain('当前已走 0 步')
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw Error('blocked') })
    click('重置战术记录'); expect(screen.getByRole('status', { name: '战术保存状态' }).textContent).toContain('重置多步战术失败')
    expect(screen.getByRole('button', { name: '重试保存' })).toBeTruthy()
    set.mockRestore(); remove.mockRestore(); click('重试保存'); expect(current().item.hinted).toBe(true)
    expect(screen.getByRole('status', { name: '战术保存状态' }).textContent).toContain('已保存')
  })

  it('does not call an already saved round unsaved when reset fails', () => {
    open(); topic(); const saved = localStorage.getItem(TACTICS_KEY)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw Error('blocked') })
    click('重置战术记录'); expect(localStorage.getItem(TACTICS_KEY)).toBe(saved)
    expect(screen.getByRole('status', { name: '战术保存状态' }).textContent).toBe('重置多步战术失败，原存档与当前练习已保留，请重试。')
    expect(screen.queryByRole('button', { name: '重试保存' })).toBeNull()
    expect(screen.getByRole('button', { name: '重置战术记录' })).toBeTruthy()
  })

  it('shows pending and reviewed history without changing recorded paths, plus truthful completion flags', () => {
    let data = transitionTactics(defaultTactics(), { type: 'start', request: { mode: 'topic', topic: 'checks' } }).data
    const view = currentTactic(data)!.view; const bad = legalMoves(view.game.board, view.game.turn).find(m => tacticFeedback(view.tactic.id, [], m).status === 'not-goal')!
    data = transitionTactics(data, { type: 'move', move: bad }).data
    data = transitionTactics(data, { type: 'start', request: { mode: 'mistakes' } }).data
    while (!currentTactic(data)!.item.result) { const v = currentTactic(data)!.view; data = transitionTactics(data, v.learnerTurn ? { type: 'move', move: v.correctMoves[0] } : { type: 'reply' }).data }
    data = transitionTactics(data, { type: 'next' }).data; seed(data); open()
    const history = screen.getByRole('region', { name: '六题战术记录' }); expect(history.textContent).toContain('已复习'); expect(history.textContent).toContain('曾独立完成')
    const saved = localStorage.getItem(TACTICS_KEY); click(`回看最近错误：${view.tactic.title}`)
    expect(screen.getByRole('region', { name: '错误变化回看' }).textContent).toContain('历史局面：第 0 着')
    expect(localStorage.getItem(TACTICS_KEY)).toBe(saved)
  })

  it('supports board arrow keys, Enter, Space and Escape and keyboard review controls', async () => {
    open(); topic(); const first = current().view.correctMoves[0]; const user = userEvent.setup(); cell(first.from.x, first.from.y).focus()
    await user.keyboard('{Enter}{Escape} '); expect(cell(first.from.x, first.from.y).getAttribute('aria-pressed')).toBe('true')
    const dx = first.to.x - first.from.x, dy = first.to.y - first.from.y
    await user.keyboard(`${dx > 0 ? '{ArrowLeft}' : '{ArrowRight}'}`.repeat(Math.abs(dx)) + `${dy > 0 ? '{ArrowUp}' : '{ArrowDown}'}`.repeat(Math.abs(dy)) + '{Enter}')
    expect(current().item.path).toHaveLength(1); click('查看完整变化')
    click('回看起点'); expect((screen.getByRole('slider', { name: '变化回看位置' }) as HTMLInputElement).value).toBe('0')
    click('回看下一着'); expect((screen.getByRole('slider', { name: '变化回看位置' }) as HTMLInputElement).value).toBe('1')
  })
})
