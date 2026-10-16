// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import { createSession, play, resign, setView } from '../src/core/session'
import { setNote } from '../src/core/review'
import { archiveSession, MAX_GAME_FILE_BYTES } from '../src/core/archive-codec'
import * as codec from '../src/core/archive-codec'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'
import type { Progress } from '../src/core/storage'
import { openings } from '../src/content/openings'

function history(ended = false) {
  let session = createSession()
  for (const move of [
    { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } },
    { from: { x: 0, y: 3 }, to: { x: 0, y: 4 } },
    { from: { x: 2, y: 6 }, to: { x: 2, y: 5 } },
  ]) {
    const result = play(session, move)
    if (!result.ok) throw new Error(result.error)
    session = result.session
  }
  session = setNote(session, 2, '<b>保存的观察</b>')
  return ended ? resign(session, 'black') : session
}
function archive(title = '测试棋局', ended = false) {
  const result = archiveSession(history(ended), title)
  if (!result.ok) throw new Error(result.error)
  return result.value
}
function seed(count = 0, ended = false) {
  const progress = { ...defaultProgress(), session: setView(history(ended), 2), collection: { version: 1 as const, items: Array.from({ length: count }, (_, n) => ({ id: `seed-${n}`, savedAt: 1700000000000 + n, archive: archive(`棋局${n + 1}`, ended) })) } }
  saveProgress(localStorage, progress)
  return loadProgress(localStorage)
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }))
const read = () => loadProgress(localStorage)
function choose(text: Promise<string> | string, size = 100) {
  const file = new File([''], '棋局.json', { type: 'application/json' })
  Object.defineProperty(file, 'size', { value: size })
  const readText = vi.fn().mockReturnValue(Promise.resolve(text))
  Object.defineProperty(file, 'text', { value: readText })
  fireEvent.change(screen.getByLabelText('导入棋局文件'), { target: { files: [file] } })
  return readText
}
async function importValid(title = '导入棋局') {
  await act(async () => { choose(JSON.stringify(archive(title))) })
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear() })

