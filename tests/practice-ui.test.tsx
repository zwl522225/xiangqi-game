// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { App } from '../src/ui/App'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'
import { defaultPractice, startPractice, submitPractice } from '../src/core/practice'
import type { PracticeData } from '../src/core/practice'
import { practiceExercises } from '../src/content/practice'
import { play } from '../src/core/session'

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
// Board cells already expose their complete names through aria-label; avoid
// recomputing accessible names for all 90 cells on every selection or move.
const clickCell = (name: RegExp) => fireEvent.click(screen.getByLabelText(name))
const stored = () => loadProgress(localStorage)
function seed(id = 'practice-moves-rook-route', data?: PracticeData) {
  const exercise = practiceExercises.find(item => item.id === id)!
  const practice = data ?? startPractice(defaultPractice(), { mode: 'topic', topicId: exercise.topicId })
  if (!data) practice.round!.items.sort((a, b) => Number(b.id === id) - Number(a.id === id))
  saveProgress(localStorage, { ...defaultProgress(), practice })
}
function enter() { render(<App />); click('主题练习') }
function resume() { enter(); click('继续上次练习') }
function move(from: string, to: string) { clickCell(new RegExp(from)); clickCell(new RegExp(to)) }

describe('theme practice interface', () => {
  it('offers bounded recommended/topic rounds and an explicit empty mistakes round', () => {
    enter()
    expect(screen.getByText(/待复习错题优先/)).toBeTruthy()
    click('推荐练习')
    expect(stored().practice!.round!.items).toHaveLength(5)
    expect(screen.getAllByRole('group', { name: '象棋棋盘' })).toHaveLength(1)
    click('返回练习目录')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    click('按主题练：基础走法')
    expect(stored().practice!.round!.items).toHaveLength(4)
    click('返回练习目录')
    click('错题再练')
    expect(screen.getByText('暂无待复习错题')).toBeTruthy()
    expect(screen.queryByRole('group', { name: '象棋棋盘' })).toBeNull()
  })

  it('keeps friendly selection local and submits illegal and non-goal moves without changing the board', () => {
    seed(); resume()
    expect(screen.getByRole('button', { name: '下一题' }).hasAttribute('disabled')).toBe(true)
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')
    clickCell(/红车，坐标 2,7/)
    clickCell(/红兵，坐标 2,6/)
    expect(Object.keys(stored().practice!.records)).toHaveLength(0)
    fireEvent.keyDown(screen.getByLabelText(/红兵，坐标 2,6/), { key: 'Escape' })
    expect(screen.getByLabelText(/红兵，坐标 2,6/).getAttribute('aria-pressed')).toBe('false')
    expect(storageWrite).not.toHaveBeenCalled()
    move('红车，坐标 2,7', '黑卒，坐标 2,4')
    expect(screen.getByText(/非法着法：/)).toBeTruthy()
    expect(stored().practice!.records['practice-moves-rook-route'].errors).toBe(1)
    move('红车，坐标 2,7', '交叉点 3,7')
    expect(screen.getByText(/合法，但未达目标：/)).toBeTruthy()
    expect(screen.getByLabelText(/红车，坐标 2,7/)).toBeTruthy()
    move('红车，坐标 2,7', '交叉点 6,7')
    expect(screen.getByLabelText(/红车，坐标 6,7.*上一步/)).toBeTruthy()
    const attempts = stored().practice!.records['practice-moves-rook-route'].attempts
    storageWrite.mockClear()
    clickCell(/红帅，坐标 5,9/)
    expect(stored().practice!.records['practice-moves-rook-route'].attempts).toBe(attempts)
    expect(storageWrite).not.toHaveBeenCalled()
  })

  it('persists hints, answer and retry assistance across reload while revealing no moved board', () => {
    seed(); resume()
    click('提示 1 · 观察'); click('提示 2 · 规则与思路'); click('提示 3 · 具体着法或答案')
    click('揭晓答案')
    expect(screen.getByText(/参考答案：/)).toBeTruthy()
    expect(screen.getByLabelText(/红车，坐标 2,7/)).toBeTruthy()
    expect(Object.keys(stored().practice!.records)).toHaveLength(0)
    click('重试本题')
    cleanup(); resume()
    expect(screen.getByText(/本题已使用帮助或重试/)).toBeTruthy()
    move('红车，坐标 2,7', '交叉点 6,7')
    expect(stored().practice!.round!.items[0].result).toBe('assisted')
  })

  it('handles choice, explicit next and mutually exclusive round summary counts', () => {
    seed('practice-endgame-natural-limit'); resume()
    click('达到本游戏自然限着，和棋')
    expect(stored().practice!.round!.items[0].result).toBe('independent')
    click('下一题')
    for (let index = 0; index < 3; index++) { click('跳过本题'); click('下一题') }
    expect(screen.getByRole('heading', { name: '本轮小结' })).toBeTruthy()
    expect(screen.getByText('首次无提示完成：1')).toBeTruthy()
    expect(screen.getByText('提示或重试后完成：0')).toBeTruthy()
    expect(screen.getByText('跳过：3')).toBeTruthy()
    expect(screen.getByText('已结束 4 / 4')).toBeTruthy()
  })

  it('keeps reviewed mistakes visible and marks a new real mistake pending again', () => {
    seed()
    const data = stored().practice!
    const error = submitPractice(data, { kind: 'move', move: { from: { x: 2, y: 7 }, to: { x: 2, y: 4 } } })
    seed('', error); enter()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    click('错题再练')
    move('红车，坐标 2,7', '交叉点 6,7')
    click('下一题'); click('返回练习目录')
    expect(screen.getByText(/已独立复习.*错误 1 次/)).toBeTruthy()
    expect(screen.getByText(/最近错误：.*2,7.*2,4/)).toBeTruthy()
    click('按主题练：基础走法')
    while (stored().practice!.round!.items[stored().practice!.round!.index].id !== 'practice-moves-rook-route') { click('跳过本题'); click('下一题') }
    move('红车，坐标 2,7', '交叉点 3,7')
    expect(stored().practice!.records['practice-moves-rook-route'].review).toBe('pending')
  })

  it('confirms replacing active rounds and clearing only practice while preserving all other progress', () => {
    seed()
    const initial = stored()
    const played = play(initial.session, { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    if (!played.ok) throw new Error('Invalid test move')
    initial.session = { ...played.session, notes: { '1': '保留复盘笔记' } }
    initial.masteredUnits = ['turns']; initial.practicedUnits = ['turns']; initial.assistedVariants = ['turns-variant-1']
    initial.completedLessons = ['board']; initial.solvedPuzzles = ['puzzle-1']
    initial.milestones = { firstMatch: true, independentMatch: true }
    initial.learningMatch = { active: false, standardStart: true, coachEnabled: false, coachEverUsed: false, checkpointSeen: true }
    saveProgress(localStorage, initial)
    enter()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    click('推荐练习')
    expect(stored().practice).toEqual(initial.practice)
    click('继续上次练习')
    click('提示 1 · 观察')
    move('红车，坐标 2,7', '交叉点 3,7')
    const changed = stored()
    expect({ ...changed, practice: initial.practice }).toEqual(initial)
    click('返回练习目录')
    click('清空练习记录')
    expect(stored()).toEqual(changed)
    confirm.mockReturnValue(true)
    click('清空练习记录')
    expect(stored()).toEqual({ ...initial, practice: defaultPractice() })
  })

  it('links the corresponding classroom and resumes the same round without changing formal progress', () => {
    seed(); const before = stored(); resume()
    click('查看对应课堂')
    expect(screen.getByRole('heading', { name: '车走直线' })).toBeTruthy()
    click('主题练习'); click('继续上次练习')
    expect(screen.getByRole('heading', { name: '车从横线绕开阻挡' })).toBeTruthy()
    expect(stored()).toEqual(before)
  })

  it('reports real persistence failure and does not promise refresh safety', () => {
    seed()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    resume()
    click('提示 1 · 观察')
    expect(screen.getByText(/保存失败，刷新可能丢失本轮进度/)).toBeTruthy()
    expect(screen.queryByText('本轮进度已保存到本机')).toBeNull()
  })

  it('reopens a completed round summary after refresh and starts a new round without confirmation', () => {
    seed(); resume()
    for (let index = 0; index < 4; index++) { click('跳过本题'); click('下一题') }
    cleanup(); enter()
    click('查看上轮小结')
    expect(screen.getByRole('heading', { name: '本轮小结' })).toBeTruthy()
    expect(screen.getByText('已结束 4 / 4')).toBeTruthy()
    click('返回练习目录')
    const confirm = vi.spyOn(window, 'confirm')
    click('推荐练习')
    expect(confirm).not.toHaveBeenCalled()
  })

  it('labels choice mistakes accurately and filters retained history by topic', () => {
    seed('practice-endgame-natural-limit'); resume()
    click('未被将军却无合法着法，困毙判负')
    expect(screen.getByText(/选项未答对：/)).toBeTruthy()
    click('返回练习目录')
    expect(screen.getByText(/选项未答对：/)).toBeTruthy()
    expect(screen.getByText(/最近错误：未被将军/)).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: '筛选主题' }), { target: { value: 'moves' } })
    expect(screen.getByText('这个主题暂无错题记录')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: '筛选主题' }), { target: { value: 'endgame' } })
    expect(screen.getByText(/最近错误：未被将军/)).toBeTruthy()
  })
})
