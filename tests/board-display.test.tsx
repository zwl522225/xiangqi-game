// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialBoard } from '../src/core/board'
import { defaultPreferences } from '../src/core/preferences'
import type { DisplayPreferences } from '../src/core/preferences'
import { Board } from '../src/ui/Board'
import { BoardDisplayProvider, useBoardDisplay } from '../src/ui/BoardDisplayContext'
import { BoardDisplaySettings } from '../src/ui/BoardDisplaySettings'

afterEach(() => cleanup())
const display: DisplayPreferences = { boardTheme: 'clear', showCoordinates: true, showCaptured: true }

describe('shared board display', () => {
  it('has compatible display defaults without a provider', () => {
    function Defaults() { return <output>{JSON.stringify(useBoardDisplay())}</output> }
    const { container } = render(<><Defaults /><Board board={createInitialBoard()} /></>)
    expect(screen.getByRole('status').textContent).toBe(JSON.stringify({ boardTheme: 'classic', showCoordinates: false, showCaptured: true }))
    expect(container.querySelector('.board-frame--clear')).toBeNull()
    expect(container.querySelector('[data-coordinate-axis]')).toBeNull()
    expect(container.querySelectorAll('.board-point')).toHaveLength(90)
  })

  it.each(['red', 'black'] as const)('projects all four coordinate edges with the %s board cells', orientation => {
    const onCell = vi.fn()
    const { container } = render(<BoardDisplayProvider value={display}><Board board={createInitialBoard()} orientation={orientation} onCell={onCell} /></BoardDisplayProvider>)
    expect(container.querySelector('.board-frame--clear')).not.toBeNull()
    const allLabels = container.querySelectorAll('[data-coordinate-axis]')
    expect(allLabels).toHaveLength(38)
    expect(container.querySelector('.board-coordinates')?.getAttribute('aria-hidden')).toBe('true')
    for (const edge of ['top', 'bottom']) {
      for (let x = 0; x <= 8; x++) {
        const label = container.querySelector<HTMLElement>(`[data-coordinate-edge=${edge}][data-coordinate-value="${x}"]`)!
        const displayedX = orientation === 'black' ? 8 - x : x
        expect(label.style.left).toBe(`${5 + displayedX * 11.25}%`)
        expect(label.textContent).toBe(String(x))
        const cell = screen.getByLabelText(x === 4 ? '黑将，坐标 4,0' : `${['黑车', '黑马', '黑象', '黑士', '', '黑士', '黑象', '黑马', '黑车'][x]}，坐标 ${x},0`)
        expect(label.style.left).toBe(cell.style.left)
      }
    }
    for (const edge of ['left', 'right']) {
      for (let y = 0; y <= 9; y++) {
        const label = container.querySelector<HTMLElement>(`[data-coordinate-edge=${edge}][data-coordinate-value="${y}"]`)!
        const displayedY = orientation === 'black' ? 9 - y : y
        expect(label.style.top).toBe(`${(40 + displayedY * 90) / 9}%`)
        expect(label.textContent).toBe(String(y))
      }
    }
    expect(container.querySelectorAll('.board-point')).toHaveLength(90)
    fireEvent.click(screen.getByLabelText('黑车，坐标 0,0'))
    expect(onCell).toHaveBeenLastCalledWith({ x: 0, y: 0 })
  })

  it('preserves every real cell label, node, keyboard cursor and marker while display changes', () => {
    const board = createInitialBoard()
    const props = { board, selected: { x: 0, y: 0 }, legalTargets: [{ x: 0, y: 1 }], lastMove: { from: { x: 4, y: 1 }, to: { x: 4, y: 0 } }, checkedSide: 'black' as const }
    const { container, rerender } = render(<BoardDisplayProvider value={{ ...display, boardTheme: 'classic', showCoordinates: false }}><Board {...props} /></BoardDisplayProvider>)
    const cells = [...container.querySelectorAll<HTMLButtonElement>('.board-point')]
    const labels = cells.map(cell => cell.getAttribute('aria-label'))
    const rook = screen.getByLabelText('黑车，坐标 0,0，已选中')
    act(() => rook.focus())
    fireEvent.keyDown(rook, { key: 'ArrowDown' })
    const target = screen.getByLabelText('交叉点 0,1，可走落点')
    expect(document.activeElement).toBe(target)
    rerender(<BoardDisplayProvider value={display}><Board {...props} /></BoardDisplayProvider>)
    expect(document.activeElement).toBe(target)
    expect(target.tabIndex).toBe(0)
    const nextCells = [...container.querySelectorAll<HTMLButtonElement>('.board-point')]
    expect(nextCells.map(cell => cell.getAttribute('aria-label'))).toEqual(labels)
    nextCells.forEach((cell, index) => expect(cell).toBe(cells[index]))
    expect(rook.classList.contains('is-selected')).toBe(true)
    expect(target.querySelector('.legal-ring')).not.toBeNull()
    expect(screen.getByLabelText('黑将，坐标 4,0，上一步，正在被将军').querySelector('.check-marker')).not.toBeNull()
    fireEvent.keyDown(target, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByLabelText('交叉点 1,1'))
  })

  it('supports compact teaching boards without changing their default red orientation', () => {
    const { container } = render(<BoardDisplayProvider value={display}><Board compact board={createInitialBoard()} /></BoardDisplayProvider>)
    expect(container.querySelector('.board-frame--compact.board-frame--clear.board-frame--coordinates')).not.toBeNull()
    expect(screen.getByLabelText('黑车，坐标 0,0').style.left).toBe('5%')
    expect(container.querySelector('[data-coordinate-edge=top][data-coordinate-value="0"]')?.getAttribute('style')).toContain('left: 5%')
  })
})