describe('collection isolated copies and management', () => {
  it('saves every move and only saved notes while reviewing; preview cannot edit or change the match', () => {
    const before = seed()
    render(<App />)
    fireEvent.change(screen.getByLabelText('本着笔记'), { target: { value: '未保存草稿' } })
    click('收藏本局')
    const saved = read()
    expect(saved.collection?.items).toHaveLength(1)
    expect(saved.collection?.items[0].archive.moves).toHaveLength(3)
    expect(saved.collection?.items[0].archive.notes).toEqual(before.session.notes)
    expect(saved.session).toEqual(before.session)
    click('棋局收藏'); click('查看')
    expect(screen.getAllByLabelText('象棋棋盘')).toHaveLength(1)
    expect(screen.queryByLabelText('本着笔记')).toBeNull()
    expect(screen.queryByRole('button', { name: '保存笔记' })).toBeNull()
    click('上一步')
    expect(screen.getByText('<b>保存的观察</b>')).toBeTruthy()
    expect(document.querySelector('b')).toBeNull()
    fireEvent.click(screen.getByLabelText('红兵，坐标 2,6'))
    fireEvent.click(screen.getByLabelText('交叉点 2,5'))
    expect(read()).toEqual(saved)
    click('开始对弈')
    expect((screen.getByLabelText('回看进度') as HTMLInputElement).value).toBe('2')
  })
  it('renames with trimmed titles, confirms delete and clear, and preserves all other progress', () => {
    const before = seed(2)
    render(<App />); click('棋局收藏')
    const row = screen.getByRole('article', { name: '棋局1' })
    fireEvent.click(within(row).getByRole('button', { name: '重命名' }))
    fireEvent.change(screen.getByLabelText('收藏名称'), { target: { value: '  新名称  ' } }); click('确认改名')
    expect(read().collection?.items[0].archive.title).toBe('新名称')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(within(screen.getByRole('article', { name: '新名称' })).getByRole('button', { name: '删除' }))
    expect(read().collection?.items).toHaveLength(2)
    click('清空收藏'); expect(read().collection?.items).toHaveLength(2)
    confirm.mockReturnValue(true)
    fireEvent.click(within(screen.getByRole('article', { name: '新名称' })).getByRole('button', { name: '删除' }))
    expect(read().collection?.items).toHaveLength(1)
    click('清空收藏'); expect(read().collection?.items).toHaveLength(0)
    const { collection: _old, ...oldRest } = before
    const { collection: _new, ...newRest } = read()
    expect(newRest).toEqual(oldRest)
  })
  it('does not collect a new empty game and reports actual browser write failure', () => {
    render(<App />); click('收藏本局')
    expect(screen.getByText(/合计须为1至600着/)).toBeTruthy()
    expect(read().collection?.items).toHaveLength(0)
    cleanup(); seed(); render(<App />)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    click('收藏本局'); click('棋局收藏')
    expect(screen.getByText(/浏览器保存失败.*刷新后可能丢失/)).toBeTruthy()
    expect(screen.queryByText('收藏已保存到当前浏览器。')).toBeNull()
  })
  it('handles two batched additions at 19 entries atomically with capacity feedback', () => {
    seed(19); render(<App />)
    const collect = screen.getByRole('button', { name: '收藏本局' })
    act(() => { fireEvent.click(collect); fireEvent.click(collect) })
    expect(read().collection?.items).toHaveLength(20)
    expect(screen.getByText(/收藏最多保存20盘/)).toBeTruthy()
  })
  it.each(openings)('collects an old $title starting position even before a new move is recorded', opening => {
    let positioned = createSession()
    for (const step of opening.steps) {
      const result = play(positioned, step.move)
      if (!result.ok) throw new Error(result.error)
      positioned = result.session
    }
    const initial = { ...createSession(), game: positioned.game, snapshots: [positioned.game] }
    saveProgress(localStorage, { ...defaultProgress(), session: initial })
    render(<App />); click('收藏本局')
    expect(read().collection?.items[0].archive.startMoves).toEqual(opening.steps.map(step => step.move))
    expect(read().collection?.items[0].archive.moves).toEqual([])
    expect(read().session).toEqual(initial)
  })
  it('opens a semantically broken local item with a replay error and still permits deletion', () => {
    const before = seed(1)
    before.collection!.items[0].archive.moves[0] = { from: { x: 0, y: 0 }, to: { x: 0, y: 9 } }
    saveProgress(localStorage, before)
    const inspect = vi.spyOn(codec, 'inspectArchive')
    render(<App />)
    expect(inspect).not.toHaveBeenCalled()
    click('棋局收藏')
    expect(inspect).not.toHaveBeenCalled()
    expect(screen.queryByText(/红方获胜/)).toBeNull()
    click('查看')
    expect(screen.getByRole('alert').textContent).toMatch(/第1着.*仍可删除/)
    expect(screen.queryByRole('button', { name: '从末着继续练习' })).toBeNull()
    expect(read().session).toEqual(before.session)
    vi.spyOn(window, 'confirm').mockReturnValue(true); click('删除')
    expect(read().collection?.items).toHaveLength(0)
  })
  it('cancels current AI on collection navigation, ignores a late reply, and resumes only on returning', () => {
    const workers: { onmessage: ((event: MessageEvent) => void) | null; terminate: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn> }[] = []
    vi.stubGlobal('Worker', class {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror = null
      terminate = vi.fn()
      postMessage = vi.fn()
      constructor() { workers.push(this) }
    })
    const before = seed(1)
    before.session = { ...before.session, mode: 'ai', playerSide: 'red', viewIndex: 3 }
    saveProgress(localStorage, before)
    render(<App />)
    expect(workers).toHaveLength(1)
    const reply = workers[0].onmessage
    click('棋局收藏'); expect(workers[0].terminate).toHaveBeenCalled()
    click('查看')
    act(() => reply?.({ data: { move: { from: { x: 2, y: 3 }, to: { x: 2, y: 4 } } } } as MessageEvent))
    expect(workers).toHaveLength(1)
    expect(read().session).toEqual(before.session)
    click('开始对弈')
    expect(workers).toHaveLength(2)
    expect(workers[1].postMessage.mock.calls[0][0].game).toEqual(before.session.game)
  })
})

