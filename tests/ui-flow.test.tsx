// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../src/ui/App'
import { createGame, moveBoard, positionKey } from '../src/core/rules'
import { createSession, play } from '../src/core/session'
import { chooseFallbackMove } from '../src/ai/evaluate'
import { defaultProgress, saveProgress } from '../src/core/storage'
import { defendBoard } from '../src/content/positions'

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('visible game flow', { timeout: 15000 }, () => {
  it('plays a move, records it and undoes it', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('group', { name: '象棋棋盘' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '红兵，坐标 0,6' }))
    await user.click(screen.getByRole('button', { name: /交叉点 0,5.*可走落点/ }))
    expect(screen.getByText('黑方行棋')).toBeTruthy()
    expect(screen.getAllByText('兵九进一').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: '悔棋' }))
    expect(screen.getByText('红方行棋')).toBeTruthy()
    expect(screen.getByRole('button', { name: '红兵，坐标 0,6' })).toBeTruthy()
  })

  it('opens the first hands-on lesson and the opening library', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '新手课堂' }))
    expect(screen.getByRole('heading', { name: '01 · 棋盘与先后手' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '棋路馆' }))
    expect(screen.getByRole('heading', { name: '中炮起手' })).toBeTruthy()
  })

  it('completes an original lesson practice without changing the match', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '新手课堂' }))
    await user.click(screen.getByRole('button', { name: '开始原局面练习' }))
    await user.click(screen.getByRole('button', { name: '红兵，坐标 0,6' }))
    await user.click(screen.getByRole('button', { name: /交叉点 0,5.*可走落点/ }))
    expect(screen.getByRole('status').textContent).toContain('原局面练习完成')
    await user.click(screen.getByRole('button', { name: '开始对弈' }))
    expect(screen.getByText('红方行棋')).toBeTruthy()
  })

  it('demonstrates a lesson move without awarding completion, then lets the learner repeat it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '新手课堂' }))
    await user.click(screen.getByRole('button', { name: '演示这一步' }))
    expect(screen.getByRole('button', { name: /红兵，坐标 0,5.*上一步/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /01 · 棋盘与先后手.*已练习 0\/1.*掌握 0\/1/ })).toBeTruthy()
    expect(screen.queryByText('完成本节')).toBeNull()

    await user.click(screen.getByRole('button', { name: '开始原局面练习' }))
    expect(screen.getByRole('button', { name: '红兵，坐标 0,6' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '红兵，坐标 0,6' }))
    await user.click(screen.getByRole('button', { name: /交叉点 0,5.*可走落点/ }))
    expect(screen.getByRole('button', { name: /01 · 棋盘与先后手.*已练习 1\/1.*掌握 0\/1/ })).toBeTruthy()
  })

  it('keeps puzzle answers hidden until the learner solves them', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '残局练习' }))
    expect(screen.queryByRole('button', { name: '演示这一步' })).toBeNull()
  })

  it('plays an opening step and searches for a term', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '棋路馆' }))
    await user.click(screen.getByRole('button', { name: '下一着' }))
    expect(screen.getAllByText(/炮二平五/).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: '术语词典' }))
    await user.type(screen.getByRole('searchbox'), '马腿')
    expect(screen.getByRole('heading', { name: '蹩马腿' })).toBeTruthy()
  })

  it('keeps an ongoing match when opening practice replacement is cancelled', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App />)
    await user.click(screen.getByRole('button', { name: '红兵，坐标 0,6' }))
    await user.click(screen.getByRole('button', { name: /交叉点 0,5.*可走落点/ }))
    await user.click(screen.getByRole('button', { name: '棋路馆' }))
    await user.click(screen.getByRole('button', { name: '从此局面练习' }))
    expect(confirm).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: '开始对弈' }))
    expect(screen.getByText('黑方行棋')).toBeTruthy()
    expect(screen.getAllByText('兵九进一').length).toBeGreaterThan(0)
  })

  it('can select and move a piece using only the keyboard', async () => {
    const user = userEvent.setup()
    render(<App />)
    screen.getByRole('button', { name: '红帅，坐标 4,9' }).focus()
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}{Enter}{ArrowUp}{Enter}')
    expect(screen.getByText('黑方行棋')).toBeTruthy()
    expect(screen.getAllByText('兵五进一').length).toBeGreaterThan(0)
  })

  it('explains an illegal target and announces legal targets', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '红兵，坐标 0,6' }))
    expect(screen.getByRole('button', { name: /交叉点 0,5.*可走落点/ })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '交叉点 0,4' }))
    expect(screen.getAllByRole('status').find(element => element.classList.contains('status-line'))!.textContent).toContain('这枚棋子不能走到这里')
    expect(screen.getByText('红方行棋')).toBeTruthy()
  })

  it('shows and announces check on the threatened general', () => {
    const session = createSession()
    const game = createGame(defendBoard, 'red')
    saveProgress(window.localStorage, { ...defaultProgress(), session: { ...session, game, snapshots: [game] } })
    render(<App />)
    expect(screen.getByText(/红方被将军/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /红帅，坐标 4,9.*正在被将军/ })).toBeTruthy()
  })

  it('keeps the match board visible while consulting rules and terms', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '规则手册' }))
    expect(screen.getByRole('heading', { name: '本机双人' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '规则手册' })).toBeTruthy()
    expect(screen.getAllByRole('group', { name: '象棋棋盘' }).length).toBeGreaterThan(1)
    await user.click(screen.getByRole('button', { name: '术语词典' }))
    expect(screen.getByRole('heading', { name: '本机双人' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '术语词典' })).toBeTruthy()
  })

  it('offers an independent first AI match from chapter eight', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '新手课堂' }))
    await user.click(screen.getByRole('button', { name: /08 · 开局第一步/ }))
    await user.click(screen.getByRole('button', { name: '自己下第一盘' }))
    expect(screen.getByRole('heading', { name: '人机练习' })).toBeTruthy()
  })

  it('lets a learner inspect a glossary example board', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '术语词典' }))
    const detail = screen.getByRole('heading', { name: '交叉点' }).closest('article')!
    await user.click(within(detail).getByRole('button', { name: '红车，坐标 0,9' }))
    expect(within(detail).getByRole('status').textContent).toContain('红车')
  })

  it('opens the relevant term directly from a lesson and the match record', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '新手课堂' }))
    await user.click(screen.getByRole('button', { name: '查看相关术语' }))
    expect(screen.getByRole('heading', { name: '交叉点' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '开始对弈' }))
    await user.click(screen.getByRole('button', { name: '看懂棋谱' }))
    expect(screen.getByRole('heading', { name: '棋谱' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '本机双人' })).toBeTruthy()
  })

  it('labels the side to move in a reviewed position', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '红兵，坐标 0,6' }))
    await user.click(screen.getByRole('button', { name: /交叉点 0,5.*可走落点/ }))
    await user.click(screen.getByRole('button', { name: '黑卒，坐标 0,3' }))
    await user.click(screen.getByRole('button', { name: /交叉点 0,4.*可走落点/ }))
    await user.click(screen.getByRole('button', { name: /兵九进一/ }))
    expect(screen.getByText('回看第 1 着 · 黑方行棋')).toBeTruthy()
  })

  it('warns when the computer move repeats a position for the third time', async () => {
    const red = play(createSession('ai', 'red'), { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })
    if (!red.ok) throw new Error('expected legal move')
    const choice = chooseFallbackMove(red.session.game)!
    const repeated = positionKey(moveBoard(red.session.game.board, choice), 'red')
    const current = positionKey(red.session.game.board, 'black')
    const game = { ...red.session.game, positionKeys: [repeated, repeated, current] }
    saveProgress(window.localStorage, { ...defaultProgress(), session: { ...red.session, game, snapshots: [red.session.snapshots[0], game] } })
    render(<App />)
    await waitFor(() => expect(screen.getAllByRole('status').find(element => element.classList.contains('status-line'))!.textContent).toContain('局面再次重复'))
  })
})
