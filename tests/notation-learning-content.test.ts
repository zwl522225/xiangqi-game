import { describe, expect, it } from 'vitest'
import { curriculum } from '../src/content/curriculum'
import type { MoveTask } from '../src/content/curriculum'
import { notationUnits } from '../src/content/notation-lessons'
import { practiceExercises } from '../src/content/practice'
import { tactics } from '../src/content/tactics'
import { endgames } from '../src/content/endgames'
import { lessons } from '../src/content/lessons'
import { puzzles } from '../src/content/puzzles'
import { gradeMoveTask } from '../src/core/lesson-goals'
import { formatMove } from '../src/core/notation'
import { createGame, evaluateOutcome, generalsFacing, isInCheck, legalMoves, tryMove } from '../src/core/rules'
import type { Board, Move, PieceType, Side } from '../src/core/types'

// Independently written BEFORE content: target, coordinates, final-word semantics,
// actual captured/check flags. Never generated from formatMove or task.solutions.
const evidence: [string, string, Side, [number, number, number, number], 'distance' | 'file', boolean, boolean][] = [
  ['notation-files-demo', '车一进三', 'red', [8,8,8,5], 'distance', false, false],
  ['notation-files-variant-1', '炮7平3', 'black', [6,2,2,2], 'file', false, false],
  ['notation-files-variant-2', '炮八退二', 'red', [1,6,1,8], 'distance', false, false],
  ['notation-files-variant-3', '车1进2', 'black', [0,4,0,6], 'distance', true, false],
  ['notation-straight-demo', '车七进三', 'red', [2,7,2,4], 'distance', false, false],
  ['notation-straight-variant-1', '炮8退3', 'black', [7,4,7,1], 'distance', false, false],
  ['notation-straight-variant-2', '帅五平四', 'red', [4,9,5,9], 'file', false, false],
  ['notation-straight-variant-3', '卒3平4', 'black', [2,5,3,5], 'file', false, false],
  ['notation-target-file-demo', '马七进五', 'red', [2,6,4,5], 'file', true, false],
  ['notation-target-file-variant-1', '象3进5', 'black', [2,0,4,2], 'file', false, false],
  ['notation-target-file-variant-2', '仕四退五', 'red', [5,7,4,8], 'file', false, false],
  ['notation-target-file-variant-3', '马7退6', 'black', [6,3,5,1], 'file', false, false],
  ['notation-front-back-demo', '前车平六', 'red', [0,3,3,3], 'file', false, true],
  ['notation-front-back-variant-1', '前马退6', 'black', [7,6,5,5], 'file', false, false],
  ['notation-front-back-variant-2', '后炮平一', 'red', [6,8,8,8], 'file', false, false],
  ['notation-front-back-variant-3', '后车退1', 'black', [8,1,8,0], 'distance', false, false],
]
const move = ([fx, fy, tx, ty]: number[]): Move => ({ from: { x: fx, y: fy }, to: { x: tx, y: ty } })
const independent = () => notationUnits.flatMap(unit => [unit.demo, ...unit.variants]) as MoveTask[]
const key = (board: Board) => JSON.stringify(board)
const transforms = (board: Board) => [board, board.map(row => [...row].reverse()), [...board].reverse(), [...board].reverse().map(row => [...row].reverse())]
  .flatMap(item => [item, item.map(row => row.map(piece => piece && ({ ...piece, side: piece.side === 'red' ? 'black' : 'red' }))) ]).map(item => JSON.stringify(item))