describe('validated import and cancellation', () => {
  it('checks file size before reading; rejects invalid input without changing progress', async () => {
    const before = seed(); render(<App />); click('棋局收藏')
    const readText = choose('{}', MAX_GAME_FILE_BYTES + 1)
    expect(readText).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/512.*KiB/)
    await act(async () => { choose('{') })
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '加入收藏' })).toBeNull()
    expect(read()).toEqual(before)
  })
  it('previews before adding, cancel leaves progress alone, and explicit repeated adds get fresh ids', async () => {
    const before = seed(); render(<App />); click('棋局收藏')
    await importValid()
    expect(read()).toEqual(before)
    click('取消预览'); expect(screen.queryByRole('button', { name: '加入收藏' })).toBeNull()
    await importValid(); click('加入收藏'); click('加入收藏')
    const items = read().collection!.items
    expect(items).toHaveLength(2)
    expect(items[0].id).not.toBe(items[1].id)
    expect(read().session).toEqual(before.session)
  })
  it.each(['cancel', 'replace', 'leave', 'open'] as const)('ignores a late file read after %s', async action => {
    seed(1); render(<App />); click('棋局收藏')
    let resolve!: (value: string) => void
    choose(new Promise<string>(done => { resolve = done }))
    if (action === 'cancel') click('取消预览')
    if (action === 'replace') await importValid('新文件')
    if (action === 'leave') click('开始对弈')
    if (action === 'open') click('查看')
    await act(async () => { resolve(JSON.stringify(archive('过期文件'))) })
    expect(screen.queryByText('过期文件')).toBeNull()
    if (action === 'replace') expect(screen.getByRole('heading', { name: '新文件' })).toBeTruthy()
    if (action === 'open') expect(within(screen.getByRole('region', { name: '棋局只读预览' })).getByRole('heading', { name: '棋局1' })).toBeTruthy()
    expect(read().collection?.items).toHaveLength(1)
  })
  it('clears a previously valid preview when the new file is invalid', async () => {
    seed(); render(<App />); click('棋局收藏'); await importValid()
    await act(async () => { choose(JSON.stringify({ ...archive(), moves: [{ from: { x: 0, y: 0 }, to: { x: 0, y: 9 } }] })) })
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '加入收藏' })).toBeNull()
  })
})

