// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import legacy from './fixtures/notation-v15.json'
import { notationUnits } from '../src/content/notation-lessons'
import { curriculum, type MoveTask } from '../src/content/curriculum'
import { openings } from '../src/content/openings'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'
import { decodeLearningBackup, encodeLearningBackup, extractCoursePractice, type LearningBackup } from '../src/core/learning-backup'
import { defaultOpeningTraining, transitionOpeningTraining } from '../src/core/opening-training'
import { OPENING_TRAINING_KEY } from '../src/core/opening-training-storage'
import { defaultTactics, transitionTactics } from '../src/core/tactics'
import { TACTICS_KEY } from '../src/core/tactics-storage'
import { ENDGAME_STORAGE_KEY } from '../src/core/endgame-lessons-storage'
import { createSession, play } from '../src/core/session'
import { archiveSession } from '../src/core/archive-codec'
import { addCollection, defaultCollection } from '../src/core/collection'
import { defaultPreferences, savePreferences } from '../src/core/preferences'
import { createStudy } from '../src/core/study'
import { saveStudy } from '../src/core/study-storage'
import { legalMoves, type Game } from '../src/core/rules'
import type { Move } from '../src/core/types'

const files = notationUnits[0]
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }))
const shortcut = () => click('棋谱识读专项')
const board = () => screen.getByRole('group', { name: '象棋棋盘' })
const cell = (x: number, y: number) => screen.getByRole('button', { name: new RegExp(`(?:坐标 |交叉点 )${x},${y}(?:，|$)`) })
const table = () => screen.queryByRole('table', { name: '双方路数（屏幕从左到右）' })
const snapshot = () => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]))
function solve(task: MoveTask) { const { from, to } = task.solutions[0]; fireEvent.click(cell(from.x, from.y)); fireEvent.click(cell(to.x, to.y)) }
function start() { render(<App />); click('新手课堂'); shortcut() }
function challenge() { click('开始原局面练习'); solve(files.practice as MoveTask); click('进入未见变式') }
function openBackup() { click('学习总览'); click('备份与恢复') }
function returnCourse() { click('返回学习总览'); click('章节学习') }
async function choose(data: string | LearningBackup = legacy.v1) {
  fireEvent.change(screen.getByLabelText('选择学习备份文件'), { target: { files: [new File([typeof data === 'string' ? data : encodeLearningBackup(data)], 'learning.json', { type: 'application/json' })] } })
  await screen.findByRole('region', { name: '备份预览' })
}
function prepareDisplay() {
  challenge(); click('提示 1 · 观察'); click('显示路数辅助'); click('翻转本题视角'); fireEvent.click(cell(6,2))
  return board()
}
function expectDisplay(original: HTMLElement) {
  expect(board()).toBe(original)
  expect(screen.getByText('当前视角：黑方在下')).toBeTruthy()
  expect(table()).toBeTruthy()
  expect(screen.getByText(files.variants[0].prompt)).toBeTruthy()
  expect(screen.getByText(files.variants[0].hints[0])).toBeTruthy()
  expect(cell(6,2).getAttribute('aria-pressed')).toBe('true')
}

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete (document as Document & { modelContext?: unknown }).modelContext })