describe('board display settings', () => {
  function settings(status: 'pending' | 'saved' | 'failed' = 'saved', onChange = vi.fn(), onClose = vi.fn()) {
    return <BoardDisplaySettings preferences={defaultPreferences()} onChange={onChange} persistenceStatus={status} onClose={onClose} />
  }

  it('focuses the theme and immediately emits only the changed display field', () => {
    const onChange = vi.fn()
    render(settings('saved', onChange))
    expect(screen.getByRole('dialog', { name: '棋盘显示' })).toBeTruthy()
    const theme = screen.getByLabelText('棋盘主题')
    expect(document.activeElement).toBe(theme)
    expect(screen.getByRole('option', { name: '传统木纹' })).toBeTruthy()
    expect(screen.getByRole('option', { name: '清晰教学' })).toBeTruthy()
    fireEvent.change(theme, { target: { value: 'clear' } })
    expect(onChange).toHaveBeenLastCalledWith({ boardTheme: 'clear' })
    fireEvent.click(screen.getByLabelText('显示数字坐标'))
    expect(onChange).toHaveBeenLastCalledWith({ showCoordinates: true })
    fireEvent.click(screen.getByLabelText('显示本局失子'))
    expect(onChange).toHaveBeenLastCalledWith({ showCaptured: false })
    expect(onChange).toHaveBeenCalledTimes(3)
    expect(screen.getByText(/中文记谱/).textContent).toContain('一至九路')
  })

  it.each([['pending', '正在保存'], ['saved', '已保存'], ['failed', '保存失败']] as const)('announces the actual %s persistence state', (status, text) => {
    render(settings(status))
    expect(screen.getByRole('status').textContent).toContain(text)
    if (status === 'failed') {
      expect(screen.getByRole('status').textContent).toContain('页面仍保留')
      expect(screen.getByRole('status').textContent).toContain('刷新后可能丢失')
    }
  })

  it('cycles Tab in both directions and closes with Escape or the close button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(settings('saved', vi.fn(), onClose))
    const theme = screen.getByLabelText('棋盘主题')
    const close = screen.getByRole('button', { name: '关闭设置' })
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(close)
    await user.tab()
    expect(document.activeElement).toBe(theme)
    await user.tab()
    expect(document.activeElement).toBe(screen.getByLabelText('显示数字坐标'))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByLabelText('显示本局失子'))
    await user.tab()
    expect(document.activeElement).toBe(close)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
    await user.click(close)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('returns focus to the connected opener on unmount', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { unmount } = render(settings())
    expect(document.activeElement).toBe(screen.getByLabelText('棋盘主题'))
    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('can unmount after the opener is removed', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { unmount } = render(settings())
    opener.remove()
    expect(() => unmount()).not.toThrow()
  })
})