describe('export and explicit continuation', () => {
  it('exports without notes by default, includes them only by choice, resets and revokes URLs', () => {
    seed(1, true)
    const writer = vi.spyOn(codec, 'writeGameFile')
    const create = vi.fn().mockReturnValue('blob:game'), revoke = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<App />); click('导出本局')
    expect(screen.getByRole('dialog', { name: '导出棋局' })).toBeTruthy()
    expect(screen.getByText(/结束方式：黑方认输/)).toBeTruthy()
    expect((screen.getByLabelText('包含复盘笔记') as HTMLInputElement).checked).toBe(false)
    click('下载 JSON 文件')
    expect(writer.mock.lastCall?.[1]).toBe(false)
    fireEvent.click(screen.getByLabelText('包含复盘笔记')); click('下载 JSON 文件')
    expect(writer.mock.lastCall?.[1]).toBe(true)
    expect(create).toHaveBeenCalledTimes(2); expect(revoke).toHaveBeenCalledTimes(2)
    click('取消导出'); click('棋局收藏'); click('导出')
    expect((screen.getByLabelText('包含复盘笔记') as HTMLInputElement).checked).toBe(false)
  })
  it('downloads a real, portable JSON archive with complete history and chosen notes', async () => {
    const before = seed()
    const blobs: Blob[] = [], filenames: string[] = []
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: (blob: Blob) => { blobs.push(blob); return 'blob:game' } })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { filenames.push(this.download) })
    render(<App />); click('导出本局'); click('下载 JSON 文件')
    fireEvent.click(screen.getByLabelText('包含复盘笔记')); click('下载 JSON 文件')
    const texts = await Promise.all(blobs.map(blob => new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob) })))
    const files = texts.map(text => JSON.parse(text))
    expect(files[0].notes).toBeUndefined()
    expect(files[1].notes).toEqual(before.session.notes)
    expect(files[0].moves).toHaveLength(3)
    expect(codec.readGameFile(texts[1]).ok).toBe(true)
    expect(filenames).toEqual(['yixiang-game.json', 'yixiang-game.json'])
    click('取消导出'); expect(read()).toEqual(before)
  })
  it('continues only after explicit mode/side selection and replacement confirmation without awards', () => {
    const before = seed(1)
    render(<App />); click('棋局收藏'); click('查看'); click('上一步')
    expect(read().session).toEqual(before.session)
    click('从末着继续练习')
    fireEvent.change(screen.getByLabelText('续练方式'), { target: { value: 'ai' } })
    fireEvent.change(screen.getByLabelText('续练执棋方'), { target: { value: 'black' } })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    click('确认继续练习'); expect(read()).toEqual(before)
    confirm.mockReturnValue(true); click('确认继续练习')
    expect(read().session).toMatchObject({ mode: 'ai', playerSide: 'black', viewIndex: 3, drawOfferedBy: null })
    expect(read().learningMatch).toMatchObject({ active: true, standardStart: false })
    expect(read().milestones).toEqual(before.milestones)
    expect(read().collection).toEqual(before.collection)
    expect(screen.getByText('局面练习，不参与首盘记录。')).toBeTruthy()
    expect(screen.queryByText(/可完成首盘/)).toBeNull()
  })
  it('hides continuation for terminal archives and renders practice provenance after resignation', () => {
    const before = seed(1, true)
    const practice: Progress = { ...before, learningMatch: { active: true, standardStart: false, coachEnabled: false, coachEverUsed: false, checkpointSeen: false, toolMoveUsed: false } }
    saveProgress(localStorage, practice)
    render(<App />)
    expect(screen.getByText('局面练习，不参与首盘记录。')).toBeTruthy()
    click('棋局收藏'); click('查看')
    expect(screen.queryByRole('button', { name: '从末着继续练习' })).toBeNull()
  })
  it('keeps preview and progress intact when continuation options fail validation', () => {
    const before = seed(1)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />); click('棋局收藏'); click('查看'); click('从末着继续练习')
    fireEvent.change(screen.getByLabelText('续练方式'), { target: { value: 'unsupported' } })
    click('确认继续练习')
    expect(screen.getByRole('region', { name: '棋局只读预览' })).toBeTruthy()
    expect(screen.getByText('请选择有效的对弈模式和执棋方')).toBeTruthy()
    expect(read()).toEqual(before)
  })
  it('restores local continued practice across refresh and preserves course/practice history on moves and ending', () => {
    const seeded = seed(1)
    const progress = { ...seeded, completedLessons: ['legacy'], solvedPuzzles: ['puzzle'], practicedUnits: ['piece-rook'], masteredUnits: ['piece-rook'], assistedVariants: ['rook-assisted'] }
    saveProgress(localStorage, progress)
    const before = read()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const page = render(<App />)
    click('棋局收藏'); click('查看'); click('从末着继续练习'); click('确认继续练习')
    expect(read().learningMatch).toMatchObject({ active: false, standardStart: false })
    page.unmount(); render(<App />)
    expect(screen.getByText('局面练习，不参与首盘记录。')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('黑卒，坐标 2,3'))
    fireEvent.click(screen.getByLabelText('交叉点 2,4，可走落点'))
    click('悔棋'); click('认输')
    const { session: _session, learningMatch: _match, ...rest } = read()
    const { session: _oldSession, learningMatch: _oldMatch, ...oldRest } = before
    expect(rest).toEqual(oldRest)
    expect(read().learningMatch?.standardStart).toBe(false)
    expect(screen.getByText('局面练习，不参与首盘记录。')).toBeTruthy()
  })
})
