// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import { createSession, play } from '../src/core/session'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'
import { defaultPreferences } from '../src/core/preferences'

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('play perspective preferences', () => {
  it('selects difficulty with the keyboard and persists it across reload and new games without changing progress', async () => {
    const user = userEvent.setup()
    const page = render(<App />)
    const before = localStorage.getItem('xiangqi-progress')
    const selector = screen.getByRole('combobox', { name: '电脑难度' })
    expect((selector as HTMLSelectElement).value).toBe('normal')
    await user.selectOptions(selector, 'challenge')
    expect(localStorage.getItem('xiangqi-progress')).toBe(before)
    expect(screen.getByText(/最多看三着/)).toBeTruthy()
    page.unmount()
    render(<App />)
    expect((screen.getByRole('combobox', { name: '电脑难度' }) as HTMLSelectElement).value).toBe('challenge')
    await user.click(screen.getByRole('button', { name: '重新开局' }))
    expect((screen.getByRole('combobox', { name: '电脑难度' }) as HTMLSelectElement).value).toBe('challenge')
  })
  it('follows the black player automatically and returns to red for local play', () => {
    // Keep the worker deadline frozen while checking the display, regardless of machine load.
    vi.useFakeTimers()
    const now = Date.now()
    const terminate = vi.fn()
    vi.stubGlobal('Worker', class { postMessage() {} terminate = terminate })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '执黑对电脑' }))
    expect(Date.now()).toBe(now)
    expect(screen.getByRole('status').textContent).toBe('电脑正在思考…')
    expect(loadProgress(localStorage).session.records).toHaveLength(0)
    expect(screen.getByText('当前视角：黑方在下 · 跟随执棋方')).toBeTruthy()
    expect(screen.getByRole('button', { name: '黑车，坐标 0,0' }).style.left).toBe('95%')
    expect(screen.getByRole('button', { name: '黑将，坐标 4,0' }).tabIndex).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: '本机双人' }))
    expect(screen.getByText('当前视角：红方在下 · 跟随执棋方')).toBeTruthy()
    expect(loadProgress(localStorage).session.mode).toBe('local')
    expect(terminate).toHaveBeenCalledOnce()
    const stored = localStorage.getItem('xiangqi-progress')
    act(() => vi.advanceTimersByTime(1401))
    expect(localStorage.getItem('xiangqi-progress')).toBe(stored)
    expect(loadProgress(localStorage).session.records).toHaveLength(0)
  })

  it('keeps the selection, live game and learning history when flipped, restored or reloaded', async () => {
    const first = play(createSession(), { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    if (!first.ok) throw new Error('expected legal move')
    saveProgress(localStorage, {
      ...defaultProgress(), session: first.session, practicedUnits: ['board'], masteredUnits: ['board'],
      completedLessons: ['board'], assistedVariants: ['board-basic'], milestones: { firstMatch: true, independentMatch: true },
      learningMatch: { active: false, standardStart: true, coachEnabled: false, coachEverUsed: true, checkpointSeen: true, toolMoveUsed: true },
    })
    const user = userEvent.setup()
    const { unmount } = render(<App />)
    const stored = localStorage.getItem('xiangqi-progress')
    await user.click(screen.getByRole('button', { name: '黑卒，坐标 0,3' }))
    await user.click(screen.getByRole('button', { name: '翻转棋盘' }))
    expect(screen.getByText('当前视角：黑方在下 · 手动选择')).toBeTruthy()
    expect(screen.getByRole('button', { name: '黑卒，坐标 0,3，已选中' }).style.left).toBe('95%')
    expect(screen.getByRole('button', { name: '交叉点 0,4，可走落点' }).style.left).toBe('95%')
    expect(localStorage.getItem('xiangqi-progress')).toBe(stored)
    expect(JSON.parse(localStorage.getItem('xiangqi-preferences')!).preferences).toEqual({ ...defaultPreferences(), boardView: 'black', aiDifficulty: 'normal' })
    unmount()
    render(<App />)
    expect(screen.getByRole('button', { name: '黑车，坐标 0,0' }).style.left).toBe('95%')
    expect(localStorage.getItem('xiangqi-progress')).toBe(stored)
    await user.click(screen.getByRole('button', { name: '跟随执棋方' }))
    expect(screen.getByText('当前视角：红方在下 · 跟随执棋方')).toBeTruthy()
    expect(localStorage.getItem('xiangqi-progress')).toBe(stored)
    expect(loadProgress(localStorage).session.records).toEqual(first.session.records)
  })

  it('retains manual perspective across new games and preserves saved difficulty', async () => {
    localStorage.setItem('xiangqi-preferences', JSON.stringify({ version: 1, preferences: { boardView: 'black', aiDifficulty: 'challenge' } }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '重新开局' }))
    expect(screen.getByRole('button', { name: '黑车，坐标 0,0' }).style.left).toBe('95%')
    await user.click(screen.getByRole('button', { name: '翻转棋盘' }))
    expect(screen.getByText('当前视角：红方在下 · 手动选择')).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('xiangqi-preferences')!).preferences).toEqual({ ...defaultPreferences(), boardView: 'red', aiDifficulty: 'challenge' })
  })

  it('keeps classroom and rule examples red while the match preference is black', async () => {
    localStorage.setItem('xiangqi-preferences', JSON.stringify({ version: 1, preferences: { boardView: 'black', aiDifficulty: 'normal' } }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '规则手册' }))
    const boards = screen.getAllByRole('group', { name: '象棋棋盘' })
    expect(within(boards[0]).getByRole('button', { name: '黑车，坐标 0,0' }).style.left).toBe('95%')
    expect(within(boards[1]).getByRole('button', { name: '黑车，坐标 0,0' }).style.left).toBe('5%')
    await user.click(screen.getByRole('button', { name: '新手课堂' }))
    expect(screen.getByRole('button', { name: '黑车，坐标 0,0' }).style.left).toBe('5%')
  })
})