describe('original notation curriculum', () => {
  it('appends exactly four units after the unchanged original unit in chapter seven', () => {
    expect(curriculum.flatMap(chapter => chapter.units)).toHaveLength(21)
    expect(curriculum.find(chapter => chapter.id === 'notation')!.units.map(unit => unit.id)).toEqual(['read-notation', 'notation-files', 'notation-straight', 'notation-target-file', 'notation-front-back'])
    expect(notationUnits.map(unit => unit.id)).toEqual(['notation-files', 'notation-straight', 'notation-target-file', 'notation-front-back'])
    expect(notationUnits.flatMap(unit => [unit.demo, unit.practice, ...unit.variants])).toHaveLength(20)
    for (const unit of notationUnits) {
      expect(unit.variants).toHaveLength(3)
      expect(unit.practice).toEqual({ ...unit.demo, id: `${unit.id}-practice` })
      expect([unit.demo, ...unit.variants].filter(task => task.turn === 'red')).toHaveLength(2)
      expect([unit.demo, ...unit.variants].filter(task => task.turn === 'black')).toHaveLength(2)
    }
  })

  it.each(evidence)('%s has one independently specified legal interpretation for %s', (id, target, side, coordinates, semantics, captured, check) => {
    const task = independent().find(task => task.id === id)!
    const answer = move(coordinates)
    const before = key(task.board)
    expect(task.kind).toBe('move')
    expect(task.turn).toBe(side)
    expect(task.goal).toEqual({ kind: 'notation', value: target })
    expect(task.solutions).toEqual([answer])
    expect(task.prompt).toContain(target)
    expect(task.prompt).toContain(side === 'red' ? '红方' : '黑方')
    expect(task.hints).toHaveLength(3)
    expect(task.hints[2]).toContain(`(${answer.from.x},${answer.from.y})`)
    expect(task.hints[2]).toContain(`(${answer.to.x},${answer.to.y})`)
    expect(task.successExplanation).toContain(semantics === 'distance' ? '距离' : '目标路')
    const finalWord = target.at(-1)!
    const finalNumber = side === 'red' ? [...'一二三四五六七八九'].indexOf(finalWord) + 1 : Number(finalWord)
    expect(finalNumber).toBe(semantics === 'distance' ? Math.abs(answer.to.y - answer.from.y) : side === 'red' ? 9 - answer.to.x : answer.to.x + 1)
    const direction = target.at(-2)
    expect(direction).toBe(answer.to.y === answer.from.y ? '平' : (side === 'red' ? answer.to.y < answer.from.y : answer.to.y > answer.from.y) ? '进' : '退')
    expect(formatMove(task.board, answer)).toBe(target)
    const game = createGame(task.board, side)
    const legal = legalMoves(task.board, side)
    expect(legal.filter(candidate => formatMove(task.board, candidate) === target)).toEqual([answer])
    expect(legal.filter(candidate => gradeMoveTask(task, game, candidate).status === 'success')).toEqual([answer])
    const replay = tryMove(game, answer)
    expect(replay.ok).toBe(true)
    if (replay.ok) {
      expect(replay.captured).toBe(captured)
      expect(replay.check).toBe(check)
      expect(replay.game.board[answer.to.y][answer.to.x]).toEqual(task.board[answer.from.y][answer.from.x])
    }
    const offGoal = legal.find(candidate => JSON.stringify(candidate) !== JSON.stringify(answer))!
    expect(offGoal).toBeDefined()
    expect(gradeMoveTask(task, game, offGoal).status).toBe('not-goal')
    expect(gradeMoveTask(task, game, { from: answer.from, to: answer.from }).status).toBe('illegal')
    expect(key(task.board)).toBe(before)
    expect(key(game.board)).toBe(before)
  })

  it('sets up all sixteen boards with legal piece counts and placement, safe generals and a nonterminal position', () => {
    expect(new Set(independent().map(task => key(task.board))).size).toBe(16)
    const limits: Record<PieceType, number> = { general: 1, advisor: 2, elephant: 2, horse: 2, rook: 2, cannon: 2, soldier: 5 }
    const elephantSquares = new Set(['2,9','6,9','0,7','4,7','8,7','2,5','6,5'])
    for (const task of independent()) {
      expect(task.board).toHaveLength(10)
      expect(generalsFacing(task.board), task.id).toBe(false)
      for (const side of ['red', 'black'] as const) {
        expect(isInCheck(task.board, side), task.id).toBe(false)
        expect(evaluateOutcome(task.board, side, 0), task.id).toBeNull()
        for (const [type, maximum] of Object.entries(limits)) {
          const count = task.board.flat().filter(piece => piece?.side === side && piece.type === type).length
          expect(count, `${task.id}:${side}:${type}`).toBeLessThanOrEqual(maximum)
          if (type === 'general') expect(count).toBe(1)
        }
      }
      task.board.forEach((row, y) => {
        expect(row).toHaveLength(9)
        row.forEach((piece, x) => {
          if (!piece) return
          const localY = piece.side === 'red' ? y : 9 - y
          if (piece.type === 'general' || piece.type === 'advisor') {
            expect(x >= 3 && x <= 5 && localY >= 7 && localY <= 9, task.id).toBe(true)
            if (piece.type === 'advisor') expect((x + localY) % 2, task.id).toBe(0)
          }
          if (piece.type === 'elephant') expect(elephantSquares.has(`${x},${localY}`), task.id).toBe(true)
          if (piece.type === 'soldier') {
            expect(localY, task.id).toBeLessThanOrEqual(6)
            if (localY >= 5) expect(x % 2, task.id).toBe(0)
          }
        })
      })
    }
  })

  it('does not reuse any old course, single-step, tactics or endgame board, or merely mirror/recolor new boards', () => {
    const oldBoards = curriculum.flatMap(chapter => chapter.units).filter(unit => !unit.id.startsWith('notation-')).flatMap(unit => [...[unit.demo, ...unit.variants].map(task => task.board), ...(unit.relatedExamples?.map(example => example.board) ?? [])])
    const previous = [...oldBoards, ...practiceExercises.map(exercise => exercise.task.board), ...tactics.map(tactic => tactic.board), ...endgames.map(lesson => lesson.board), ...lessons.map(lesson => lesson.board), ...puzzles.map(puzzle => puzzle.board)]
    const tasks = independent()
    tasks.forEach((task, index) => {
      expect(previous.some(board => transforms(board).includes(key(task.board))), task.id).toBe(false)
      for (const other of tasks.slice(index + 1)) expect(transforms(other.board), `${task.id}/${other.id}`).not.toContain(key(task.board))
    })
  })

  it('checks real horse legs, elephant eyes and river limits, and advisor palace limits', () => {
    const byId = (id: string) => independent().find(task => task.id === id)!
    for (const [id, invalid, error] of [
      ['notation-target-file-demo', [2,6,3,4], '马腿被挡住'],
      ['notation-target-file-variant-1', [2,0,0,2], '象眼被堵住'],
      ['notation-target-file-variant-2', [5,7,6,6], '这枚棋子不能走到这里，请查看走法提示'],
      ['notation-target-file-variant-3', [6,3,5,5], '马腿被挡住'],
    ] as const) {
      const task = byId(id)
      expect(tryMove(createGame(task.board, task.turn), move([...invalid]))).toEqual({ ok: false, error })
    }
    const elephant = byId('notation-target-file-variant-1')
    const board = structuredClone(elephant.board)
    board[0][2] = null
    board[4][2] = { side: 'black', type: 'elephant' }
    expect(tryMove(createGame(board, 'black'), move([2,4,4,6])).ok).toBe(false)
  })

  it('describes red and black horse legs by true coordinates that survive a view flip', () => {
    for (const [id, open, blocked, side] of [
      ['notation-target-file-demo', [3,6], [2,5], 'red'],
      ['notation-target-file-variant-3', [6,2], [6,4], 'black'],
    ] as const) {
      const task = independent().find(task => task.id === id)!
      expect(task.board[open[1]][open[0]], id).toBeNull()
      expect(task.board[blocked[1]][blocked[0]], id).toEqual({ side, type: 'soldier' })
      for (const text of [task.hints[1], task.successExplanation]) {
        expect(text, id).toContain(`(${open[0]},${open[1]})`)
        expect(text, id).toContain(`(${blocked[0]},${blocked[1]})`)
      }
    }
  })

  it('explains vertical movement toward real baselines and qualifies any screen directions', () => {
    for (const task of independent()) {
      const answer = task.solutions[0]
      if (answer.from.y !== answer.to.y) {
        const baseline = answer.to.y < answer.from.y ? '黑方底线' : '红方底线'
        expect(task.successExplanation, task.id).toContain(baseline)
      }
      // These texts are shown unchanged under either board orientation. Screen
      // directions are only factual when their own clause names the default view.
      for (const text of [...task.hints, task.successExplanation]) for (const clause of text.split(/[；。]/)) {
        if (/(?:朝|向)[上下]|[上下左右]方|[左右]侧|较[上下]面/.test(clause)) expect(clause, task.id).toContain('默认')
      }
    }
  })

  it('uses exactly two same-file same-kind pieces and both sides’ forward direction for front/back', () => {
    const unit = notationUnits.find(unit => unit.id === 'notation-front-back')!
    for (const task of [unit.demo, ...unit.variants] as MoveTask[]) {
      const answer = task.solutions[0]
      const mover = task.board[answer.from.y][answer.from.x]!
      const rows = task.board.flatMap((row, y) => row[answer.from.x]?.side === task.turn && row[answer.from.x]?.type === mover.type ? [y] : [])
      expect(rows).toHaveLength(2)
      const front = task.turn === 'red' ? Math.min(...rows) : Math.max(...rows)
      expect(task.goal.kind === 'notation' && task.goal.value.startsWith(answer.from.y === front ? '前' : '后')).toBe(true)
    }
  })
})
