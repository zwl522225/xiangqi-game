import { describe, expect, it } from 'vitest'
import { endgames, endgameRouteNotice, endgameTopics } from '../src/content/endgames'
import { curriculum } from '../src/content/curriculum'
import { lessons } from '../src/content/lessons'
import { puzzles } from '../src/content/puzzles'
import { tactics } from '../src/content/tactics'
import { formatMove } from '../src/core/notation'
import { pseudoMoves } from '../src/core/moves'
import { createGame, evaluateOutcome, generalsFacing, isInCheck, legalMoves, moveBoard, tryMove } from '../src/core/rules'
import type { Board, Move, Side } from '../src/core/types'

const m = (fx: number, fy: number, tx: number, ty: number): Move => ({ from: { x: fx, y: fy }, to: { x: tx, y: ty } })
const get = (id: string) => endgames.find(lesson => lesson.id === id)!
function replay(id: string, ply: number) {
  const lesson = get(id)
  let game = createGame(lesson.board, lesson.side)
  for (const move of lesson.line.slice(0, ply)) {
    const result = tryMove(game, move)
    if (!result.ok) throw Error(result.error)
    game = result.game
  }
  return game
}
const variants = (board: Board) => [false, true].flatMap(flipX => [false, true].map(flipSides => JSON.stringify(
  board.map((row, y) => row.map((_, x) => {
    const piece = board[flipSides ? 9 - y : y][flipX ? 8 - x : x]
    return piece ? { type: piece.type, side: flipSides ? piece.side === 'red' ? 'black' : 'red' : piece.side } : null
  })),
)))

