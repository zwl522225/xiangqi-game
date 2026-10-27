// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import { curriculum } from '../src/content/curriculum'
import { openings } from '../src/content/openings'
import { puzzles } from '../src/content/puzzles'
import { defaultProgress, saveProgress } from '../src/core/storage'
import { currentPractice, showPracticeHint, startPractice, submitPractice } from '../src/core/practice'
import { defaultOpeningTraining, transitionOpeningTraining } from '../src/core/opening-training'
import { OPENING_TRAINING_KEY, saveOpeningTraining } from '../src/core/opening-training-storage'
import { currentTactic, defaultTactics, transitionTactics } from '../src/core/tactics'
import { TACTICS_KEY, saveTactics } from '../src/core/tactics-storage'

const click = (name: string) => fireEvent.click(screen.getByText(name, { selector: 'button', exact: true }))
const overview = () => screen.getByRole('region', { name: '学习总览' })
const card = (name: string) => within(overview()).getByRole('region', { name })
function open() { render(<App />); click('新手课堂'); click('学习总览') }
beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('learning overview record presentation', () => {
  it('shows all six modules with distinct empty-record meanings and eight chapter destinations', () => {
    open()
    expect(card('课堂进度').textContent).toContain('已掌握 0 / 21')
    expect(card('课堂进度').textContent).toContain('已练未掌握 0 / 21')
    expect(card('课堂进度').textContent).toContain('暂无知识点记录 21 / 21')
    expect(within(overview()).getAllByRole('button', { name: /^学习本章：/ })).toHaveLength(8)
    expect(card('单步练习记录').textContent).toContain('有作答记录 0 / 20')
    expect(card('多步战术记录').textContent).toContain('曾完成 0 / 6')
    expect(card('开局跟练记录').textContent).toContain('曾完成 0 / 8')
    expect(card('旧残局记录').textContent).toContain('已记录完成 0 / 6（含提示后完成）')
    expect(card('第一盘实战').textContent).toContain('首盘完整对局：尚无记录')
    expect(card('第一盘实战').textContent).toContain('独立首盘：尚无记录')
    expect(card('接下来可以做').textContent).toContain('学习')
    expect(overview().textContent).not.toMatch(/掌握率|总分|累计完成|连续天数|棋力等级/)
  })

  it('presents real answered, assisted and historical records without inventing single-practice successes', () => {
    const progress = defaultProgress()
    progress.masteredUnits = ['turns']; progress.practicedUnits = ['turns', curriculum[1].units[0].id]
    progress.completedLessons = [curriculum[0].id]; progress.solvedPuzzles = [puzzles[0].id]
    let practice = startPractice(progress.practice!, { mode: 'recommended' })
    practice = showPracticeHint(practice)
    const task = currentPractice(practice)!.exercise.task
    practice = submitPractice(practice, task.kind === 'move' ? { kind: 'move', move: task.solutions[0] } : { kind: 'choice', optionId: task.correctOptionId })
    progress.practice = practice; progress.milestones.firstMatch = true
    expect(saveProgress(localStorage, progress)).toBe(true)
    let opening = transitionOpeningTraining(defaultOpeningTraining(), { type: 'start', openingId: openings[0].id, side: 'black' }).data
    for (let ply = 0; ply < 8; ply++) opening = transitionOpeningTraining(opening, ply % 2 === 0 ? { type: 'reply' } : { type: 'move', move: openings[0].steps[ply].move }).data
    expect(saveOpeningTraining(localStorage, opening)).toBe(true)
    let tactics = transitionTactics(defaultTactics(), { type: 'start', request: { mode: 'recommended' } }).data
    while (!currentTactic(tactics)!.item.result) {
      const current = currentTactic(tactics)!
      tactics = transitionTactics(tactics, current.view.learnerTurn ? { type: 'move', move: current.view.correctMoves[0] } : { type: 'reply' }).data
    }
    expect(saveTactics(localStorage, tactics)).toBe(true)
    open()
    expect(card('课堂进度').textContent).toContain('已掌握 1 / 21')
    expect(card('课堂进度').textContent).toContain('已练未掌握 1 / 21')
    expect(card('课堂进度').textContent).toContain('旧版章节记录 1 / 8')
    expect(card('单步练习记录').textContent).toContain('有作答记录 1 / 20')
    expect(card('单步练习记录').textContent).toContain('独立 0 · 辅助 1 · 跳过 0')
    expect(card('单步练习记录').textContent).toContain('本题已结束，尚未进入下一题/小结')
    expect(card('多步战术记录').textContent).toContain('曾无提示且无错误完成 1 / 6')
    expect(card('开局跟练记录').textContent).toContain('曾无提示且无错误完成 1 / 8')
    expect(card('开局跟练记录').textContent).toContain('执黑 · 已走 8 / 8 着')
    expect(card('旧残局记录').textContent).toContain('已记录完成 1 / 6（含提示后完成）')
    expect(card('第一盘实战').textContent).toContain('首盘完整对局：已有记录')
    expect(within(card('接下来可以做')).getAllByRole('listitem')).toHaveLength(2)
  })

  it('keeps unavailable histories unknown and labels an active temporary round', () => {
    localStorage.setItem(OPENING_TRAINING_KEY, 'protected-invalid-opening')
    localStorage.setItem(TACTICS_KEY, 'protected-invalid-tactics')
    open()
    expect(card('开局跟练记录').textContent).toContain('记录暂不可恢复')
    expect(card('多步战术记录').textContent).toContain('记录暂不可恢复')
    expect(card('开局跟练记录').textContent).not.toContain('曾完成 0')
    click('前往开局跟练'); click('开始跟练')
    click('新手课堂'); click('学习总览')
    expect(card('开局跟练记录').textContent).toContain('临时练习，原记录受保护')
    expect(card('开局跟练记录').textContent).toContain('记录暂不可恢复')
    expect(localStorage.getItem(OPENING_TRAINING_KEY)).toBe('protected-invalid-opening')
  })

  it('labels all four current tactic outcomes without claiming revealed or skipped history', () => {
    let data = transitionTactics(defaultTactics(), { type: 'start', request: { mode: 'recommended' } }).data
    data = transitionTactics(data, { type: 'answer' }).data
    data = transitionTactics(data, { type: 'next' }).data
    data = transitionTactics(data, { type: 'skip' }).data
    expect(saveTactics(localStorage, data)).toBe(true)
    open()
    expect(card('多步战术记录').textContent).toContain('独立 0 · 辅助 0 · 已看答案 1 · 跳过 1')
    expect(card('多步战术记录').textContent).toContain('曾完成 0 / 6')
  })

  it('lists all three pending rounds with the correct question and opening-ply units', () => {
    const progress = defaultProgress()
    progress.practice = startPractice(progress.practice!, { mode: 'recommended' }); saveProgress(localStorage, progress)
    let opening = transitionOpeningTraining(defaultOpeningTraining(), { type: 'start', openingId: openings[0].id, side: 'black' }).data
    opening = transitionOpeningTraining(opening, { type: 'reply' }).data
    saveOpeningTraining(localStorage, opening)
    saveTactics(localStorage, transitionTactics(defaultTactics(), { type: 'start', request: { mode: 'recommended' } }).data)
    open()
    const pending = within(card('接下来可以做')).getAllByRole('listitem')
    expect(pending).toHaveLength(3)
    expect(pending[0].textContent).toContain('已结束 0 / 5 题')
    expect(pending[1].textContent).toContain('已走 1 / 8 着')
    expect(pending[2].textContent).toContain('已结束 0 / 3 题')
  })

  it('keeps temporary tactics separate from the protected unknown history', () => {
    localStorage.setItem(TACTICS_KEY, 'protected-tactics')
    open(); click('前往多步战术'); click('推荐战术练习')
    click('新手课堂'); click('学习总览')
    expect(card('多步战术记录').textContent).toContain('临时练习，原记录受保护')
    expect(card('多步战术记录').textContent).toContain('记录暂不可恢复')
    expect(card('多步战术记录').textContent).not.toContain('曾完成 0')
    expect(localStorage.getItem(TACTICS_KEY)).toBe('protected-tactics')
  })

  it('preserves the opening hook reset-failure explanation without claiming saved data was lost', () => {
    render(<App />); click('棋路馆'); click('开局跟练')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied') })
    click('重置本项记录')
    click('新手课堂'); click('学习总览')
    expect(card('开局跟练记录').textContent).toContain('重置开局跟练失败，原存档与当前练习已保留，请重试。')
    expect(card('开局跟练记录').textContent).not.toContain('刷新可能丢失')
  })

  it('shows the actual module reset failure notice without inventing unsaved progress', () => {
    render(<App />); click('主题练习'); click('多步战术')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied') })
    click('重置战术记录')
    click('新手课堂'); click('学习总览')
    expect(card('多步战术记录').textContent).toContain('重置多步战术失败，原存档与当前练习已保留，请重试。')
    expect(card('多步战术记录').textContent).not.toContain('尚未保存')
    expect(card('多步战术记录').textContent).not.toContain('刷新可能丢失')
  })
})
