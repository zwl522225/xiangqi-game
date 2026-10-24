// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { endgames } from '../src/content/endgames'
import { defaultEndgameLessons, transitionEndgameLessons } from '../src/core/endgame-lessons'
import { ENDGAME_STORAGE_KEY, loadEndgameLessons, saveEndgameLessons } from '../src/core/endgame-lessons-storage'
import { BoardDisplayProvider } from '../src/ui/BoardDisplayContext'
import { EndgameLessons } from '../src/ui/EndgameLessons'
import { useEndgameLessons } from '../src/ui/useEndgameLessons'
import type { EndgameLessonsController } from '../src/ui/useEndgameLessons'
import type { Move } from '../src/core/types'

function Harness({ visible = true }: { visible?: boolean }) {
  const controller = useEndgameLessons()
  return <BoardDisplayProvider value={{ boardTheme: 'clear', showCoordinates: true, showCaptured: true }}>{visible ? <EndgameLessons controller={controller} /> : null}</BoardDisplayProvider>
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }))
const read = () => loadEndgameLessons(localStorage).data
const topic = (index = 0) => screen.getByRole('region', { name: ['车兵配合封路', '炮架与封锁', '车马协同'][index] })
function begin(index = 0) { const lesson = endgames[index]; fireEvent.click(within(topic(Math.floor(index / 2))).getByRole('button', { name: index % 2 ? '换局面练 B 题' : '练 A 题' })); return lesson }
function cell(x: number, y: number) { return screen.getByLabelText(new RegExp(`^(?:[^，]+，坐标 |交叉点 )${x},${y}(?:，|$)`)) }
function move(value: Move) { fireEvent.click(cell(value.from.x, value.from.y)); fireEvent.click(cell(value.to.x, value.to.y)) }
function finish(index = 0) { const lesson = endgames[index]; move(lesson.line[0]); click('查看指定应手'); move(lesson.line[2]) }
beforeEach(() => { localStorage.clear(); vi.spyOn(window, 'confirm').mockReturnValue(true) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

describe('endgame lesson directory, practice and read-only views', () => {
  it.each([0, 1, 2, 3, 4, 5])('shows content-owned current tasks for lesson %s without consuming assistance', index => {
    render(<Harness />); const lesson = begin(index)
    expect(screen.getByRole('note', { name: '本步任务' }).textContent).toBe(`本步任务：${lesson.tasks[0]}`)
    expect(read().round).toMatchObject({ helpUsed: false, hintLevel: 0, demoUsed: false, explanationViewed: false })
    move(lesson.line[0]); click('查看指定应手')
    expect(screen.getByRole('note', { name: '本步任务' }).textContent).toBe(`本步任务：${lesson.tasks[1]}`)
    expect(screen.queryByText(`本步任务：${lesson.tasks[0]}`)).toBeNull()
    expect(read().round).toMatchObject({ ply: 2, errors: 0, helpUsed: false, hintLevel: 0, demoUsed: false, explanationViewed: false })
  })
  it.each(['different lesson at same ply', 'same lesson restored to shorter prefix'])('invalidates stale selection after %s while practice stays mounted', scenario => {
    let controller: EndgameLessonsController
    function Connected() { controller = useEndgameLessons(); return <EndgameLessons controller={controller} /> }
    render(<Connected />); begin()
    if (scenario === 'same lesson restored to shorter prefix') { move(endgames[0].line[0]); click('查看指定应手') }
    const origin = scenario === 'different lesson at same ply' ? { x: 5, y: 2 } : { x: 0, y: 1 }
    fireEvent.click(cell(origin.x, origin.y)); expect(cell(origin.x, origin.y).getAttribute('aria-pressed')).toBe('true')
    const replacement = transitionEndgameLessons(defaultEndgameLessons(), { type: 'start', id: endgames[scenario === 'different lesson at same ply' ? 1 : 0].id }).data
    act(() => { expect(controller.restore(replacement).ok).toBe(true) })
    expect(cell(origin.x, origin.y).getAttribute('aria-pressed')).toBe('false')
    const raw = localStorage.getItem(ENDGAME_STORAGE_KEY)
    fireEvent.click(cell(4, 4))
    expect(read().round).toMatchObject({ ply: 0, errors: 0, hadError: false })
    expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBe(raw)
    const nextLesson = endgames[scenario === 'different lesson at same ply' ? 1 : 0]
    move(nextLesson.line[0]); expect(read().round).toMatchObject({ ply: 1, errors: 0 })
  })
  it('lists six separate fixed-side cards and starts with no interactive board or writes', () => {
    render(<Harness />)
    expect(screen.getByRole('heading', { name: '残局分步教学' })).toBe(document.activeElement)
    for (const lesson of endgames) {
      const card = screen.getByRole('region', { name: lesson.title })
      expect(card.textContent).toContain(lesson.side === 'red' ? '执红' : '执黑')
      expect(card.textContent).toContain('尚未完成指定路线')
      expect(card.textContent).toContain('尚无本轮无提示且无错误完成记录')
    }
    expect(screen.queryByLabelText('象棋棋盘')).toBeNull(); expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBeNull()
    expect(screen.getByText(/其他合法走法可能也能达成目标/)).toBeTruthy()
  })
  it.each([0, 1])('starts learner color %s without manufactured preliminary moves, finishes real checkmate and preserves separate history flags', index => {
    render(<Harness />); const lesson = begin(index)
    expect(read().round).toMatchObject({ id: lesson.id, ply: 0, errors: 0 })
    expect((cell(0, 0) as HTMLElement).style.left).toBe(index ? '95%' : '5%')
    expect(screen.getByRole('heading', { name: '轮到你行棋' })).toBe(document.activeElement)
    expect(screen.getByText('你的第 1 步 / 共 2 步')).toBeTruthy()
    expect(screen.queryByText(lesson.explanations[0])).toBeNull()
    finish(index)
    const summary = screen.getByRole('region', { name: '本轮残局小结' })
    expect(summary).toBe(document.activeElement)
    expect(summary.textContent).toContain(`${lesson.side === 'red' ? '红' : '黑'}方获胜 · 将死`)
    expect(summary.textContent).toContain('本轮无提示且无错误完成指定路线')
    expect(summary.textContent).toContain('不代表此前未见过题目')
    expect(within(summary).getAllByRole('listitem')).toHaveLength(3)
    expect(read().records[lesson.id]).toEqual({ version: 1, completed: true, independent: true })
    click('重练本题'); expect(window.confirm).not.toHaveBeenCalled()
    click('提示第 1 层'); finish(index)
    expect(read().records[lesson.id].independent).toBe(true)
    expect(screen.getByRole('region', { name: '本轮残局小结' }).textContent).toContain('本轮包含错误或辅助')
  })
  it('keeps selection/reselection/cancel harmless and distinguishes illegal from legal off-route submissions', () => {
    render(<Harness />); begin()
    fireEvent.click(cell(0, 1)); fireEvent.click(cell(5, 2)); fireEvent.click(cell(5, 2))
    expect(read().round?.errors).toBe(0)
    fireEvent.click(cell(5, 2)); fireEvent.keyDown(cell(5, 2), { key: 'Escape' }); expect(cell(5, 2).getAttribute('aria-pressed')).toBe('false')
    move({ from: { x: 5, y: 2 }, to: { x: 5, y: 4 } })
    expect(screen.getByRole('status', { name: '残局答题反馈' }).textContent).toContain('非法着法')
    move({ from: { x: 0, y: 1 }, to: { x: 0, y: 2 } })
    expect(screen.getByRole('status', { name: '残局答题反馈' }).textContent).toContain('这是合法走法，但不在本课当前路线中')
    expect(read().round).toMatchObject({ errors: 2, hadError: true, ply: 0 })
    expect(cell(5, 2).getAttribute('aria-label')).toContain('红兵')
    expect(screen.queryByText(endgames[0].explanations[2])).toBeNull()
  })
  it('locks the opponent board, advances only one explicit reply and shows actual check status/notation', () => {
    render(<Harness />); begin(); move(endgames[0].line[0])
    expect(screen.getByRole('heading', { name: '轮到对方行棋' })).toBeTruthy()
    expect(screen.getByText('兵四进一')).toBeTruthy(); expect(cell(5, 0).getAttribute('aria-label')).toContain('正在被将军')
    fireEvent.click(cell(0, 1)); fireEvent.click(cell(4, 1)); expect(read().round).toMatchObject({ ply: 1, errors: 0 })
    expect((screen.getByRole('button', { name: '示范本步' }) as HTMLButtonElement).disabled).toBe(true)
    const reply = screen.getByRole('button', { name: '查看指定应手' })
    act(() => { fireEvent.click(reply); fireEvent.click(reply) })
    expect(read().round!.ply).toBe(2); expect(screen.queryByText(endgames[0].explanations[2])).toBeNull()
  })
  it('reveals three progressive current-step hints and demonstrates exactly one own move', () => {
    render(<Harness />); begin()
    for (let level = 1; level <= 3; level++) {
      click(`提示第 ${level} 层`)
      const hints = screen.getByRole('list', { name: '本步已展开提示' })
      expect(within(hints).getAllByRole('listitem')).toHaveLength(level)
      expect(screen.queryByText(endgames[0].hints[1][0])).toBeNull()
    }
    expect((screen.getByRole('button', { name: '三层提示已展开' }) as HTMLButtonElement).disabled).toBe(true)
    click('示范本步'); expect(read().round).toMatchObject({ ply: 1, demoUsed: true, helpUsed: true, hintLevel: 0 })
    click('查看指定应手'); expect(read().round!.ply).toBe(2)
    expect(screen.queryByRole('list', { name: '本步已展开提示' })).toBeNull()
  })
  it('opens a manual same-topic demonstration before rendering and returns the exact opponent answer node', () => {
    render(<Harness />); begin(); move(endgames[0].line[0])
    click('看本主题示范'); expect(read().round).toMatchObject({ ply: 1, explanationViewed: true })
    expect(screen.getByRole('heading', { name: '只读示范' })).toBe(document.activeElement)
    expect(screen.getByText('已展示 0 / 3 着')).toBeTruthy()
    expect(cell(5, 2).getAttribute('aria-label')).toContain('红兵')
    click('下一着'); click('下一着'); expect(read().round!.ply).toBe(1)
    click('返回当前答题'); expect(read().round!.ply).toBe(1)
    expect(screen.getByRole('heading', { name: '轮到对方行棋' })).toBe(document.activeElement)
    expect(cell(5, 1).getAttribute('aria-label')).toContain('红兵')
  })
  it('uses the actual setup and legal alternate-defense prefix for captures, without moving the current answer', () => {
    render(<Harness />); begin(); click('看本主题示范')
    let captures = screen.getByRole('region', { name: '残局教学失子' })
    expect(captures.textContent).toContain('教学设置起点'); expect(within(captures).getAllByText('暂无失子')).toHaveLength(2)
    click('换一种防守会怎样')
    expect(screen.getByRole('heading', { name: '只读防守分支' })).toBe(document.activeElement)
    expect(cell(5, 1).getAttribute('aria-label')).toContain('红兵')
    click('下一着'); expect(cell(5, 1).getAttribute('aria-label')).toContain('黑车')
    captures = screen.getByRole('region', { name: '残局教学失子' })
    expect(captures.textContent).toContain('红兵 × 1'); expect(captures.textContent).not.toMatch(/红车 ×|黑马 ×/)
    expect(screen.getAllByText(/该分支尚未结束/).length).toBeGreaterThan(0)
    expect(read().round).toMatchObject({ ply: 0, explanationViewed: true })
    click('返回当前答题'); expect(cell(5, 2).getAttribute('aria-label')).toContain('红兵')
    expect(screen.getByLabelText('象棋棋盘').closest('.board-frame')?.className).toContain('board-frame--clear')
    expect(document.querySelectorAll('.board-coordinate')).toHaveLength(38)
  })
  it('marks B when viewing its A topic, leaves other-topic practice unflagged and does not revise finished outcomes', () => {
    render(<Harness />); begin(1); click('返回目录')
    fireEvent.click(within(topic(1)).getByRole('button', { name: '看示范' }))
    expect(read().round!.explanationViewed).toBe(false)
    click('返回目录'); fireEvent.click(within(topic(0)).getByRole('button', { name: '看示范' }))
    expect(read().round!.explanationViewed).toBe(true)
    click('返回目录'); click('继续上次练习'); finish(1)
    const saved = localStorage.getItem(ENDGAME_STORAGE_KEY); click('看本主题示范'); click('换一种防守会怎样'); click('下一着')
    expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBe(saved)
  })
  it('only lets already played history seek, returns current answer and retains errors/help', () => {
    render(<Harness />); begin(); click('提示第 1 层')
    move({ from: { x: 0, y: 1 }, to: { x: 0, y: 2 } }); move(endgames[0].line[0]); const saved = read()
    click('回看已走棋谱'); expect(screen.getByRole('heading', { name: '只读已走棋谱' })).toBeTruthy()
    expect(screen.getByText('已展示 1 / 1 着')).toBeTruthy()
    expect((screen.getByRole('button', { name: '下一着' }) as HTMLButtonElement).disabled).toBe(true)
    click('上一着'); fireEvent.click(cell(5, 2)); fireEvent.click(cell(5, 1))
    expect(read()).toEqual(saved); expect(screen.queryByText(endgames[0].explanations[1])).toBeNull()
    click('返回当前答题'); expect(read()).toEqual(saved); expect(cell(5, 1).getAttribute('aria-label')).toContain('红兵')
  })
  it('keeps history bounded to the restored actual prefix and returns to directory if that round is replaced', () => {
    let controller: EndgameLessonsController
    function Connected() { controller = useEndgameLessons(); return <EndgameLessons controller={controller} /> }
    render(<Connected />); begin(); move(endgames[0].line[0]); click('查看指定应手'); click('回看已走棋谱')
    const shorter = transitionEndgameLessons(defaultEndgameLessons(), { type: 'start', id: endgames[0].id }).data
    act(() => { expect(controller.restore(shorter).ok).toBe(true) })
    expect(screen.getByText('已展示 0 / 0 着')).toBeTruthy()
    expect(cell(5, 2).getAttribute('aria-label')).toContain('红兵')
    expect((screen.getByRole('button', { name: '下一着' }) as HTMLButtonElement).disabled).toBe(true)
    const replacement = transitionEndgameLessons(defaultEndgameLessons(), { type: 'start', id: endgames[3].id }).data
    act(() => { expect(controller.restore(replacement).ok).toBe(true) })
    expect(screen.queryByLabelText('象棋棋盘')).toBeNull()
    expect(screen.getByRole('button', { name: '继续上次练习' })).toBeTruthy()
    expect(read()).toEqual(replacement)
  })
  it('requires one replacement confirmation, cancellation preserves focus/storage, and remount starts directory', async () => {
    const { rerender } = render(<Harness />); begin(); click('提示第 1 层'); const saved = localStorage.getItem(ENDGAME_STORAGE_KEY)
    vi.mocked(window.confirm).mockReturnValue(false)
    const user = userEvent.setup(); const restart = screen.getByRole('button', { name: '重练本题' }); await user.click(restart)
    expect(window.confirm).toHaveBeenCalledTimes(1); expect(document.activeElement).toBe(restart); expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBe(saved)
    click('返回目录'); const replace = within(topic(1)).getByRole('button', { name: '换局面练 B 题' }); await user.click(replace)
    expect(window.confirm).toHaveBeenCalledTimes(2); expect(document.activeElement).toBe(replace); expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBe(saved)
    click('继续上次练习'); rerender(<Harness visible={false} />); rerender(<Harness />)
    expect(screen.queryByLabelText('象棋棋盘')).toBeNull(); expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBe(saved)
    click('继续上次练习'); expect(read().round!.hintLevel).toBe(1)
    vi.mocked(window.confirm).mockReturnValue(true); click('重练本题'); expect(read().round!.hintLevel).toBe(0)
  })
  it('restores saturated errors and assistance then presents truthful assisted summary', () => {
    const data = transitionEndgameLessons(defaultEndgameLessons(), { type: 'start', id: endgames[0].id }).data
    data.round = { ...data.round!, errors: 999, hadError: true, helpUsed: true, hintLevel: 2 }
    expect(saveEndgameLessons(localStorage, data)).toBe(true)
    render(<Harness />); click('继续上次练习'); expect(screen.getByText(/错误次数：999\+/)).toBeTruthy()
    finish(); const summary = screen.getByRole('region', { name: '本轮残局小结' })
    expect(summary.textContent).toContain('错误次数：999+'); expect(summary.textContent).toContain('提示：已使用')
    expect(read().records[endgames[0].id]).toMatchObject({ completed: true, independent: false })
  })
  it('separately reports blocked/failed storage and only resets this module after confirmation/removal', () => {
    localStorage.setItem(ENDGAME_STORAGE_KEY, '{broken'); localStorage.setItem('xiangqi-progress', 'keep'); render(<Harness />); begin(); click('提示第 1 层')
    expect(screen.getByRole('status', { name: '残局保存状态' }).textContent).toContain('临时练习')
    expect(screen.getByRole('status', { name: '残局答题反馈' }).textContent).toContain(endgames[0].hints[0][0])
    expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBe('{broken')
    vi.mocked(window.confirm).mockReturnValueOnce(false); click('重置本项记录'); expect(read().round).toBeNull()
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw Error('denied') })
    click('重置本项记录'); expect(screen.getByLabelText('象棋棋盘')).toBeTruthy(); expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBe('{broken')
    remove.mockRestore(); click('重置本项记录')
    expect(screen.queryByLabelText('象棋棋盘')).toBeNull(); expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBeNull(); expect(localStorage.getItem('xiangqi-progress')).toBe('keep')
    begin(); const raw = localStorage.getItem(ENDGAME_STORAGE_KEY)
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota') }); click('提示第 1 层')
    expect(localStorage.getItem(ENDGAME_STORAGE_KEY)).toBe(raw); expect(screen.getByRole('status', { name: '残局保存状态' }).textContent).toContain('失败')
    set.mockRestore(); click('重试保存'); expect(read().round!.helpUsed).toBe(true)
  })
  it('does not present protected default history as evidence that a lesson was never completed', () => {
    localStorage.setItem(ENDGAME_STORAGE_KEY, '{unreadable'); render(<Harness />)
    for (const lesson of endgames) {
      const card = screen.getByRole('region', { name: lesson.title })
      expect(card.textContent).toContain('原记录暂不可读取')
      expect(card.textContent).not.toContain('尚未完成指定路线')
      expect(card.textContent).not.toContain('尚无本轮无提示且无错误完成记录')
    }
    expect(screen.getByText(/临时练习记录不能代表原历史/)).toBeTruthy()
  })
  it('supports native Board Enter, Space, arrows and Escape without selection errors', async () => {
    render(<Harness />); begin(); const user = userEvent.setup(); cell(5, 2).focus()
    await user.keyboard('{Enter}{Escape}'); expect(read().round!.errors).toBe(0)
    await user.keyboard(' {ArrowUp}{Enter}')
    expect(read().round).toMatchObject({ ply: 1, errors: 0 })
  })
})