describe('notation integration through the real App', { timeout: 30000 }, () => {
  it.each([false, true])('shortcut chooses first unmastered or first review (all mastered: %s) without writes or a new course instance', all => {
    const initial = defaultProgress()
    initial.practicedUnits = notationUnits.map(unit => unit.id)
    initial.masteredUnits = notationUnits.slice(0, all ? 4 : 2).map(unit => unit.id)
    saveProgress(localStorage, initial)
    render(<App />); click('新手课堂')
    const original = board(), before = snapshot(), write = vi.spyOn(Storage.prototype, 'setItem')
    shortcut()
    expect(screen.getByRole('heading', { name: notationUnits[all ? 0 : 2].title })).toBeTruthy()
    expect(screen.getByText('演示 · 先看一遍')).toBeTruthy()
    expect(board()).toBe(original)
    expect(snapshot()).toEqual(before); expect(write).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows real four-unit counts, keeps legacy labels separate, and navigates every card item via demo', () => {
    const initial = defaultProgress()
    initial.practicedUnits = ['read-notation', files.id, notationUnits[1].id]
    initial.masteredUnits = ['read-notation', files.id]
    initial.completedLessons = [curriculum[6].id]
    saveProgress(localStorage, initial); start()
    const original = board(), before = snapshot(), write = vi.spyOn(Storage.prototype, 'setItem')
    click('学习总览')
    const card = screen.getByRole('region', { name: '棋谱识读专项' })
    expect(within(card).getByRole('heading', { name: '棋谱识读专项' })).toBeTruthy()
    expect(card.textContent).toContain('已掌握 1 / 4 · 已练未掌握 1 / 4 · 暂无记录 2 / 4')
    const course = screen.getByRole('region', { name: '课堂进度' })
    expect(course.textContent).toContain('已掌握 2 / 21 · 已练未掌握 1 / 21 · 暂无知识点记录 18 / 21')
    expect(course.textContent).toContain('旧版章节记录 1 / 8')
    expect(within(course).getByText('已掌握 2 / 5 · 已练未掌握 1 · 暂无记录 2')).toBeTruthy()
    for (const [index, unit] of notationUnits.entries()) {
      const current = screen.getByRole('region', { name: '棋谱识读专项' })
      fireEvent.click(within(current).getByRole('button', { name: `${index === 0 ? '复习' : '学习'}：${unit.title}` }))
      expect(screen.getByRole('heading', { name: unit.title })).toBeTruthy()
      expect(screen.getByText('演示 · 先看一遍')).toBeTruthy()
      expect(board()).toBe(original)
      click('学习总览')
    }
    expect(snapshot()).toEqual(before); expect(write).not.toHaveBeenCalled()
  })

  it('preserves current board, hints, table, orientation and selection across overview and backup export/preview/cancel', async () => {
    start(); const original = prepareDisplay(), before = snapshot()
    const create = vi.fn((_blob: Blob) => 'blob:learning'), revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const write = vi.spyOn(Storage.prototype, 'setItem')
    click('学习总览'); click('章节学习'); expectDisplay(original)
    openBackup(); click('下载学习备份')
    expect(create).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledOnce()
    const exported = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(create.mock.calls[0][0]) })
    expect(decodeLearningBackup(exported).modules.coursePractice?.assistedVariants).toContain(files.variants[0].id)
    await choose(); click('恢复课堂与单步练习'); click('取消恢复'); click('取消预览'); returnCourse()
    expectDisplay(original)
    expect(snapshot()).toEqual(before); expect(write).not.toHaveBeenCalled()
  })

  it('keeps seenIds when explicit shortcut/card jumps reset only the temporary task', () => {
    start(); challenge()
    expect(screen.getByText(files.variants[0].prompt)).toBeTruthy()
    expect(loadProgress(localStorage).assistedVariants).toEqual([])
    const original = board()
    click('翻转本题视角'); click('学习总览')
    const card = screen.getByRole('region', { name: '棋谱识读专项' })
    fireEvent.click(within(card).getByRole('button', { name: `学习：${notationUnits[1].title}` }))
    shortcut()
    expect(board()).toBe(original)
    expect(screen.getByText('当前视角：红方在下')).toBeTruthy()
    expect(screen.getByText('演示 · 先看一遍')).toBeTruthy()
    expect(table()).toBeTruthy()
    challenge()
    expect(screen.getByText(files.variants[1].prompt)).toBeTruthy()
    expect(loadProgress(localStorage).assistedVariants).toEqual([])
  })

  it.each(['opening', 'tactics', 'endgame'] as const)('restores changed %s data while preserving the entire live notation task', async key => {
    start(); const original = prepareDisplay(), before = loadProgress(localStorage)
    const data = decodeLearningBackup(legacy.otherModuleV2)
    if (key === 'opening') data.modules = { opening: transitionOpeningTraining(defaultOpeningTraining(), { type: 'start', openingId: openings[0].id, side: 'black' }).data }
    if (key === 'tactics') data.modules = { tactics: transitionTactics(defaultTactics(), { type: 'start', request: { mode: 'recommended' } }).data }
    const label = { opening: '开局跟练', tactics: '多步战术', endgame: '残局分步教学' }[key]
    const storageKey = { opening: OPENING_TRAINING_KEY, tactics: TACTICS_KEY, endgame: ENDGAME_STORAGE_KEY }[key]
    openBackup(); await choose(data)
    expect(JSON.parse(localStorage.getItem(storageKey)!)).not.toEqual(data.modules[key])
    click(`恢复${label}`); click(`确认恢复${label}`)
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual(data.modules[key])
    returnCourse(); expectDisplay(original)
    expect(loadProgress(localStorage)).toEqual(before)
  })

  it('resets only after successful changed course restore, then uses red demo defaults and retained restored assistance', async () => {
    start(); const original = prepareDisplay()
    const data = decodeLearningBackup(legacy.v1)
    data.modules.coursePractice!.assistedVariants.push(files.variants[0].id)
    openBackup(); await choose(data); click('恢复课堂与单步练习'); click('确认恢复课堂与单步练习')
    expect(screen.getByRole('status', { name: '课堂恢复结果' }).textContent).toContain('已恢复')
    expect(extractCoursePractice(loadProgress(localStorage))).toEqual(data.modules.coursePractice)
    click('章节学习')
    expect(board()).not.toBe(original)
    shortcut()
    expect(screen.getByText('演示 · 先看一遍')).toBeTruthy()
    expect(screen.getByText('当前视角：红方在下')).toBeTruthy(); expect(table()).toBeTruthy()
    challenge()
    expect(screen.getByText(files.variants[1].prompt)).toBeTruthy()
  })

  it('keeps raw records, current memory and board after a failed course restore', async () => {
    start(); const original = prepareDisplay(), before = snapshot(), memory = loadProgress(localStorage)
    openBackup(); await choose()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota') })
    click('恢复课堂与单步练习'); click('确认恢复课堂与单步练习')
    expect(screen.getByRole('status', { name: '课堂与单步练习恢复结果' }).textContent).toContain('失败')
    returnCourse(); expectDisplay(original)
    expect(snapshot()).toEqual(before); expect(loadProgress(localStorage)).toEqual(memory)
    click('学习总览')
    expect(screen.getByRole('region', { name: '棋谱识读专项' }).textContent).toContain('已练未掌握 1 / 4')
  })

  it('reads v15 progress without a catalog migration and changes only the existing three learning arrays when practicing', () => {
    localStorage.setItem('xiangqi-progress', legacy.progressRaw)
    const seeded = loadProgress(localStorage)
    const moved = play(createSession(), { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    if (!moved.ok) throw Error('fixture move failed')
    seeded.session = { ...moved.session, notes: { '1': '保留笔记' } }
    const archive = archiveSession(seeded.session, '保留收藏')
    if (!archive.ok) throw Error(archive.error)
    const collection = addCollection(defaultCollection(), archive.value, { id: 'keep-notation', savedAt: 1792620000000 })
    if (!collection.ok) throw Error(collection.error)
    seeded.collection = collection.value
    seeded.learningMatch = { active: true, standardStart: true, coachEnabled: false, coachEverUsed: true, checkpointSeen: true }
    saveProgress(localStorage, seeded)
    savePreferences(localStorage, { ...defaultPreferences(), boardTheme: 'clear', showCoordinates: true })
    const study = createStudy(seeded.session, { kind: 'match', title: '保留试走', orientation: 'black' })
    if (!study.ok) throw Error(study.error)
    saveStudy(localStorage, study.value)
    render(<App />); const before = loadProgress(localStorage), raw = snapshot()
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    click('新手课堂'); shortcut(); click('学习总览'); click('章节学习')
    expect(snapshot()).toEqual(raw); expect(writes).not.toHaveBeenCalled()
    challenge(); click('显示路数辅助'); solve(files.variants[0] as MoveTask)
    const after = loadProgress(localStorage)
    expect(after.practicedUnits).toEqual([...legacy.v15UnitIds, files.id])
    expect(after.masteredUnits).toEqual(legacy.v15UnitIds)
    expect(after.assistedVariants).toEqual([...legacy.coursePractice.assistedVariants, files.variants[0].id])
    expect({ ...after, practicedUnits: before.practicedUnits, masteredUnits: before.masteredUnits, assistedVariants: before.assistedVariants }).toEqual(before)
    expect(Object.keys(snapshot())).toEqual(Object.keys(raw))
    for (const [key, value] of Object.entries(raw)) if (key !== 'xiangqi-progress') expect(localStorage.getItem(key)).toBe(value)
    expect(writes.mock.calls.every(([key]) => key === 'xiangqi-progress')).toBe(true)
  })

  it('retains unsaved helper evidence in the overview and exported current memory', async () => {
    start(); challenge()
    const raw = snapshot()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota') })
    click('显示路数辅助'); solve(files.variants[0] as MoveTask); click('学习总览')
    const card = screen.getByRole('region', { name: '棋谱识读专项' })
    expect(card.textContent).toContain('已掌握 0 / 4 · 已练未掌握 1 / 4')
    expect(card.textContent).toContain('当前页面未保存记录')
    expect(snapshot()).toEqual(raw)
    click('备份与恢复')
    const create = vi.fn((_blob: Blob) => 'blob:unsaved')
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    click('下载学习备份')
    const exported = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(create.mock.calls[0][0]) })
    expect(decodeLearningBackup(exported).modules.coursePractice!.assistedVariants).toContain(files.variants[0].id)
    expect(screen.getByRole('status', { name: '备份操作状态' }).textContent).toContain('尚未写入本机')
  })

  it('protects unreadable original progress while new navigation remains read-only', async () => {
    localStorage.setItem('xiangqi-progress', 'protected-progress')
    start(); const before = snapshot(), write = vi.spyOn(Storage.prototype, 'setItem')
    click('学习总览'); click('备份与恢复'); await choose()
    expect((screen.getByRole('button', { name: '恢复课堂与单步练习' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('checkbox', { name: '课堂与单步练习' }) as HTMLInputElement).disabled).toBe(true)
    returnCourse(); shortcut()
    expect(snapshot()).toEqual(before); expect(write).not.toHaveBeenCalled()
  })

  it('keeps the task and records after a file read failure without exposing exception details', async () => {
    start(); const original = prepareDisplay(), before = snapshot()
    openBackup()
    const file = new File([''], 'unreadable.json')
    Object.defineProperty(file, 'text', { value: () => Promise.reject(Error('private-file-detail')) })
    fireEvent.change(screen.getByLabelText('选择学习备份文件'), { target: { files: [file] } })
    await screen.findByText('读取文件失败，请重新选择文件。')
    expect(screen.queryByRole('region', { name: '备份预览' })).toBeNull()
    expect(document.body.textContent).not.toContain('private-file-detail')
    returnCourse(); expectDisplay(original); expect(snapshot()).toEqual(before)
  })

  it('does not overwrite old raw progress when the storage getter is denied', () => {
    localStorage.setItem('xiangqi-progress', legacy.progressRaw)
    const get = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function(this: Storage, key: string) {
      if (key === 'xiangqi-progress') throw Error('denied')
      return get.call(this, key)
    })
    const write = vi.spyOn(Storage.prototype, 'setItem')
    render(<App />)
    // App's existing initial preference save is separate from protected Progress.
    expect(write.mock.calls.map(([key]) => key)).toEqual(['xiangqi-preferences'])
    write.mockClear()
    click('新手课堂'); shortcut(); click('学习总览'); click('备份与恢复')
    expect((screen.getByRole('checkbox', { name: '课堂与单步练习' }) as HTMLInputElement).disabled).toBe(true)
    returnCourse(); shortcut()
    expect(get.call(localStorage, 'xiangqi-progress')).toBe(legacy.progressRaw)
    expect(write).not.toHaveBeenCalled()
  })

  it('keeps native Worker cancellation, late-reply rejection and resumed formal session through the new entry', () => {
    class HeldWorker {
      static instances: HeldWorker[] = []
      request!: { id: number; game: Game }
      onmessage: ((event: { data: { id: number; move: Move } }) => void) | null = null
      terminate = vi.fn()
      constructor() { HeldWorker.instances.push(this) }
      postMessage(request: HeldWorker['request']) { this.request = request }
      reply() { this.onmessage?.({ data: { id: this.request.id, move: legalMoves(this.request.game.board, this.request.game.turn)[0] } }) }
    }
    vi.stubGlobal('Worker', HeldWorker)
    saveProgress(localStorage, { ...defaultProgress(), session: createSession('ai', 'black') })
    start(); const before = snapshot(), old = HeldWorker.instances[0]
    expect(old.terminate).toHaveBeenCalledOnce()
    act(() => old.reply()); expect(snapshot()).toEqual(before)
    click('学习总览'); click('返回当前对局')
    expect(HeldWorker.instances).toHaveLength(2)
    act(() => HeldWorker.instances[1].reply())
    expect(loadProgress(localStorage).session.records).toHaveLength(1)
    expect(loadProgress(localStorage).practicedUnits).toEqual([])
  })

  it('keeps game tools on the formal session when the notation task is active', () => {
    const tools: Record<string, { execute: (input: unknown) => unknown }> = {}
    Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool: (tool: { name: string; execute: (input: unknown) => unknown }) => { tools[tool.name] = tool } } })
    start(); challenge()
    const before = extractCoursePractice(loadProgress(localStorage))
    expect(tools.read_game_state.execute({})).toMatchObject({ moveCount: 0 })
    act(() => { expect(tools.play_move.execute({ from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })).toMatchObject({ ok: true }) })
    expect(loadProgress(localStorage).session.records).toHaveLength(1)
    expect(extractCoursePractice(loadProgress(localStorage))).toEqual(before)
    expect(screen.queryByRole('region', { name: '棋谱识读辅助' })).toBeNull()
  })
})