describe('original endgame teaching content', () => {
  it('defines one distinct nonempty task per own turn without exposing exact move coordinates', () => {
    for (const lesson of endgames) {
      expect(lesson.tasks).toHaveLength(lesson.line.filter((_, ply) => ply % 2 === 0).length)
      expect(new Set(lesson.tasks).size).toBe(lesson.tasks.length)
      for (const task of lesson.tasks) {
        expect(typeof task).toBe('string')
        expect(task.trim().length).toBeGreaterThan(0)
        expect(task).not.toMatch(/\(\s*\d+\s*,\s*\d+\s*\)/)
      }
    }
  })
  it('publishes three topics, two distinct colors per topic, and explicitly limits the route claim', () => {
    expect(endgames.map(lesson => lesson.id)).toEqual(['rook-soldier-a', 'rook-soldier-b', 'cannon-a', 'cannon-b', 'rook-horse-a', 'rook-horse-b'])
    expect(endgameTopics.map(topic => topic.id)).toEqual(['rook-soldier', 'cannon', 'rook-horse'])
    expect(endgameRouteNotice).toContain('指定教学路线')
    expect(endgameRouteNotice).toContain('其他合法走法可能也能达成目标')
    for (const topic of endgameTopics) {
      expect(endgames.filter(lesson => lesson.topic === topic.id).map(lesson => lesson.side)).toEqual(['red', 'black'])
    }
  })

  it('starts with normal material, legal palace/river placements, and neither side checked or terminal', () => {
    const limits = { general: 1, advisor: 2, elephant: 2, horse: 2, rook: 2, cannon: 2, soldier: 5 }
    for (const lesson of endgames) {
      expect(lesson.version).toBe(1)
      expect(lesson.board).toHaveLength(10)
      expect(lesson.board.every(row => row.length === 9)).toBe(true)
      for (const side of ['red', 'black'] as Side[]) {
        const counts = { general: 0, advisor: 0, elephant: 0, horse: 0, rook: 0, cannon: 0, soldier: 0 }
        lesson.board.forEach((row, y) => row.forEach((piece, x) => {
          if (piece?.side !== side) return
          counts[piece.type]++
          const homeY = side === 'red' ? 9 - y : y
          if (piece.type === 'general') expect(x >= 3 && x <= 5 && homeY >= 0 && homeY <= 2).toBe(true)
          if (piece.type === 'advisor') expect(['3,0', '5,0', '4,1', '3,2', '5,2']).toContain(`${x},${homeY}`)
          if (piece.type === 'elephant') expect(['2,0', '6,0', '0,2', '4,2', '8,2', '2,4', '6,4']).toContain(`${x},${homeY}`)
          if (piece.type === 'soldier') {
            expect(homeY).toBeGreaterThanOrEqual(3)
            if (homeY <= 4) expect(x % 2).toBe(0)
          }
        }))
        expect(counts.general).toBe(1)
        for (const type of Object.keys(limits) as (keyof typeof limits)[]) expect(counts[type]).toBeLessThanOrEqual(limits[type])
        expect(isInCheck(lesson.board, side)).toBe(false)
        expect(evaluateOutcome(lesson.board, side, 0)).toBeNull()
      }
      expect(generalsFacing(lesson.board)).toBe(false)
    }
  })

  it('replays every route with real history and before-board notation, ending in learner checkmate only', () => {
    const notes = [
      ['兵四进一', '将6平5', '车九平五'], ['卒4进1', '帅六平五', '卒4平5'],
      ['车九平四', '将6平5', '炮九平五'], ['车1平4', '帅六平五', '炮9平5'],
      ['马九进七', '将4平5', '车九平五'], ['马5进7', '帅四平五', '车2平5'],
    ]
    endgames.forEach((lesson, index) => {
      expect([3, 5]).toContain(lesson.line.length)
      expect(lesson.explanations).toHaveLength(lesson.line.length)
      expect(lesson.hints).toHaveLength((lesson.line.length + 1) / 2)
      for (const hints of lesson.hints) expect(hints).toHaveLength(3)
      let game = createGame(lesson.board, lesson.side)
      const notation: string[] = []
      lesson.line.forEach((move, ply) => {
        expect(game.result).toBeNull()
        expect(game.turn === lesson.side).toBe(ply % 2 === 0)
        notation.push(formatMove(game.board, move))
        const result = tryMove(game, move)
        expect(result.ok, `${lesson.id}:${ply}`).toBe(true)
        if (!result.ok) throw Error(result.error)
        game = result.game
        expect(game.positionKeys).toHaveLength(ply + 2)
        if (ply < lesson.line.length - 1) expect(game.result).toBeNull()
      })
      expect(notation).toEqual(notes[index])
      expect(game.result).toEqual({ winner: lesson.side, reason: 'checkmate' })
      expect(isInCheck(game.board, game.turn)).toBe(true)
      expect(legalMoves(game.board, game.turn)).toEqual([])
      expect(game.board.flat().filter(piece => piece?.type === 'general')).toHaveLength(2)
    })
  })

  it('has three alternative legal defense branches from genuine opponent turns, with bounded honest endpoints', () => {
    expect(endgames.filter(lesson => lesson.defense)).toHaveLength(3)
    for (const lesson of endgames.filter(lesson => lesson.side === 'red')) {
      const branch = lesson.defense!
      expect(branch).toBeTruthy()
      expect(branch.fromPly).toBeGreaterThan(0)
      expect(branch.fromPly % 2).toBe(1)
      expect(branch.moves.length).toBeGreaterThanOrEqual(1)
      expect(branch.moves.length).toBeLessThanOrEqual(3)
      expect(branch.explanations).toHaveLength(branch.moves.length)
      expect(branch.moves[0]).not.toEqual(lesson.line[branch.fromPly])
      let game = replay(lesson.id, branch.fromPly)
      expect(game.turn).not.toBe(lesson.side)
      for (const move of branch.moves) {
        expect(game.result).toBeNull()
        const result = tryMove(game, move)
        expect(result.ok).toBe(true)
        if (!result.ok) throw Error(result.error)
        game = result.game
      }
      if (!game.result) expect(branch.explanations.at(-1)).toContain('该分支尚未结束')
      expect(branch.explanations.join('')).not.toMatch(/必胜|唯一|最佳|最短杀/)
    }
  })

  it('uses original boards across existing single puzzles, courses and tactics, including mirror/color variants', () => {
    const oldBoards = [...puzzles.map(item => item.board), ...tactics.map(item => item.board),
      ...lessons.flatMap(item => [item.board, ...(item.bonus ? [item.bonus.board] : [])]),
      ...curriculum.flatMap(chapter => chapter.units.flatMap(unit => [unit.demo.board, unit.practice.board,
        ...unit.variants.map(item => item.board), ...(unit.relatedExamples ?? []).map(item => item.board)]))]
    const used = new Set(oldBoards.flatMap(variants))
    for (const lesson of endgames) {
      const forms = variants(lesson.board)
      expect(forms.some(board => used.has(board)), lesson.id).toBe(false)
      forms.forEach(board => used.add(board))
    }
  })

  it('grounds soldier controls, cannon screens, horse legs, and rook lines in the actual final boards', () => {
    const soldier = replay('rook-soldier-a', 3)
    expect(pseudoMoves(soldier.board, { x: 5, y: 1 })).toContainEqual({ x: 5, y: 0 })
    // A friendly rook is not a pseudo destination; simulate its capture to test the resulting attack.
    const capturedRook = soldier.board.map(row => row.map(piece => piece ? { ...piece } : null))
    capturedRook[0][4] = null; capturedRook[1][4] = { side: 'black', type: 'general' }
    expect(isInCheck(capturedRook, 'black')).toBe(true)
    const cannon = replay('cannon-a', 3)
    expect(cannon.board.slice(1, 4).filter(row => row[4])).toHaveLength(1)
    expect(cannon.board[2][4]).toEqual({ side: 'red', type: 'soldier' })
    expect(isInCheck(cannon.board, 'black')).toBe(true)
    const noScreen = cannon.board.map(row => row.map(piece => piece ? { ...piece } : null))
    noScreen[2][4] = null
    expect(pseudoMoves(noScreen, { x: 4, y: 4 })).not.toContainEqual({ x: 4, y: 0 })
    const horse = replay('rook-horse-a', 3)
    expect(horse.board[1][2]).toBeNull()
    expect(horse.board[2][3]).toBeNull()
    expect(pseudoMoves(horse.board, { x: 2, y: 2 })).toContainEqual({ x: 3, y: 0 })
    const blocked = horse.board.map(row => row.map(piece => piece ? { ...piece } : null))
    blocked[1][2] = { side: 'black', type: 'rook' }
    expect(pseudoMoves(blocked, { x: 2, y: 2 })).not.toContainEqual({ x: 3, y: 0 })
    // The rook can geometrically capture the horse, but doing so leaves the checking red rook in place.
    expect(pseudoMoves(horse.board, { x: 2, y: 0 })).toContainEqual({ x: 2, y: 2 })
    expect(isInCheck(moveBoard(horse.board, m(2, 0, 2, 2)), 'black')).toBe(true)
    expect(legalMoves(horse.board, 'black')).toEqual([])
  })

  it('teaches B with a soldier delivering mate and exposing the general line, rather than a transformed A finish', () => {
    const final = replay('rook-soldier-b', 3)
    expect(final.board[8][4]).toEqual({ side: 'black', type: 'soldier' })
    expect(final.board[8][5]).toEqual({ side: 'black', type: 'rook' })
    expect(final.board[8][3]).toBeNull()
    expect(pseudoMoves(final.board, { x: 4, y: 8 })).toContainEqual({ x: 4, y: 9 })
    expect(generalsFacing(moveBoard(final.board, m(4, 9, 3, 9)))).toBe(true)
    expect(isInCheck(moveBoard(final.board, m(4, 9, 4, 8)), 'red')).toBe(true)
  })
})
