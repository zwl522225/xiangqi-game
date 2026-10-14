// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialBoard } from '../src/core/board'
import { Board } from '../src/ui/Board'

afterEach(() => cleanup())

describe('board perspective', () => {
  it('keeps the default red perspective for teaching boards', () => {
    render(<Board board={createInitialBoard()} />)
    const rook = screen.getByRole('button', { name: '黑车，坐标 0,0' })
    expect(rook.style.left).toBe('5%')
    expect(rook.style.top).toBe(`${40 / 9}%`)
    expect(screen.getByRole('button', { name: '红帅，坐标 4,9' }).tabIndex).toBe(0)
  })

  it('places the black rook at bottom right but clicks its real coordinate', async () => {
    const user = userEvent.setup()
    const onCell = vi.fn()
    render(<Board board={createInitialBoard()} orientation="black" onCell={onCell} />)
    const rook = screen.getByRole('button', { name: '黑车，坐标 0,0' })
    expect(rook.style.left).toBe('95%')
    expect(rook.style.top).toBe(`${850 / 9}%`)
    expect(rook.textContent).toBe('车')
    expect(screen.getByRole('button', { name: '黑将，坐标 4,0' }).tabIndex).toBe(0)
    await user.click(rook)
    expect(onCell).toHaveBeenLastCalledWith({ x: 0, y: 0 })
  })

  it('moves black perspective focus in screen directions and activates real cells', async () => {
    const user = userEvent.setup()
    const onCell = vi.fn()
    const onCancel = vi.fn()
    render(<Board board={createInitialBoard()} orientation="black" onCell={onCell} onCancel={onCancel} />)
    await user.click(screen.getByRole('button', { name: '黑车，坐标 0,0' }))
    await user.keyboard('{ArrowUp}')
    const empty = screen.getByRole('button', { name: '交叉点 0,1' })
    expect(document.activeElement).toBe(empty)
    expect(empty.tabIndex).toBe(0)
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(empty)
    await user.keyboard('{ArrowLeft}{ArrowDown}{Enter}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '黑马，坐标 1,0' }))
    expect(onCell).toHaveBeenLastCalledWith({ x: 1, y: 0 })
    await user.keyboard('{ArrowDown} ')
    expect(onCell).toHaveBeenLastCalledWith({ x: 1, y: 0 })
    expect(screen.getAllByRole('button').filter(button => button.tabIndex === 0)).toHaveLength(1)
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('maps selected, legal, recent and check markers without changing their real coordinates on flip', () => {
    const props = {
      board: createInitialBoard(), selected: { x: 0, y: 0 }, legalTargets: [{ x: 0, y: 1 }],
      lastMove: { from: { x: 4, y: 1 }, to: { x: 4, y: 0 } }, checkedSide: 'black' as const,
    }
    const { rerender } = render(<Board {...props} />)
    const rook = screen.getByRole('button', { name: '黑车，坐标 0,0，已选中' })
    act(() => rook.focus())
    rerender(<Board {...props} orientation="black" />)
    expect(document.activeElement).toBe(rook)
    expect(rook.tabIndex).toBe(0)
    expect(rook.style.left).toBe('95%')
    expect(rook.getAttribute('aria-pressed')).toBe('true')
    const target = screen.getByRole('button', { name: '交叉点 0,1，可走落点' })
    expect(target.classList.contains('is-legal')).toBe(true)
    expect(target.style.top).toBe(`${760 / 9}%`)
    const general = screen.getByRole('button', { name: '黑将，坐标 4,0，上一步，正在被将军' })
    expect(general.classList.contains('is-recent')).toBe(true)
    expect(general.classList.contains('is-check')).toBe(true)
    expect(general.style.top).toBe(`${850 / 9}%`)
    expect(general.querySelector('.check-marker')?.textContent).toBe('将')
  })
})
