// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OpeningLibrary } from '../src/ui/Library'
import { useOpeningTraining } from '../src/ui/useOpeningTraining'
import { defaultOpeningTraining, transitionOpeningTraining, type OpeningTrainingData } from '../src/core/opening-training'
import { OPENING_TRAINING_KEY, loadOpeningTraining, saveOpeningTraining } from '../src/core/opening-training-storage'
import { openings } from '../src/content/openings'
import type { Move, Side } from '../src/core/types'
import { BoardDisplayProvider } from '../src/ui/BoardDisplayContext'

function Harness() {
  const training = useOpeningTraining()
  return <BoardDisplayProvider value={{ boardTheme: 'clear', showCoordinates: true, showCaptured: true }}><OpeningLibrary onPractice={vi.fn()} training={training} /></BoardDisplayProvider>
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true, hidden: true }))
const training = () => screen.getByRole('region', { name: '开局跟练' })
function cell(x: number, y: number) { return within(training()).getByLabelText(new RegExp(`^(?:[^，]+，坐标 |交叉点 )${x},${y}(?:，|$)`)) }
function move(value: Move) { fireEvent.click(cell(value.from.x, value.from.y)); fireEvent.click(cell(value.to.x, value.to.y)) }
function open() { render(<Harness />); click('开局跟练') }
function start(side: Side = 'red', id = openings[0].id) {
  fireEvent.change(screen.getByLabelText('跟练路线'), { target: { value: id } })
  fireEvent.change(screen.getByLabelText('跟练执棋方'), { target: { value: side } })
  click('开始跟练')
}
const read = () => loadOpeningTraining(localStorage).data
function seed(data: OpeningTrainingData) { expect(saveOpeningTraining(localStorage, data)).toBe(true) }
function active(side: Side = 'red') { return transitionOpeningTraining(defaultOpeningTraining(), { type: 'start', openingId: openings[0].id, side }).data }
function finish(side: Side) {
  for (let ply = 0; ply < 8; ply++) {
    if ((ply % 2 === 0) === (side === 'red')) move(openings[0].steps[ply].move)
    else click(`查看${side === 'red' ? '黑' : '红'}方应手`)
  }
}
beforeEach(() => { localStorage.clear(); vi.spyOn(window, 'confirm').mockReturnValue(true) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

describe('guided opening training interface', () => {
  it('keeps the eight-ply demonstration contract and requires explicit selection/start in training', () => {
    render(<Harness />)
    expect(screen.getByRole('heading', { name: '中炮起手' })).toBeTruthy()
    click('下一着'); expect(screen.getAllByText('炮二平五').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '从此局面练习' })).toBeTruthy()
    click('开局跟练')
    expect(within(training()).queryByLabelText('象棋棋盘')).toBeNull()
    expect(screen.queryByText('本路棋谱')).toBeNull()
    expect((screen.getByLabelText('跟练路线') as HTMLSelectElement).options).toHaveLength(4)
    expect((screen.getByLabelText('跟练执棋方') as HTMLSelectElement).options).toHaveLength(2)
    expect(localStorage.getItem(OPENING_TRAINING_KEY)).toBeNull()
    start('red', openings[2].id)
    expect(training().textContent).toContain('飞相局')
    expect(training().textContent).toContain('你执红')
    expect(training().textContent).toContain('你的第 1 步 / 共 4 步')
    expect(screen.queryByText(openings[2].steps[0].hints[0])).toBeNull()
  })

  it('orients black locally and locks its board until one red example reply is requested', () => {
    open(); start('black')
    expect((cell(0,0) as HTMLElement).style.left).toBe('95%')
    expect((cell(0,0) as HTMLElement).style.top).toBe('94.44444444444444%')
    fireEvent.click(cell(7,0)); fireEvent.click(cell(6,2))
    expect(read().active).toMatchObject({ ply: 0, errors: 0 })
    expect((screen.getByRole('button', { name: '提示第 1 层' }) as HTMLButtonElement).disabled).toBe(true)
    const reply = screen.getByRole('button', { name: '查看红方应手' })
    act(() => { fireEvent.click(reply); fireEvent.click(reply) })
    expect(read().active?.ply).toBe(1)
    expect(training().textContent).toContain('轮到黑方（你）')
    expect(training().textContent).toContain(openings[0].steps[0].note)
  })

  it.each(['red', 'black'] as const)('completes %s only after all eight plies and reports four own moves without awards', side => {
    open(); start(side); finish(side)
    expect(read().active?.ply).toBe(8)
    const summary = screen.getByRole('region', { name: '本轮跟练小结' })
    expect(summary.textContent).toContain('已完成自己的 4 步')
    expect(within(summary).getAllByRole('listitem')).toHaveLength(4)
    expect(summary.textContent).toContain('错误次数：0')
    expect(summary.textContent).toContain('提示：未使用')
    expect(summary.textContent).toContain('示范：未使用')
    expect(summary.textContent).toContain('本轮无提示且无错误')
    const history = screen.getByRole('region', { name: '八组跟练记录' })
    expect(history.textContent).toContain('已完成')
    expect(history.textContent).toContain('曾有本轮无提示且无错误完成')
    const old = localStorage.getItem(OPENING_TRAINING_KEY)
    fireEvent.click(cell(0,6)); fireEvent.click(cell(0,5))
    expect(localStorage.getItem(OPENING_TRAINING_KEY)).toBe(old)
    vi.mocked(window.confirm).mockClear(); click('重练本组')
    expect(window.confirm).not.toHaveBeenCalled()
    expect(read().groups.find(g => g.openingId === openings[0].id && g.side === side)?.unassisted).toBe(true)
  })

  it('distinguishes selection, illegal moves and legal deviations without revealing the route answer', () => {
    open(); start()
    fireEvent.click(cell(0,6)); fireEvent.click(cell(2,6))
    expect(read().active?.errors).toBe(0)
    expect(screen.queryByText(openings[0].steps[0].hints[0])).toBeNull()
    // These are all real legal moves for this selected soldier, rather than the route target.
    expect(cell(2,5).getAttribute('aria-label')).toContain('可走落点')
    fireEvent.keyDown(cell(2,6), { key: 'Escape' }); expect(cell(2,6).getAttribute('aria-pressed')).toBe('false')
    move({ from: {x:0,y:6}, to: {x:0,y:4} })
    expect(screen.getByRole('status', { name: '跟练反馈' }).textContent).toContain('这枚棋子不能走到这里')
    expect(read().active).toMatchObject({ errors: 1, ply: 0 })
    move({ from: {x:0,y:6}, to: {x:0,y:5} })
    expect(screen.getByRole('status', { name: '跟练反馈' }).textContent).toContain('这是合法走法，但不在本次练习路线中')
    expect(read().active).toMatchObject({ errors: 2, ply: 0 })
    move(openings[0].steps[0].move)
    expect(read().active).toMatchObject({ errors: 2, ply: 1 })
    expect(training().textContent).toContain(openings[0].steps[0].note)
    expect(training().textContent).not.toContain(openings[0].steps[1].note)
  })

  it('expands three hint layers, demonstrates only one step, and retains help/error flags on later turns', () => {
    open(); start()
    for (let n = 0; n < 3; n++) {
      click(`提示第 ${n + 1} 层`)
      for (const hint of openings[0].steps[0].hints.slice(0, n + 1)) expect(screen.getAllByText(hint).length).toBeGreaterThan(0)
      for (const hint of openings[0].steps[0].hints.slice(n + 1)) expect(screen.queryByText(hint)).toBeNull()
    }
    expect((screen.getByRole('button', { name: '三层提示已展开' }) as HTMLButtonElement).disabled).toBe(true)
    click('示范本步'); expect(read().active).toMatchObject({ ply: 1, hinted: true, demonstrated: true, hintLevel: 0 })
    expect(screen.queryByText(openings[0].steps[0].hints[2])).toBeNull()
    click('查看黑方应手'); move(openings[0].steps[2].move)
    expect(read().active).toMatchObject({ ply: 3, hinted: true, demonstrated: true })
    for (let ply = 3; ply < 8; ply++) {
      if (ply % 2) click('查看黑方应手'); else move(openings[0].steps[ply].move)
    }
    const summary = screen.getByRole('region', { name: '本轮跟练小结' })
    expect(summary.textContent).toContain('提示：已使用'); expect(summary.textContent).toContain('示范：已使用')
    expect(read().groups[0]).toMatchObject({ completed: true, unassisted: false })
  })

  it('restores an active round without replacing it, and cancelled replacements preserve round and focus', async () => {
    const saved = transitionOpeningTraining(active('black'), { type: 'reply' }).data
    seed(saved); open()
    expect(screen.getByRole('button', { name: '继续上次练习' })).toBeTruthy()
    expect(within(training()).queryByLabelText('象棋棋盘')).toBeNull()
    vi.mocked(window.confirm).mockReturnValue(false)
    const user = userEvent.setup()
    const restart = screen.getByRole('button', { name: '重新开始' })
    await user.click(restart)
    expect(document.activeElement).toBe(restart); expect(read()).toEqual(saved)
    click('继续上次练习'); expect(read()).toEqual(saved)
    const retry = screen.getByRole('button', { name: '重练本组' })
    await user.click(retry); expect(document.activeElement).toBe(retry); expect(read()).toEqual(saved)
    fireEvent.change(screen.getByLabelText('跟练路线'), { target: { value: openings[1].id } })
    const replace = screen.getByRole('button', { name: '开始所选新组' })
    await user.click(replace); expect(document.activeElement).toBe(replace); expect(read()).toEqual(saved)
    expect(window.confirm).toHaveBeenCalledTimes(3)
    vi.mocked(window.confirm).mockReturnValue(true); click('开始所选新组')
    expect(read().active).toMatchObject({ openingId: openings[1].id, ply: 0 })
  })

  it('returns from demonstration with the same failed attempt and hint history', () => {
    open(); start(); click('提示第 1 层')
    move({ from: {x:0,y:6}, to: {x:0,y:5} }); const saved = read()
    click('看示范'); expect(screen.getByText('本路棋谱')).toBeTruthy()
    click('开局跟练'); click('继续上次练习')
    expect(read()).toEqual(saved)
    expect(training().textContent).toContain(openings[0].steps[0].hints[0])
  })

  it('supports board arrow keys, Enter, Space and Escape for selection and a correct move', async () => {
    open(); start()
    const user = userEvent.setup(); cell(7,7).focus()
    await user.keyboard('{Enter}{Escape}')
    expect(read().active?.errors).toBe(0)
    await user.keyboard(' {ArrowLeft}{ArrowLeft}{ArrowLeft}{Enter}')
    expect(read().active?.ply).toBe(1)
    expect(read().active?.errors).toBe(0)
  })

  it('shows 999+ and recovers help state after reload without awarding unassisted completion', () => {
    const saved = active(); saved.active = { ...saved.active!, errors: 999, hinted: true, hintLevel: 2 }
    seed(saved); open(); click('继续上次练习')
    expect(training().textContent).toContain('错误次数：999+')
    expect(screen.getAllByText(openings[0].steps[0].hints[1]).length).toBeGreaterThan(0)
    finish('red')
    expect(read().groups[0]).toMatchObject({ completed: true, unassisted: false })
  })

  it('protects damaged storage while showing gameplay feedback separately and requires confirmed reset', () => {
    localStorage.setItem(OPENING_TRAINING_KEY, '{damaged'); open(); start(); click('提示第 1 层')
    expect(localStorage.getItem(OPENING_TRAINING_KEY)).toBe('{damaged')
    expect(screen.getByRole('status', { name: '跟练反馈' }).textContent).toContain(openings[0].steps[0].hints[0])
    expect(screen.getByRole('status', { name: '跟练保存状态' }).textContent).toMatch(/保护.*重置/)
    expect(screen.getByText(/原存档已保留/)).toBeTruthy()
    vi.mocked(window.confirm).mockReturnValueOnce(false); click('重置本项记录')
    expect(localStorage.getItem(OPENING_TRAINING_KEY)).toBe('{damaged')
    click('重置本项记录'); expect(localStorage.getItem(OPENING_TRAINING_KEY)).toBeNull()
    expect(window.confirm).toHaveBeenLastCalledWith(expect.stringMatching(/仅.*开局跟练.*记录/))
  })

  it('keeps failed saves and failed resets intact, then retries the same in-memory round', () => {
    open(); start(); const saved = localStorage.getItem(OPENING_TRAINING_KEY)
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    click('提示第 1 层')
    expect(screen.getByText(/保存失败/)).toBeTruthy(); expect(localStorage.getItem(OPENING_TRAINING_KEY)).toBe(saved)
    expect(screen.getByRole('status', { name: '跟练反馈' }).textContent).toContain(openings[0].steps[0].hints[0])
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked') })
    click('重置本项记录')
    expect(screen.getByText(/重置开局跟练失败/)).toBeTruthy(); expect(screen.getByLabelText('象棋棋盘')).toBeTruthy()
    expect(localStorage.getItem(OPENING_TRAINING_KEY)).toBe(saved)
    set.mockRestore(); remove.mockRestore(); click('重试保存')
    expect(read().active).toMatchObject({ hinted: true, hintLevel: 1, ply: 0 })
    expect(screen.getByRole('status', { name: '跟练保存状态' }).textContent).toContain('已保存')
  })

  it('reports a failed reset without claiming the already saved round is unsaved', () => {
    open(); start(); const saved = localStorage.getItem(OPENING_TRAINING_KEY)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked') })
    click('重置本项记录')
    expect(localStorage.getItem(OPENING_TRAINING_KEY)).toBe(saved)
    expect(screen.getByLabelText('象棋棋盘')).toBeTruthy()
    expect(screen.getByRole('status', { name: '跟练保存状态' }).textContent).toBe('存储操作失败，请查看下方说明。')
    expect(screen.getByText(/重置开局跟练失败/)).toBeTruthy()
  })

  it('replays captured-piece counts for this prefix using the standard initial board', () => {
    open(); start(); click('示范本步')
    const lost = screen.getByRole('region', { name: '跟练失子' })
    expect(lost.textContent).toContain('第 1 着')
    expect(lost.textContent).toContain('仅统计本轮跟练从标准起点至当前着的吃子')
    expect(within(lost).getAllByText('暂无失子')).toHaveLength(2)
    expect(screen.getByLabelText('象棋棋盘').closest('.board-frame')?.className).toContain('board-frame--clear')
    expect(document.querySelectorAll('.board-coordinate')).toHaveLength(38)
  })
})
