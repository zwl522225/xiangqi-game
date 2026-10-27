import { describe, expect, it } from 'vitest'
import { createInitialBoard } from '../src/core/board'
import { formatMove, coordinateMove } from '../src/core/notation'
import type { Board } from '../src/core/types'
import { notationUnits } from '../src/content/notation-lessons'

describe('Chinese move notation', () => {
  it('names red and black opening moves from each side’s perspective', () => {
    const board = createInitialBoard()
    expect(formatMove(board, { from: { x: 7, y: 7 }, to: { x: 4, y: 7 } })).toBe('炮二平五')
    expect(formatMove(board, { from: { x: 7, y: 0 }, to: { x: 6, y: 2 } })).toBe('马8进7')
    expect(formatMove(board, { from: { x: 0, y: 9 }, to: { x: 0, y: 8 } })).toBe('车九进一')
  })

  it('uses front and back for duplicate pieces on a file', () => {
    const board: Board = Array.from({ length: 10 }, () => Array(9).fill(null))
    board[4][0] = { side: 'red', type: 'rook' }
    board[8][0] = { side: 'red', type: 'rook' }
    expect(formatMove(board, { from: { x: 0, y: 4 }, to: { x: 0, y: 3 } })).toBe('前车进一')
    expect(formatMove(board, { from: { x: 0, y: 8 }, to: { x: 0, y: 9 } })).toBe('后车退一')
  })

  it('retains coordinates for review and copying', () => {
    expect(coordinateMove({ from: { x: 7, y: 7 }, to: { x: 4, y: 7 } })).toBe('(7,7)→(4,7)')
  })

  // Human-authored notation and coordinates: no expected text is produced by
  // formatMove, task.goal or task.solutions. Include every new lesson setup.
  it.each([
    ['notation-files-demo', 8,8,8,5, '车一进三'],
    ['notation-files-variant-1', 6,2,2,2, '炮7平3'],
    ['notation-files-variant-2', 1,6,1,8, '炮八退二'],
    ['notation-files-variant-3', 0,4,0,6, '车1进2'],
    ['notation-straight-demo', 2,7,2,4, '车七进三'],
    ['notation-straight-variant-1', 7,4,7,1, '炮8退3'],
    ['notation-straight-variant-2', 4,9,5,9, '帅五平四'],
    ['notation-straight-variant-3', 2,5,3,5, '卒3平4'],
    ['notation-target-file-demo', 2,6,4,5, '马七进五'],
    ['notation-target-file-variant-1', 2,0,4,2, '象3进5'],
    ['notation-target-file-variant-2', 5,7,4,8, '仕四退五'],
    ['notation-target-file-variant-3', 6,3,5,1, '马7退6'],
    ['notation-front-back-demo', 0,3,3,3, '前车平六'],
    ['notation-front-back-variant-1', 7,6,5,5, '前马退6'],
    ['notation-front-back-variant-2', 6,8,8,8, '后炮平一'],
    ['notation-front-back-variant-3', 8,1,8,0, '后车退1'],
  ] as const)('independently records %s as %s', (id, fx, fy, tx, ty, expected) => {
    const scene = notationUnits.flatMap(unit => [unit.demo, ...unit.variants]).find(task => task.id === id)!
    expect(formatMove(scene.board, { from: { x: fx, y: fy }, to: { x: tx, y: ty } })).toBe(expected)
  })
})
