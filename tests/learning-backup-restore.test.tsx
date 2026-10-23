// @vitest-environment jsdom
import { StrictMode, useLayoutEffect } from 'react'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOpeningTraining } from '../src/ui/useOpeningTraining'
import { useTacticsTraining } from '../src/ui/useTacticsTraining'
import { defaultOpeningTraining, transitionOpeningTraining } from '../src/core/opening-training'
import { defaultTactics, transitionTactics } from '../src/core/tactics'
import { OPENING_TRAINING_KEY } from '../src/core/opening-training-storage'
import { TACTICS_KEY } from '../src/core/tactics-storage'
import { defaultProgress, loadProgress, saveProgress, type Progress } from '../src/core/storage'
import { extractCoursePractice } from '../src/core/learning-backup'
import { createSession, play, setView, type Session } from '../src/core/session'
import { openings } from '../src/content/openings'
import { curriculum } from '../src/content/curriculum'
import { puzzles } from '../src/content/puzzles'
import { defaultPractice, startPractice } from '../src/core/practice'
import type { LearningBackupController } from '../src/ui/useLearningBackup'
import { App } from '../src/ui/App'

const captured = vi.hoisted(() => ({ beforeEffect: null as null | (() => void), workspace: null as null | { backupController: LearningBackupController; progress: Progress; onProgress: (fn: (p: Progress) => Progress) => void }, match: null as null | { session: Session; onChange: (s: Session) => void; onStart: (s: Session) => void; onCollect: () => void; collectionNotice: string; persistenceStatus: string } }))
vi.mock('../src/ui/LearningWorkspace', () => ({ LearningWorkspace: (props: NonNullable<typeof captured.workspace>) => { captured.workspace = props; useLayoutEffect(() => { captured.beforeEffect?.() }); return <div>备份工作区</div> } }))
vi.mock('../src/ui/Match', () => ({ Match: (props: NonNullable<typeof captured.match>) => { captured.match = props; return <div>当前棋局</div> } }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); captured.workspace = null; captured.match = null; captured.beforeEffect = null })
function memory(key: string, raw: string | null = null) {
  const values = new Map<string, string>(raw === null ? [] : [[key, raw]])
  const fault = { write: false }
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { if (fault.write) throw Error('full'); values.set(key, value) }),
    removeItem: vi.fn((key: string) => { values.delete(key) }) }
  return { values, fault, storage, getStorage: () => storage }
}
const openingStart = { type: 'start', openingId: openings[0].id, side: 'red' } as const
const tacticsStart = { type: 'start', request: { mode: 'topic', topic: 'checks' } } as const

