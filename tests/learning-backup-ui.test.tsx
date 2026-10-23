// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LearningBackup } from '../src/ui/LearningBackup'
import type { LearningBackupController } from '../src/ui/useLearningBackup'
import { BACKUP_MODULE_LABELS, decodeLearningBackup, encodeLearningBackup, extractCoursePractice, MAX_LEARNING_BACKUP_BYTES, type BackupModule, type LearningBackup as Backup } from '../src/core/learning-backup'
import { defaultProgress } from '../src/core/storage'
import { defaultOpeningTraining, transitionOpeningTraining } from '../src/core/opening-training'
import { defaultTactics } from '../src/core/tactics'
import { openings } from '../src/content/openings'

const keys: BackupModule[] = ['coursePractice', 'opening', 'tactics']
const nativeURL = URL
let createURL: ReturnType<typeof vi.fn>, revokeURL: ReturnType<typeof vi.fn>, anchorClick: ReturnType<typeof vi.spyOn>
function fixture(): Backup {
  return { format: 'yixiang-learning-backup', version: 1, exportedAt: '2026-10-22T01:02:03.000Z', modules: {
    coursePractice: extractCoursePractice(defaultProgress()), opening: defaultOpeningTraining(), tactics: defaultTactics(),
  } }
}
function controller(): LearningBackupController {
  const modules = fixture().modules
  return { modules: {
    coursePractice: { data: modules.coursePractice!, blocked: false, unsaved: false, notice: '' },
    opening: { data: modules.opening!, blocked: false, unsaved: false, notice: '' },
    tactics: { data: modules.tactics!, blocked: false, unsaved: false, notice: '' },
  }, restore: vi.fn(() => ({ ok: true, changed: true })) }
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }))
const disabled = (element: HTMLElement) => (element as HTMLButtonElement).disabled
function file(raw = encodeLearningBackup(fixture()), name = 'my-backup.json') { return new File([raw], name, { type: 'application/json' }) }
function select(input: File) { fireEvent.change(screen.getByLabelText('选择学习备份文件'), { target: { files: [input] } }) }
async function preview(input = file()) { select(input); return await screen.findByRole('region', { name: '备份预览' }) }
function deferredFile() {
  let resolve!: (raw: string) => void, reject!: (error: Error) => void
  const pending = new Promise<string>((yes, no) => { resolve = yes; reject = no })
  const input = file(); Object.defineProperty(input, 'text', { value: () => pending })
  return { input, resolve, reject }
}
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob) })
}
beforeEach(() => {
  createURL = vi.fn(() => 'blob:learning'); revokeURL = vi.fn()
  vi.stubGlobal('URL', class extends nativeURL { static createObjectURL = createURL; static revokeObjectURL = revokeURL })
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('learning backup UI', () => {
  it('downloads only selected current in-memory modules and releases the detached download link', async () => {
    const source = controller(), write = vi.spyOn(Storage.prototype, 'setItem')
    render(<LearningBackup controller={source} active onBack={() => {}} onCourseRestored={() => {}} />)
    click('下载学习备份')
    expect(createURL).toHaveBeenCalledTimes(1)
    expect(Object.keys(decodeLearningBackup(await readBlob(createURL.mock.calls[0][0])).modules)).toEqual(keys)
    fireEvent.click(screen.getByLabelText('课堂与单步练习')); fireEvent.click(screen.getByLabelText('多步战术'))
    source.modules.opening.data = transitionOpeningTraining(defaultOpeningTraining(), { type: 'start', openingId: openings[0].id, side: 'black' }).data
    source.modules.opening.unsaved = true
    click('下载学习备份')
    const downloaded = decodeLearningBackup(await readBlob(createURL.mock.calls[1][0]))
    expect(downloaded.modules).toEqual({ opening: source.modules.opening.data })
    expect(screen.getByRole('status', { name: '备份操作状态' }).textContent).toContain('包含尚未写入本机的记录')
    expect(screen.getByText('已发起下载，请在浏览器下载列表中查看')).toBeTruthy()
    const anchor = anchorClick.mock.instances[1] as HTMLAnchorElement
    expect(anchor.download).toMatch(/^yixiang-learning-backup-\d{8}-\d{6}\.json$/)
    expect(anchor.isConnected).toBe(false); expect(revokeURL).toHaveBeenCalledTimes(2)
    expect(source.restore).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled()
  })
  it('requires a selection and rechecks availability at download time', () => {
    const source = controller()
    render(<LearningBackup controller={source} active onBack={() => {}} onCourseRestored={() => {}} />)
    keys.forEach(key => fireEvent.click(screen.getByLabelText(BACKUP_MODULE_LABELS[key])))
    expect(disabled(screen.getByRole('button', { name: '下载学习备份' }))).toBe(true)
    fireEvent.click(screen.getByLabelText('开局跟练'))
    source.modules.opening.blocked = true
    click('下载学习备份')
    expect(createURL).not.toHaveBeenCalled()
    expect(screen.getByRole('status', { name: '备份操作状态' }).textContent).toContain('不可备份')
  })
  it('cleans up a download failure and gives a generic message', () => {
    anchorClick.mockImplementation(() => { throw Error('PRIVATE-DOWNLOAD-DETAIL') })
    render(<LearningBackup controller={controller()} active onBack={() => {}} onCourseRestored={() => {}} />)
    click('下载学习备份')
    expect(revokeURL).toHaveBeenCalledWith('blob:learning')
    expect(document.querySelector('a[download]')).toBeNull()
    expect(screen.getByRole('status', { name: '备份操作状态' }).textContent).toContain('下载失败')
    expect(document.body.textContent).not.toContain('PRIVATE-DOWNLOAD-DETAIL')
  })
  it('labels blocked exports and only forbids course restore, permitting protected training replacement', async () => {
    const source = controller()
    keys.forEach(key => { source.modules[key] = { data: null, blocked: true, unsaved: false, notice: `${key}原存档受保护` } })
    render(<LearningBackup controller={source} active onBack={() => {}} onCourseRestored={() => {}} />)
    keys.forEach(key => {
      expect(disabled(screen.getByLabelText(BACKUP_MODULE_LABELS[key]))).toBe(true)
      expect((screen.getByLabelText(BACKUP_MODULE_LABELS[key]) as HTMLInputElement).checked).toBe(false)
      expect(screen.getByText(`${key}原存档受保护`)).toBeTruthy()
    })
    await preview()
    expect(disabled(screen.getByRole('button', { name: '恢复课堂与单步练习' }))).toBe(true)
    click('恢复开局跟练')
    expect(screen.getByRole('dialog').textContent).toContain('将以备份替换本模块受保护存档')
    click('确认恢复开局跟练')
    expect(source.restore).toHaveBeenCalledWith('opening', fixture().modules.opening)
  })
  it('previews a fully validated file read-only with time, safe basename and current-versus-backup summaries', async () => {
    const source = controller(), write = vi.spyOn(Storage.prototype, 'setItem')
    render(<LearningBackup controller={source} active onBack={() => {}} onCourseRestored={() => {}} />)
    const region = await preview(file(undefined, 'private\\<img onerror=x>.json'))
    expect(region.textContent).toContain('<img onerror=x>.json')
    expect(region.textContent).not.toContain('private')
    expect(region.querySelector('img')).toBeNull()
    expect(region.textContent).toContain('2026-10-22T01:02:03.000Z')
    expect(within(region).getAllByText('当前页面记录')).toHaveLength(3)
    expect(within(region).getAllByText('备份文件记录')).toHaveLength(3)
    expect(document.activeElement).toBe(within(region).getByRole('heading', { name: '备份预览' }))
    click('取消预览'); expect(screen.queryByRole('region', { name: '备份预览' })).toBeNull()
    expect(source.restore).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled()
  })
  it.each([
    ['format', JSON.stringify({ ...fixture(), format: 'xiangqi-game' })],
    ['unknown block', JSON.stringify({ ...fixture(), modules: { ...fixture().modules, extra: {} } })],
    ['invalid one block', JSON.stringify({ ...fixture(), modules: { ...fixture().modules, tactics: {} } })],
    ['multibyte oversize after read', ' '.repeat(1) + '汉'.repeat(MAX_LEARNING_BACKUP_BYTES / 2)],
  ])('rejects %s as a whole and clears previous valid preview', async (_name, raw) => {
    const source = controller()
    render(<LearningBackup controller={source} active onBack={() => {}} onCourseRestored={() => {}} />)
    await preview()
    const invalid = file(raw)
    // Simulate a small reported File.size to exercise the independent post-read UTF-8 bound.
    Object.defineProperty(invalid, 'size', { value: 1 })
    select(invalid)
    await waitFor(() => expect(screen.getByRole('status', { name: '备份操作状态' }).textContent).toMatch(/不|超过|字段|模块/))
    expect(screen.queryByRole('region', { name: '备份预览' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^恢复/ })).toBeNull()
    expect(source.restore).not.toHaveBeenCalled()
  })
  it('checks file size before invoking its reader', async () => {
    const input = file(); Object.defineProperty(input, 'size', { value: MAX_LEARNING_BACKUP_BYTES + 1 })
    const read = vi.fn(); Object.defineProperty(input, 'text', { value: read })
    render(<LearningBackup controller={controller()} active onBack={() => {}} onCourseRestored={() => {}} />)
    select(input)
    expect(read).not.toHaveBeenCalled()
    expect(screen.getByRole('status', { name: '备份操作状态' }).textContent).toContain('256 KiB')
  })
  it('never exposes file-read exception details', async () => {
    const pending = deferredFile()
    render(<LearningBackup controller={controller()} active onBack={() => {}} onCourseRestored={() => {}} />)
    select(pending.input); await act(async () => pending.reject(Error('PRIVATE-READ-DETAIL')))
    expect(screen.getByRole('status', { name: '备份操作状态' }).textContent).toContain('读取文件失败')
    expect(document.body.textContent).not.toContain('PRIVATE-READ-DETAIL')
  })
  for (const key of keys) {
    const label = BACKUP_MODULE_LABELS[key]
    it(`${key}: confirms latest replacement scope, cancels read-only, retries failure and applies exactly once`, async () => {
      const source = controller(), onCourse = vi.fn()
      vi.mocked(source.restore).mockReturnValueOnce({ ok: false, error: '写入失败，请重试' }).mockReturnValue({ ok: true, changed: true })
      render(<LearningBackup controller={source} active onBack={() => {}} onCourseRestored={onCourse} />)
      await preview(); click(`恢复${label}`)
      expect(screen.getByRole('dialog').textContent).toContain('替换当前训练轮')
      click('取消恢复'); expect(source.restore).not.toHaveBeenCalled()
      click(`恢复${label}`); click(`确认恢复${label}`)
      expect(screen.getByRole('region', { name: '备份预览' }).textContent).toContain('写入失败，请重试')
      expect(disabled(screen.getByRole('button', { name: `恢复${label}` }))).toBe(false)
      click(`恢复${label}`); click(`确认恢复${label}`)
      expect(source.restore).toHaveBeenCalledTimes(2)
      expect(disabled(screen.getByRole('button', { name: `恢复${label}` }))).toBe(true)
      expect(onCourse).toHaveBeenCalledTimes(key === 'coursePractice' ? 1 : 0)
    })
    it(`${key}: no-op retains unsaved explanation and does not reset the course`, async () => {
      const source = controller(), onCourse = vi.fn()
      source.modules[key].unsaved = true; source.modules[key].notice = '原写入失败，可稍后重试'
      vi.mocked(source.restore).mockReturnValue({ ok: true, changed: false })
      render(<LearningBackup controller={source} active onBack={() => {}} onCourseRestored={onCourse} />)
      await preview(); click(`恢复${label}`); click(`确认恢复${label}`)
      expect(screen.getByRole('region', { name: '备份预览' }).textContent).toContain('与当前记录一致')
      expect(screen.getAllByText('原写入失败，可稍后重试').length).toBeGreaterThan(0)
      expect(onCourse).not.toHaveBeenCalled()
    })
  }
  it('rechecks latest course protection at confirmation without invoking restore', async () => {
    const source = controller()
    render(<LearningBackup controller={source} active onBack={() => {}} onCourseRestored={() => {}} />)
    await preview(); click('恢复课堂与单步练习')
    source.modules.coursePractice.blocked = true
    click('确认恢复课堂与单步练习')
    expect(source.restore).not.toHaveBeenCalled()
    expect(screen.getByRole('region', { name: '备份预览' }).textContent).toContain('受保护')
  })
  it('blocks repeated confirmation in the same batch', async () => {
    const source = controller()
    render(<StrictMode><LearningBackup controller={source} active onBack={() => {}} onCourseRestored={() => {}} /></StrictMode>)
    await preview(); click('恢复多步战术')
    const button = screen.getByRole('button', { name: '确认恢复多步战术' })
    act(() => { fireEvent.click(button); fireEvent.click(button) })
    expect(source.restore).toHaveBeenCalledTimes(1)
  })
  it('consumes a failed confirmation once even when clicked twice before rendering', async () => {
    const source = controller()
    vi.mocked(source.restore).mockReturnValue({ ok: false, error: '保存失败' })
    render(<LearningBackup controller={source} active onBack={() => {}} onCourseRestored={() => {}} />)
    await preview(); click('恢复开局跟练')
    const confirm = screen.getByRole('button', { name: '确认恢复开局跟练' })
    act(() => { fireEvent.click(confirm); fireEvent.click(confirm) })
    expect(source.restore).toHaveBeenCalledTimes(1)
    click('恢复开局跟练'); click('确认恢复开局跟练')
    expect(source.restore).toHaveBeenCalledTimes(2)
  })
  it.each(['new file', 'cancel', 'leave', 'unmount'] as const)('ignores stale read completion and rejection after %s in StrictMode', async action => {
    const source = controller(), pending = deferredFile()
    const node = (active = true) => <StrictMode><LearningBackup controller={source} active={active} onBack={() => {}} onCourseRestored={() => {}} /></StrictMode>
    const view = render(node()); select(pending.input)
    if (action === 'new file') await preview(file(undefined, 'newer.json'))
    if (action === 'cancel') click('取消预览')
    if (action === 'leave') { view.rerender(node(false)); view.rerender(node(true)) }
    if (action === 'unmount') view.unmount()
    await act(async () => pending.resolve(encodeLearningBackup(fixture())))
    if (action === 'new file') expect(screen.getByRole('region', { name: '备份预览' }).textContent).toContain('newer.json')
    else expect(screen.queryByRole('region', { name: '备份预览' })).toBeNull()
    expect(source.restore).not.toHaveBeenCalled()
  })
  it('keeps a pending read when only the controller object identity changes', async () => {
    const source = controller(), pending = deferredFile()
    const view = render(<LearningBackup controller={source} active onBack={() => {}} onCourseRestored={() => {}} />)
    select(pending.input)
    view.rerender(<LearningBackup controller={{ ...source }} active onBack={() => {}} onCourseRestored={() => {}} />)
    await act(async () => pending.resolve(encodeLearningBackup(fixture())))
    expect(screen.getByRole('region', { name: '备份预览' })).toBeTruthy()
  })
  it('ignores an old rejected read after a newer valid preview', async () => {
    const pending = deferredFile()
    render(<StrictMode><LearningBackup controller={controller()} active onBack={() => {}} onCourseRestored={() => {}} /></StrictMode>)
    select(pending.input); await preview(file(undefined, 'latest.json'))
    await act(async () => pending.reject(Error('secret old failure')))
    expect(screen.getByRole('region', { name: '备份预览' }).textContent).toContain('latest.json')
    expect(screen.getByRole('status', { name: '备份操作状态' }).textContent).not.toContain('失败')
  })
  it('retains a parsed preview across leaving and focuses the panel title when reopened', async () => {
    const source = controller()
    const node = (active: boolean) => <div hidden={!active}><LearningBackup controller={source} active={active} onBack={() => {}} onCourseRestored={() => {}} /></div>
    const view = render(node(true)); await preview()
    view.rerender(node(false))
    expect(screen.queryByRole('status')).toBeNull()
    view.rerender(node(true))
    expect(screen.getByRole('region', { name: '备份预览' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '学习进度备份与恢复' }))
  })
})
