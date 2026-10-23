// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import { curriculum } from '../src/content/curriculum'
import { openings } from '../src/content/openings'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'
import { BACKUP_MODULE_LABELS, encodeLearningBackup, extractCoursePractice, type BackupModule, type LearningBackup } from '../src/core/learning-backup'
import { defaultOpeningTraining, transitionOpeningTraining } from '../src/core/opening-training'
import { OPENING_TRAINING_KEY } from '../src/core/opening-training-storage'
import { defaultTactics, transitionTactics } from '../src/core/tactics'
import { TACTICS_KEY } from '../src/core/tactics-storage'
import { createSession, play } from '../src/core/session'
import { archiveSession } from '../src/core/archive-codec'
import { addCollection, defaultCollection } from '../src/core/collection'
import { defaultPreferences, savePreferences } from '../src/core/preferences'
import { createStudy } from '../src/core/study'
import { saveStudy } from '../src/core/study-storage'

const click = (name: string) => fireEvent.click(screen.getByText(name, { selector: 'button', exact: true }))
const snapshot = () => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]))
function openBackup() { click('新手课堂'); click('学习总览'); click('备份与恢复') }
function fixture(): LearningBackup {
  const course = extractCoursePractice(defaultProgress())
  course.practicedUnits = [curriculum[0].units[0].id]
  return { format: 'yixiang-learning-backup', version: 1, exportedAt: '2026-10-22T01:02:03.000Z', modules: {
    coursePractice: course,
    opening: transitionOpeningTraining(defaultOpeningTraining(), { type: 'start', openingId: openings[0].id, side: 'black' }).data,
    tactics: transitionTactics(defaultTactics(), { type: 'start', request: { mode: 'recommended' } }).data,
  } }
}
async function choose(data = fixture()) {
  fireEvent.change(screen.getByLabelText('选择学习备份文件'), { target: { files: [new File([encodeLearningBackup(data)], 'transfer.json', { type: 'application/json' })] } })
  await screen.findByRole('region', { name: '备份预览' })
}
beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('learning backup real App integration', () => {
  it.each(['coursePractice', 'opening', 'tactics'] as BackupModule[])('%s: real storage failure preserves state and a retry writes once', async key => {
    render(<App />); openBackup(); await choose()
    const before = snapshot(), label = BACKUP_MODULE_LABELS[key]
    const original = Storage.prototype.setItem
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota') })
    click(`恢复${label}`); click(`确认恢复${label}`)
    expect(snapshot()).toEqual(before)
    expect(screen.getByRole('region', { name: `${label}预览` }).textContent).toMatch(/失败/)
    expect(write).toHaveBeenCalledTimes(1)
    write.mockImplementation(original); write.mockClear()
    click(`恢复${label}`); click(`确认恢复${label}`)
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    if (key === 'coursePractice') expect(loadProgress(localStorage).practicedUnits).toEqual(fixture().modules.coursePractice!.practicedUnits)
    else expect(JSON.parse(localStorage.getItem(key === 'opening' ? OPENING_TRAINING_KEY : TACTICS_KEY)!)).toEqual(fixture().modules[key])
  })

  it('restoring an identical course keeps its board and does not write or leave the preview', async () => {
    render(<App />); click('新手课堂'); click('开始原局面练习')
    const board = screen.getByRole('group', { name: '象棋棋盘' })
    click('学习总览'); click('备份与恢复')
    const data = fixture(); data.modules = { coursePractice: extractCoursePractice(loadProgress(localStorage)) }
    await choose(data)
    const write = vi.spyOn(Storage.prototype, 'setItem')
    click('恢复课堂与单步练习'); click('确认恢复课堂与单步练习')
    expect(screen.getByRole('region', { name: '备份预览' }).textContent).toContain('与当前记录一致')
    expect(write).not.toHaveBeenCalled()
    click('返回学习总览'); click('章节学习')
    expect(screen.getByRole('group', { name: '象棋棋盘' })).toBe(board)
    expect(screen.getByText('练习 · 原局面自己走')).toBeTruthy()
  })

  it('blocked real training stores can be replaced without deleting first while course stays protected', async () => {
    localStorage.setItem('xiangqi-progress', 'protected-progress')
    localStorage.setItem(OPENING_TRAINING_KEY, 'protected-opening')
    localStorage.setItem(TACTICS_KEY, 'protected-tactics')
    render(<App />); openBackup(); await choose()
    expect((screen.getByRole('button', { name: '恢复课堂与单步练习' }) as HTMLButtonElement).disabled).toBe(true)
    const remove = vi.spyOn(Storage.prototype, 'removeItem')
    for (const key of ['opening', 'tactics'] as const) {
      const label = BACKUP_MODULE_LABELS[key]
      click(`恢复${label}`)
      expect(screen.getByRole('dialog').textContent).toContain('将以备份替换本模块受保护存档')
      click(`确认恢复${label}`)
      expect(JSON.parse(localStorage.getItem(key === 'opening' ? OPENING_TRAINING_KEY : TACTICS_KEY)!)).toEqual(fixture().modules[key])
    }
    expect(localStorage.getItem('xiangqi-progress')).toBe('protected-progress')
    expect(remove).not.toHaveBeenCalled()
  })
  it('opens the independent panel and returns to overview without writing storage', () => {
    render(<App />)
    const before = snapshot(), write = vi.spyOn(Storage.prototype, 'setItem')
    openBackup()
    expect(screen.getByRole('region', { name: '学习进度备份与恢复' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '学习进度备份与恢复' }))
    click('返回学习总览')
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '学习总览' }))
    expect(snapshot()).toEqual(before); expect(write).not.toHaveBeenCalled()
  })

  it('preserves the current challenge, hint, board and seen variants during preview, cancel and training restores', async () => {
    render(<App />); click('新手课堂'); click('开始原局面练习')
    fireEvent.click(screen.getByLabelText('红兵，坐标 0,6'))
    fireEvent.click(screen.getByLabelText(/交叉点 0,5.*可走落点/))
    click('进入未见变式'); click('提示 1 · 观察')
    const board = screen.getByRole('group', { name: '象棋棋盘' })
    const before = snapshot()
    click('学习总览'); click('备份与恢复'); await choose()
    click('恢复开局跟练'); click('取消恢复')
    expect(snapshot()).toEqual(before)
    click('恢复开局跟练'); click('确认恢复开局跟练')
    click('恢复多步战术'); click('确认恢复多步战术')
    click('取消预览'); click('返回学习总览'); click('章节学习')
    expect(screen.getByRole('group', { name: '象棋棋盘' })).toBe(board)
    expect(screen.getByRole('button', { name: '提示 2 · 规则与思路' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '黑卒，坐标 2,3' })).toBeTruthy()
    click('学习总览'); click(`学习本章：${curriculum[1].title}`)
    click('学习总览'); click(`学习本章：${curriculum[0].title}`)
    click('开始原局面练习')
    fireEvent.click(screen.getByLabelText('红兵，坐标 0,6'))
    fireEvent.click(screen.getByLabelText(/交叉点 0,5.*可走落点/)); click('进入未见变式')
    expect(screen.getByRole('button', { name: '红兵，坐标 6,6' })).toBeTruthy()
  })

  it('persists each module exactly once, resets only restored course, and retains other module results', async () => {
    const progress = defaultProgress()
    const moved = play(createSession(), { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    if (!moved.ok) throw Error('fixture move failed')
    progress.session = { ...moved.session, notes: { '1': '保留棋谱笔记' } }
    const archive = archiveSession(progress.session, '保留收藏')
    if (!archive.ok) throw Error(archive.error)
    const collection = addCollection(defaultCollection(), archive.value, { id: 'preserved-collection', savedAt: 1792620000000 })
    if (!collection.ok) throw Error(collection.error)
    progress.collection = collection.value
    progress.learningMatch = { active: true, standardStart: true, coachEnabled: false, coachEverUsed: true, checkpointSeen: true }
    saveProgress(localStorage, progress)
    savePreferences(localStorage, { ...defaultPreferences(), boardTheme: 'clear', showCoordinates: true })
    const study = createStudy(progress.session, { kind: 'match', title: '保留试走', orientation: 'black' })
    if (!study.ok) throw Error(study.error)
    saveStudy(localStorage, study.value)
    const preferencesRaw = localStorage.getItem('xiangqi-preferences'), studyRaw = localStorage.getItem('xiangqi-study')
    render(<App />); click('新手课堂'); click('开始原局面练习')
    const oldBoard = screen.getByRole('group', { name: '象棋棋盘' })
    click('学习总览'); click('备份与恢复'); await choose()
    const before = loadProgress(localStorage), write = vi.spyOn(Storage.prototype, 'setItem')
    click('恢复开局跟练'); click('确认恢复开局跟练')
    click('恢复多步战术'); click('确认恢复多步战术')
    click('恢复课堂与单步练习'); click('确认恢复课堂与单步练习')
    await waitFor(() => expect(screen.getByRole('region', { name: '学习总览' })).toBeTruthy())
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '学习总览' }))
    expect(screen.getByRole('status', { name: '课堂恢复结果' }).textContent).toContain('已恢复课堂与单步练习')
    expect(write.mock.calls.map(([key]) => key).sort()).toEqual(['xiangqi-progress', OPENING_TRAINING_KEY, TACTICS_KEY].sort())
    const after = loadProgress(localStorage)
    expect(after.session).toEqual(before.session); expect(after.collection).toEqual(before.collection)
    expect(after.learningMatch).toEqual(before.learningMatch)
    expect(after.milestones).toEqual({ firstMatch: false, independentMatch: false })
    expect(localStorage.getItem('xiangqi-preferences')).toBe(preferencesRaw)
    expect(localStorage.getItem('xiangqi-study')).toBe(studyRaw)
    expect(JSON.parse(localStorage.getItem(OPENING_TRAINING_KEY)!)).toEqual(fixture().modules.opening)
    expect(JSON.parse(localStorage.getItem(TACTICS_KEY)!)).toEqual(fixture().modules.tactics)
    click('备份与恢复')
    expect((screen.getByRole('button', { name: '恢复开局跟练' }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(screen.getByRole('region', { name: '备份预览' })).getByText('已恢复开局跟练')).toBeTruthy()
    click('返回学习总览'); click('章节学习')
    expect(screen.getByRole('group', { name: '象棋棋盘' })).not.toBe(oldBoard)
    expect(screen.getByText('演示 · 先看一遍')).toBeTruthy()
  })
})