// The same persistence contract applies to both independently stored training modules.
for (const kind of ['opening', 'tactics'] as const) {
  const key = kind === 'opening' ? OPENING_TRAINING_KEY : TACTICS_KEY
  const initial = () => kind === 'opening' ? defaultOpeningTraining() : defaultTactics()
  const incoming = () => kind === 'opening' ? transitionOpeningTraining(defaultOpeningTraining(), openingStart).data : transitionTactics(defaultTactics(), tacticsStart).data
  function useTraining(getStorage: ReturnType<typeof memory>['getStorage']) {
    const opening = useOpeningTraining(getStorage), tactics = useTacticsTraining(getStorage)
    return kind === 'opening' ? opening : tactics
  }
  describe(`${kind} restore persistence`, () => {
    it('strictly validates before writing; equal data is a zero-write no-op; success writes once and clears feedback', () => {
      const store = memory(key), { result } = renderHook(() => useTraining(store.getStorage), { wrapper: StrictMode })
      act(() => { expect(result.current.restore({ ...initial(), extra: true }).ok).toBe(false) })
      expect(store.storage.setItem).not.toHaveBeenCalled()
      act(() => { expect(result.current.restore(initial())).toEqual({ ok: true, changed: false }) })
      expect(store.storage.setItem).not.toHaveBeenCalled()
      const data = incoming()
      expect(data).not.toEqual(initial())
      act(() => { expect(result.current.restore(data)).toEqual({ ok: true, changed: true }) })
      expect(store.storage.setItem).toHaveBeenCalledTimes(1)
      expect(store.storage.setItem).toHaveBeenCalledWith(key, expect.any(String))
      expect(result.current.data).toEqual(data)
      expect(result.current.data).not.toBe(data)
      expect(result.current.persistenceStatus).toBe('saved')
      expect(result.current.message).toBe('')
      expect(result.current.notice).toBe('')
      expect(store.storage.removeItem).not.toHaveBeenCalled()
    })
    it('failed replacement preserves dirty memory, status, feedback and raw, then retry saves that memory', () => {
      const store = memory(key), { result } = renderHook(() => useTraining(store.getStorage))
      act(() => { result.current.restore(incoming()) })
      const raw = store.values.get(key)
      store.fault.write = true
      act(() => { result.current.dispatch({ type: 'hint' }) })
      const previous = result.current
      expect(previous.persistenceStatus).toBe('failed')
      act(() => { expect(result.current.restore(initial()).ok).toBe(false) })
      expect(result.current.data).toBe(previous.data)
      expect(result.current.notice).toBe(previous.notice)
      expect(result.current.message).toBe(previous.message)
      expect(result.current.persistenceStatus).toBe(previous.persistenceStatus)
      expect(result.current.unsaved).toBe(true)
      const writes = store.storage.setItem.mock.calls.length
      act(() => { expect(result.current.restore(previous.data)).toEqual({ ok: true, changed: false }) })
      expect(store.storage.setItem).toHaveBeenCalledTimes(writes)
      expect(result.current.persistenceStatus).toBe('failed')
      expect(result.current.unsaved).toBe(true)
      expect(store.values.get(key)).toBe(raw)
      store.fault.write = false
      act(() => { expect(result.current.retrySave()).toBe(true) })
      expect(JSON.parse(store.values.get(key)!)).toEqual(previous.data)
    })
    it('preserves blocked temporary memory on failure and permits explicit replacement even with equal defaults', () => {
      const store = memory(key, 'unknown raw'), { result } = renderHook(() => useTraining(store.getStorage))
      store.fault.write = true
      act(() => { expect(result.current.restore(initial()).ok).toBe(false) })
      expect(result.current.persistenceStatus).toBe('blocked')
      act(() => { result.current.dispatch(kind === 'opening' ? openingStart : tacticsStart); result.current.dispatch({ type: 'hint' }) })
      const temporary = result.current
      act(() => { expect(result.current.restore(initial()).ok).toBe(false) })
      expect(result.current.data).toBe(temporary.data)
      expect(result.current.notice).toBe(temporary.notice)
      expect(result.current.message).toBe(temporary.message)
      expect(result.current.unsaved).toBe(true)
      expect(result.current.persistenceStatus).toBe('blocked')
      expect(store.values.get(key)).toBe('unknown raw')
      store.fault.write = false
      act(() => { expect(result.current.restore(initial())).toEqual({ ok: true, changed: true }) })
      expect(result.current.persistenceStatus).toBe('saved')
      expect(result.current.unsaved).toBe(false)
      expect(store.values.get(key)).not.toBe('unknown raw')
    })
    it('writes a blocked replacement even when its content equals the fallback defaults', () => {
      const store = memory(key, 'unknown raw'), { result } = renderHook(() => useTraining(store.getStorage), { wrapper: StrictMode })
      expect(result.current.data).toEqual(initial())
      act(() => { expect(result.current.restore(initial())).toEqual({ ok: true, changed: true }) })
      expect(store.storage.setItem).toHaveBeenCalledTimes(1)
      expect(JSON.parse(store.values.get(key)!)).toEqual(initial())
      expect(result.current.persistenceStatus).toBe('saved')
    })
    it('dispatch after restore in one batch consumes restored data from the synchronous ref', () => {
      const store = memory(key), { result } = renderHook(() => useTraining(store.getStorage))
      act(() => { result.current.restore(incoming()); result.current.dispatch({ type: 'hint' }); expect(result.current.getSnapshot().data).not.toEqual(incoming()) })
      expect(kind === 'opening' ? 'active' in result.current.data && result.current.data.active : 'round' in result.current.data && result.current.data.round).toBeTruthy()
      expect(result.current.message).not.toBe('')
      expect(JSON.parse(store.values.get(key)!)).toEqual(result.current.data)
      expect(store.storage.setItem).toHaveBeenCalledTimes(2)
    })
  })
}

