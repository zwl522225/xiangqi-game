// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import { Match } from '../src/ui/Match'
import { createSession, play } from '../src/core/session'
import { setNote } from '../src/core/review'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'
import { startLearningMatch } from '../src/core/learning'
import { defaultPreferences } from '../src/core/preferences'
import { legalMoves } from '../src/core/rules'
import type { Game } from '../src/core/rules'
import type { AiDifficulty } from '../src/ai/difficulty'
import type { Move } from '../src/core/types'

class HeldWorker {
  static instances: HeldWorker[] = []
  request!: { id: number; game: Game; difficulty: AiDifficulty }
  onmessage: ((event: { data: { id?: number; move: Move | null } }) => void) | null = null
  onerror: (() => void) | null = null
  terminate = vi.fn()
  constructor() { HeldWorker.instances.push(this) }
  postMessage(request: HeldWorker['request']) { this.request = request }
  reply(move: Move | null = legalMoves(this.request.game.board, this.request.game.turn)[0], id = this.request.id) {
    this.onmessage?.({ data: { id, move } })
  }
}
beforeEach(() => {
  localStorage.clear()
  HeldWorker.instances = []
  vi.stubGlobal('Worker', HeldWorker)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
function pending() {
  const session = createSession('ai', 'black')
  saveProgress(localStorage, startLearningMatch(defaultProgress(), session))
  return session
}

describe('computer turn lifecycle', () => {
  it('sends the saved difficulty, disables changes while thinking, and leaves tool history clear', () => {
    pending()
    localStorage.setItem('xiangqi-preferences', JSON.stringify({ version: 1, preferences: { boardView: 'auto', aiDifficulty: 'easy' } }))
    render(<App />)
    const worker = HeldWorker.instances[0]
    expect(worker.request.difficulty).toBe('easy')
    expect((screen.getByRole('combobox', { name: '电脑难度' }) as HTMLSelectElement).disabled).toBe(true)
    act(() => worker.reply())
    expect(loadProgress(localStorage).session.records).toHaveLength(1)
    expect(loadProgress(localStorage).learningMatch?.toolMoveUsed).toBe(false)
    expect((screen.getByRole('combobox', { name: '电脑难度' }) as HTMLSelectElement).disabled).toBe(false)
  })

  it.each(['重新开局', '本机双人'])('cancels the old worker when %s is chosen and ignores its late reply', label => {
    pending()
    render(<App />)
    const old = HeldWorker.instances[0]
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(old.terminate).toHaveBeenCalled()
    act(() => old.reply())
    expect(loadProgress(localStorage).session.records).toHaveLength(0)
    if (label === '重新开局') {
      act(() => HeldWorker.instances[1].reply())
      expect(loadProgress(localStorage).session.records).toHaveLength(1)
    }
  })

  it('cancels on review and unmount, ignoring a previous response after returning to current', () => {
    const played = play(createSession('ai'), { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    if (!played.ok) throw new Error(played.error)
    saveProgress(localStorage, startLearningMatch(defaultProgress(), played.session))
    const page = render(<App />)
    const old = HeldWorker.instances[0]
    fireEvent.click(screen.getByRole('button', { name: '上一步' }))
    expect(old.terminate).toHaveBeenCalled()
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    fireEvent.click(screen.getByRole('button', { name: '标注棋盘' }))
    fireEvent.click(screen.getByLabelText(/交叉点 4,4/))
    expect(writes).not.toHaveBeenCalled()
    expect(screen.getByText('重点格 1 个、箭头 0 条')).toBeTruthy()
    act(() => old.reply())
    expect(loadProgress(localStorage).session.records).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '回到当前' }))
    expect(screen.getByText('重点格 0 个、箭头 0 条')).toBeTruthy()
    expect(screen.getByRole('button', { name: '标注棋盘' }).hasAttribute('disabled')).toBe(true)
    const current = HeldWorker.instances[1]
    page.unmount()
    expect(current.terminate).toHaveBeenCalled()
    act(() => current.reply())
    expect(loadProgress(localStorage).session.records).toHaveLength(1)
  })

  it.each(['error', 'illegal', 'timeout'] as const)('continues with a legal basic strategy and explains an actual %s fallback', cause => {
    vi.useFakeTimers()
    const session = pending()
    render(<App />)
    const worker = HeldWorker.instances[0]
    act(() => {
      if (cause === 'error') worker.onerror?.()
      else if (cause === 'illegal') worker.reply({ from: { x: 0, y: 0 }, to: { x: 0, y: 9 } })
      else vi.advanceTimersByTime(1401)
    })
    const saved = loadProgress(localStorage)
    expect(saved.session.records).toHaveLength(1)
    expect(legalMoves(session.game.board, session.game.turn)).toContainEqual(saved.session.records[0].move)
    expect(screen.getAllByRole('status').find(element => element.classList.contains('status-line'))!.textContent).toMatch(/基础策略/)
    expect(worker.terminate).toHaveBeenCalled()
    expect(saved.learningMatch?.toolMoveUsed).toBe(false)
    act(() => worker.reply())
    expect(loadProgress(localStorage).session.records).toHaveLength(1)
  })

  it('retains the worker for same-game metadata updates and applies to the latest session and callback', () => {
    const first = play(createSession('ai', 'red'), { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    if (!first.ok) throw new Error(first.error)
    const session = first.session
    const original = vi.fn()
    const latest = vi.fn()
    const props = {
      session, onChange: original, onStart: vi.fn(), learningMatch: null,
      milestones: { firstMatch: false, independentMatch: false }, onCoachChange: vi.fn(),
      onCheckpointSeen: vi.fn(), onLearn: vi.fn(), help: null, onHelpChange: vi.fn(),
      onOpeningPractice: vi.fn(), termId: '', onTerm: vi.fn(), preferences: defaultPreferences(), onPreferencesChange: vi.fn(),
    }
    const page = render(<Match {...props} />)
    const metadata = { ...setNote(session, 1, '最新笔记'), retainedMetadata: 'saved during thought' }
    page.rerender(<Match {...props} session={metadata} onChange={latest} />)
    expect(HeldWorker.instances).toHaveLength(1)
    act(() => HeldWorker.instances[0].reply())
    expect(original).not.toHaveBeenCalled()
    expect(latest.mock.calls[0][0].retainedMetadata).toBe('saved during thought')
    expect(latest.mock.calls[0][0].notes).toEqual({ '1': '最新笔记' })
  })

  it('cancels when difficulty changes externally and rejects mismatched response IDs', () => {
    const session = createSession('ai', 'black')
    const onChange = vi.fn()
    const props = {
      session, onChange, onStart: vi.fn(), learningMatch: null,
      milestones: { firstMatch: false, independentMatch: false }, onCoachChange: vi.fn(),
      onCheckpointSeen: vi.fn(), onLearn: vi.fn(), help: null, onHelpChange: vi.fn(),
      onOpeningPractice: vi.fn(), termId: '', onTerm: vi.fn(), preferences: defaultPreferences(), onPreferencesChange: vi.fn(),
    }
    const page = render(<Match {...props} />)
    const old = HeldWorker.instances[0]
    page.rerender(<Match {...props} preferences={{ ...defaultPreferences(), aiDifficulty: 'challenge' }} />)
    expect(old.terminate).toHaveBeenCalled()
    act(() => old.reply())
    expect(onChange).not.toHaveBeenCalled()
    const current = HeldWorker.instances[1]
    act(() => current.reply(undefined, current.request.id + 1))
    expect(onChange).not.toHaveBeenCalled()
    act(() => current.reply())
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