const cycle = [
  { from: { x: 0, y: 9 }, to: { x: 0, y: 8 } }, { from: { x: 0, y: 0 }, to: { x: 0, y: 1 } },
  { from: { x: 0, y: 8 }, to: { x: 0, y: 9 } }, { from: { x: 0, y: 1 }, to: { x: 0, y: 0 } },
]
const matches = new Map<number, Session>()
function matchAt(plies: number) {
  if (matches.has(plies)) return matches.get(plies)!
  let session = createSession('ai')
  for (let n = 0; n < plies; n++) {
    const result = play(session, cycle[n % 4]); if (!result.ok) throw Error(result.error); session = result.session
  }
  matches.set(plies, session)
  return session
}
function seedMatch(plies: number, awarded = true) {
  const progress = { ...defaultProgress(), session: matchAt(plies), milestones: { firstMatch: awarded, independentMatch: awarded },
    learningMatch: { active: true, standardStart: true, coachEnabled: false, coachEverUsed: false, checkpointSeen: false } }
  saveProgress(localStorage, progress)
  return progress
}
function openWorkspace() { fireEvent.click(screen.getByText('新手课堂', { selector: 'button' })); return captured.workspace! }
function changedCourse() {
  const unit = curriculum[0].units[0]
  return { completedLessons: [curriculum[0].id], solvedPuzzles: [puzzles[0].id], practicedUnits: [unit.id], masteredUnits: [unit.id],
    assistedVariants: [unit.variants[0].id], milestones: { firstMatch: true, independentMatch: false },
    practice: startPractice(defaultPractice(), { mode: 'recommended' }) }
}
function progressWrites(spy: ReturnType<typeof vi.spyOn>) { return spy.mock.calls.filter(call => call[0] === 'xiangqi-progress') }
describe('App course restore controller', () => {
  it('writes once under StrictMode, exposes latest memory and preserves exact nonlearning objects and collection notice', () => {
    render(<StrictMode><App /></StrictMode>)
    act(() => { captured.match!.onStart(createSession('ai')) })
    const match = captured.match!
    const played = play(match.session, { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    if (!played.ok) throw Error(played.error)
    act(() => { match.onChange({ ...played.session, notes: { '1': '保留笔记' } }); match.onCollect() })
    const workspace = openWorkspace(), before = workspace.progress
    const notice = captured.match!.collectionNotice
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    act(() => { expect(workspace.backupController.restore('coursePractice', changedCourse())).toEqual({ ok: true, changed: true }) })
    const after = captured.workspace!.progress
    expect(after.session).toBe(before.session)
    expect(before.learningMatch).not.toBeNull()
    expect(after.learningMatch).toBe(before.learningMatch)
    expect(after.collection).toBe(before.collection)
    expect(after).toEqual({ ...before, ...changedCourse() })
    expect(loadProgress(localStorage)).toEqual(after)
    expect(progressWrites(spy)).toHaveLength(1)
    expect(captured.workspace!.backupController.modules.coursePractice.data).toEqual(changedCourse())
    fireEvent.click(screen.getByText('开始对弈', { selector: 'button' }))
    expect(captured.match!.collectionNotice).toBe(notice)
    expect(captured.match!.persistenceStatus).toBe('saved')
  })
  it('uses latest queued session/collection changes and later updates do not undo the restored learning fields', () => {
    render(<App />)
    const match = captured.match!, workspace = openWorkspace()
    const played = play(match.session, { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    if (!played.ok) throw Error(played.error)
    const latestSession = { ...played.session, notes: { '1': '同批次最新' } }
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    act(() => {
      match.onChange(latestSession)
      match.onCollect()
      expect(workspace.backupController.restore('coursePractice', changedCourse()).ok).toBe(true)
      workspace.onProgress(p => ({ ...p, solvedPuzzles: [] }))
    })
    const after = captured.workspace!.progress
    expect(after.session).toBe(latestSession)
    expect(after.collection!.items).toHaveLength(1)
    expect(after.milestones).toEqual(changedCourse().milestones)
    expect(loadProgress(localStorage)).toEqual(after)
    expect(progressWrites(spy)).toHaveLength(2)
  })
  it('invalid incoming data and equal data never write; storage failure preserves raw and all current state', () => {
    render(<App />)
    const workspace = openWorkspace(), before = workspace.progress, raw = localStorage.getItem('xiangqi-progress')
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    act(() => {
      expect(workspace.backupController.restore('coursePractice', { ...changedCourse(), extra: true }).ok).toBe(false)
      expect(workspace.backupController.restore('coursePractice', extractCoursePractice(before))).toEqual({ ok: true, changed: false })
    })
    expect(progressWrites(spy)).toHaveLength(0)
    spy.mockImplementation(() => { throw Error('capacity') })
    act(() => { expect(workspace.backupController.restore('coursePractice', changedCourse()).ok).toBe(false) })
    expect(captured.workspace!.progress).toBe(before)
    expect(localStorage.getItem('xiangqi-progress')).toBe(raw)
    expect(captured.workspace!.backupController.modules.coursePractice.unsaved).toBe(false)
  })
  it('never autosaves or exports a fallback over an unknown original game and retains blocking across navigation', () => {
    localStorage.setItem('xiangqi-progress', 'unknown formal game')
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    render(<StrictMode><App /></StrictMode>)
    let workspace = openWorkspace()
    expect(workspace.backupController.modules.coursePractice).toMatchObject({ blocked: true, data: null })
    expect(workspace.backupController.modules.coursePractice.notice).not.toBe('')
    act(() => { expect(workspace.backupController.restore('coursePractice', changedCourse()).ok).toBe(false) })
    fireEvent.click(screen.getByText('开始对弈', { selector: 'button' }))
    expect(captured.match!.persistenceStatus).toBe('failed')
    workspace = openWorkspace()
    expect(workspace.backupController.modules.coursePractice.blocked).toBe(true)
    expect(localStorage.getItem('xiangqi-progress')).toBe('unknown formal game')
    expect(progressWrites(spy)).toHaveLength(0)
  })
  it('blocks incompatible old learning records without exporting or restoring over them', () => {
    saveProgress(localStorage, { ...defaultProgress(), practicedUnits: ['old-unknown-unit'] })
    render(<App />)
    const workspace = openWorkspace()
    expect(workspace.backupController.modules.coursePractice.data).toBeNull()
    expect(workspace.backupController.modules.coursePractice.notice).not.toBe('')
    const raw = localStorage.getItem('xiangqi-progress'), spy = vi.spyOn(Storage.prototype, 'setItem')
    expect(workspace.backupController.modules.coursePractice.blocked).toBe(true)
    act(() => { expect(workspace.backupController.restore('coursePractice', changedCourse()).ok).toBe(false) })
    expect(progressWrites(spy)).toHaveLength(0)
    expect(localStorage.getItem('xiangqi-progress')).toBe(raw)
  })
  it('exports unsaved current memory after failed automatic persistence', () => {
    render(<App />); openWorkspace()
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('full') })
    act(() => { captured.workspace!.onProgress(p => ({ ...p, milestones: { firstMatch: true, independentMatch: true } })) })
    expect(captured.workspace!.backupController.modules.coursePractice.unsaved).toBe(true)
    expect(captured.workspace!.backupController.modules.coursePractice.data!.milestones.independentMatch).toBe(true)
    const before = captured.workspace!.progress, raw = localStorage.getItem('xiangqi-progress'), controller = captured.workspace!.backupController
    const writes = progressWrites(spy).length
    act(() => { expect(controller.restore('coursePractice', extractCoursePractice(before))).toEqual({ ok: true, changed: false }) })
    expect(progressWrites(spy)).toHaveLength(writes)
    act(() => { expect(controller.restore('coursePractice', changedCourse()).ok).toBe(false) })
    expect(captured.workspace!.progress).toBe(before)
    expect(localStorage.getItem('xiangqi-progress')).toBe(raw)
    expect(controller.modules.coursePractice.unsaved).toBe(true)
    spy.mockRestore()
  })
  it('ignores an older rendered autosave effect after a layout event restores newer data', () => {
    render(<App />); const workspace = openWorkspace()
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    captured.beforeEffect = () => {
      captured.beforeEffect = null
      expect(captured.workspace!.backupController.restore('coursePractice', changedCourse()).ok).toBe(true)
    }
    act(() => { workspace.onProgress(p => ({ ...p, milestones: { firstMatch: true, independentMatch: true } })) })
    expect(captured.workspace!.progress.milestones).toEqual(changedCourse().milestones)
    expect(loadProgress(localStorage)).toEqual(captured.workspace!.progress)
    expect(progressWrites(spy)).toHaveLength(1)
  })
  it('routes independent restores to their own keys and its old controller getters see the same batch latest data', () => {
    render(<App />); const workspace = openWorkspace(), before = workspace.progress
    const raw = localStorage.getItem('xiangqi-progress'), controller = workspace.backupController
    const opening = transitionOpeningTraining(defaultOpeningTraining(), openingStart).data
    const tactics = transitionTactics(defaultTactics(), tacticsStart).data
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    act(() => {
      expect(controller.restore('opening', opening)).toEqual({ ok: true, changed: true })
      expect(controller.modules.opening.data).toEqual(opening)
      expect(controller.restore('tactics', tactics)).toEqual({ ok: true, changed: true })
      expect(controller.modules.tactics.data).toEqual(tactics)
    })
    expect(captured.workspace!.progress).toBe(before)
    expect(localStorage.getItem('xiangqi-progress')).toBe(raw)
    expect(progressWrites(spy)).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem(OPENING_TRAINING_KEY)!)).toEqual(opening)
    expect(JSON.parse(localStorage.getItem(TACTICS_KEY)!)).toEqual(tactics)
  })
  it('retains restored terminal protection across notes, review, collection and other course saves', () => {
    seedMatch(120)
    let page = render(<App />), workspace = openWorkspace()
    act(() => { expect(workspace.backupController.restore('coursePractice', extractCoursePractice(defaultProgress())).ok).toBe(true) })
    const marker = JSON.parse(localStorage.getItem('xiangqi-progress')!).restoredTerminalMatch
    expect(typeof marker).toBe('string')
    fireEvent.click(screen.getByText('开始对弈', { selector: 'button' }))
    act(() => {
      captured.match!.onChange({ ...setView(captured.match!.session, 60), notes: { '1': '回看笔记' } })
      captured.match!.onCollect()
    })
    workspace = openWorkspace()
    act(() => { workspace.onProgress(p => ({ ...p, completedLessons: [curriculum[0].id] })) })
    expect(JSON.parse(localStorage.getItem('xiangqi-progress')!).restoredTerminalMatch).toBe(marker)
    expect(workspace.backupController.modules.coursePractice.data).not.toHaveProperty('restoredTerminalMatch')
    page.unmount(); page = render(<App />); workspace = openWorkspace()
    expect(workspace.progress.milestones).toEqual({ firstMatch: false, independentMatch: false })
    expect(workspace.progress.session.viewIndex).toBe(60)
    expect(workspace.progress.session.notes).toEqual({ '1': '回看笔记' })
    expect(workspace.progress.collection!.items).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem('xiangqi-progress')!).restoredTerminalMatch).toBe(marker)
    expect(Object.keys(localStorage).sort()).toEqual(['xiangqi-preferences', 'xiangqi-progress'])
  })
  it('continues awarding eligible old pending saves without restore metadata', () => {
    seedMatch(120, false)
    expect(JSON.parse(localStorage.getItem('xiangqi-progress')!)).not.toHaveProperty('restoredTerminalMatch')
    render(<App />)
    expect(openWorkspace().progress.milestones).toEqual({ firstMatch: true, independentMatch: true })
    expect(loadProgress(localStorage).milestones).toEqual({ firstMatch: true, independentMatch: true })
  })
  it('awards a real future finish when restoration took place during an unfinished match', () => {
    seedMatch(119)
    render(<App />); const workspace = openWorkspace()
    act(() => { workspace.backupController.restore('coursePractice', extractCoursePractice(defaultProgress())) })
    expect(JSON.parse(localStorage.getItem('xiangqi-progress')!)).not.toHaveProperty('restoredTerminalMatch')
    fireEvent.click(screen.getByText('开始对弈', { selector: 'button' }))
    const result = play(captured.match!.session, cycle[3]); if (!result.ok) throw Error(result.error)
    act(() => { captured.match!.onChange(result.session) })
    expect(loadProgress(localStorage).milestones).toEqual({ firstMatch: true, independentMatch: true })
  })
  it('clears protection when starting a new game and awards even when its eventual terminal identity repeats', () => {
    seedMatch(120)
    render(<App />); const workspace = openWorkspace()
    act(() => { workspace.backupController.restore('coursePractice', extractCoursePractice(defaultProgress())) })
    expect(JSON.parse(localStorage.getItem('xiangqi-progress')!).restoredTerminalMatch).toBeTruthy()
    fireEvent.click(screen.getByText('开始对弈', { selector: 'button' }))
    act(() => { captured.match!.onStart(createSession('ai')) })
    expect(JSON.parse(localStorage.getItem('xiangqi-progress')!)).not.toHaveProperty('restoredTerminalMatch')
    act(() => { captured.match!.onChange(matchAt(120)) })
    expect(loadProgress(localStorage).milestones).toEqual({ firstMatch: true, independentMatch: true })
  })
  it('no-op and failed restore leave existing terminal bookkeeping and raw bytes unchanged', () => {
    seedMatch(120)
    const page = render(<App />); let workspace = openWorkspace()
    act(() => { workspace.backupController.restore('coursePractice', extractCoursePractice(defaultProgress())) })
    const raw = localStorage.getItem('xiangqi-progress'), before = captured.workspace!.progress
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    act(() => { expect(workspace.backupController.restore('coursePractice', extractCoursePractice(before))).toEqual({ ok: true, changed: false }) })
    expect(progressWrites(spy)).toHaveLength(0)
    spy.mockImplementation(() => { throw Error('full') })
    act(() => { expect(workspace.backupController.restore('coursePractice', changedCourse()).ok).toBe(false) })
    expect(captured.workspace!.progress).toBe(before)
    expect(localStorage.getItem('xiangqi-progress')).toBe(raw)
    spy.mockRestore(); page.unmount(); render(<App />); workspace = openWorkspace()
    expect(workspace.progress.milestones).toEqual({ firstMatch: false, independentMatch: false })
  })
  it('imports milestones as records without awarding an eligible real terminal match again', () => {
    const session = matchAt(120)
    expect(session.game.result?.reason).toBe('natural-limit')
    saveProgress(localStorage, { ...defaultProgress(), session, milestones: { firstMatch: true, independentMatch: true },
      learningMatch: { active: true, standardStart: true, coachEnabled: false, coachEverUsed: false, checkpointSeen: false } })
    const page = render(<App />); const workspace = openWorkspace(), before = workspace.progress
    const data = extractCoursePractice(defaultProgress())
    act(() => { expect(workspace.backupController.restore('coursePractice', data).ok).toBe(true) })
    expect(captured.workspace!.progress).toEqual({ ...before, ...data })
    expect(captured.workspace!.progress.session).toBe(before.session)
    expect(loadProgress(localStorage).milestones).toEqual({ firstMatch: false, independentMatch: false })
    page.unmount()
    render(<App />)
    const reloaded = openWorkspace().progress
    expect(reloaded.milestones).toEqual(data.milestones)
    expect(loadProgress(localStorage).milestones).toEqual(data.milestones)
    expect(reloaded.session).toEqual(before.session)
    expect(reloaded.learningMatch).toEqual(before.learningMatch)
  })
})
