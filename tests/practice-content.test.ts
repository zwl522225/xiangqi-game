import { describe, expect, it } from 'vitest'
import { curriculum } from '../src/content/curriculum'
import { practiceExercises, practiceTopics } from '../src/content/practice'
import { gradeChoiceTask, gradeMoveTask } from '../src/core/lesson-goals'
import { createGame, evaluateOutcome, isInCheck, legalMoves, tryMove } from '../src/core/rules'
import { opposite } from '../src/core/types'
import type { Board } from '../src/core/types'

const key = (board: Board) => JSON.stringify(board)
const mirror = (board: Board) => key(board.map(row => [...row].reverse()))
const moveTasks = () => practiceExercises.flatMap(exercise => exercise.task.kind === 'move' ? [exercise.task] : [])

describe('independent themed practice content', () => {
  it('provides five stable topics and four original versioned tasks per topic', () => {
    expect(practiceTopics.map(topic => [topic.id, topic.title])).toEqual([
      ['moves', '基础走法'], ['capture', '吃子与保护'], ['check', '将军与应将'],
      ['endgame', '终局判断'], ['notation', '记谱与开局'],
    ])
    expect(practiceExercises).toHaveLength(20)
    expect(new Set(practiceExercises.map(exercise => exercise.id)).size).toBe(20)
    const units = curriculum.flatMap(chapter => chapter.units.map(unit => unit.id))
    for (const topic of practiceTopics) {
      expect(topic.description.length).toBeGreaterThan(4)
      expect(practiceExercises.filter(exercise => exercise.topicId === topic.id)).toHaveLength(4)
    }
    for (const exercise of practiceExercises) {
      expect(exercise.version).toBe(1)
      expect(exercise.task.id).toBe(exercise.id)
      expect(units).toContain(exercise.unitId)
      for (const text of [exercise.title, exercise.task.prompt, ...exercise.task.hints,
        exercise.task.successExplanation, exercise.task.notGoalExplanation]) expect(text).toMatch(/[\u4e00-\u9fff]/)
      expect(exercise.task.hints).toHaveLength(3)
    }
  })

  it('never copies or horizontally mirrors a curriculum board or its shown result', () => {
    const used = new Set<string>()
    for (const chapter of curriculum) for (const unit of chapter.units) {
      for (const task of [unit.demo, unit.practice, ...unit.variants]) {
        used.add(key(task.board)); used.add(mirror(task.board))
        if (task.kind === 'move') for (const solution of task.solutions) {
          const moved = tryMove(createGame(task.board, task.turn), solution)
          if (moved.ok) { used.add(key(moved.game.board)); used.add(mirror(moved.game.board)) }
        }
      }
      for (const example of unit.relatedExamples ?? []) {
        used.add(key(example.board)); used.add(mirror(example.board))
        const moved = tryMove(createGame(example.board, example.turn), example.move)
        if (moved.ok) { used.add(key(moved.game.board)); used.add(mirror(moved.game.board)) }
      }
    }
    for (const { id, task } of practiceExercises) {
      expect(used.has(key(task.board)), id).toBe(false)
      used.add(key(task.board)); used.add(mirror(task.board))
    }
  })

  it('replays every supplied answer with the actual rules and rejects illegal moves without mutation', () => {
    for (const task of moveTasks()) {
      const game = createGame(task.board, task.turn)
      if (task.noCapturePlies !== undefined) game.noCapturePlies = task.noCapturePlies
      const before = JSON.stringify(game)
      expect(task.solutions.length, task.id).toBeGreaterThan(0)
      for (const solution of task.solutions) {
        expect(tryMove(game, solution).ok, task.id).toBe(true)
        expect(gradeMoveTask(task, game, solution).status, task.id).toBe('success')
      }
      expect(gradeMoveTask(task, game, { from: { x: -1, y: 0 }, to: { x: 0, y: 0 } }).status).toBe('illegal')
      expect(JSON.stringify(game), task.id).toBe(before)
      if (task.blockedAttempt) expect(gradeMoveTask(task, game, task.blockedAttempt).status, task.id).toBe('illegal')
    }
  })

  it('rejects legal moves that miss the named task goal', () => {
    for (const task of moveTasks().filter(task => task.goal.kind !== 'resolve-check')) {
      const game = createGame(task.board, task.turn)
      const wrong = legalMoves(task.board, task.turn).find(move => gradeMoveTask(task, game, move).status === 'not-goal')
      expect(wrong, task.id).toBeDefined()
      const before = JSON.stringify(game)
      expect(gradeMoveTask(task, game, wrong!).status, task.id).toBe('not-goal')
      expect(JSON.stringify(game), task.id).toBe(before)
    }
  })

  it('accepts every real check response and more than one horse development, without a solution whitelist', () => {
    for (const task of moveTasks().filter(task => task.goal.kind === 'resolve-check' || task.goal.kind === 'piece-move')) {
      const game = createGame(task.board, task.turn)
      const accepted = legalMoves(task.board, task.turn).filter(move => gradeMoveTask(task, game, move).status === 'success')
      expect(accepted.length, task.id).toBeGreaterThanOrEqual(2)
      expect(accepted.length, task.id).toBeGreaterThan(task.solutions.length)
      if (task.goal.kind === 'resolve-check') {
        expect(isInCheck(task.board, task.turn), task.id).toBe(true)
        for (const move of accepted) {
          const moved = tryMove(game, move)
          expect(moved.ok && !isInCheck(moved.game.board, task.turn), task.id).toBe(true)
        }
      }
    }
  })

  it('proves captures, checks and newly created mate or stalemate from board state', () => {
    for (const task of moveTasks()) {
      const goal = task.goal
      if (goal.kind === 'checkmate' || goal.kind === 'stalemate') {
        expect(isInCheck(task.board, opposite(task.turn)), task.id).toBe(false)
        expect(evaluateOutcome(task.board, opposite(task.turn), 0), task.id).toBeNull()
      }
      for (const solution of task.solutions) {
        const moved = tryMove(createGame(task.board, task.turn), solution)
        expect(moved.ok, task.id).toBe(true)
        if (!moved.ok) continue
        if (goal.kind === 'capture') expect(moved.captured, task.id).toBe(true)
        if (goal.kind === 'give-check') expect(moved.check, task.id).toBe(true)
        if (goal.kind === 'checkmate' || goal.kind === 'stalemate') {
          expect(moved.game.result, task.id).toEqual({ winner: task.turn, reason: goal.kind })
          expect(legalMoves(moved.game.board, moved.game.turn), task.id).toHaveLength(0)
        }
      }
    }
  })

  it('demonstrates real blocked legs and eyes, and a real cannon interposition', () => {
    for (const [id, error] of [
      ['practice-moves-horse-leg', '马腿被挡住'], ['practice-moves-elephant-eye', '象眼被堵住'],
    ]) {
      const task = moveTasks().find(task => task.id === id)!
      expect(tryMove(createGame(task.board, task.turn), task.blockedAttempt!)).toEqual({ ok: false, error })
    }
    const task = moveTasks().find(task => task.id === 'practice-capture-protect-general')!
    expect(isInCheck(task.board, task.turn)).toBe(true)
    const moved = tryMove(createGame(task.board, task.turn), task.solutions[0])
    expect(moved.ok && !isInCheck(moved.game.board, task.turn)).toBe(true)
  })

  it('builds the new opening from a replayable legal line that really blocks the usual horse destination', () => {
    let game = createGame()
    for (const [fx, fy, tx, ty] of [[1, 7, 2, 7], [7, 2, 6, 2], [0, 6, 0, 5], [8, 3, 8, 4]]) {
      const moved = tryMove(game, { from: { x: fx, y: fy }, to: { x: tx, y: ty } })
      expect(moved.ok).toBe(true)
      if (moved.ok) game = moved.game
    }
    const task = moveTasks().find(task => task.id === 'practice-notation-develop-horse')!
    expect(game.board).toEqual(task.board)
    expect(game.turn).toBe(task.turn)
    expect(game.board[7][2]).toEqual({ side: 'red', type: 'cannon' })
    expect(tryMove(game, task.blockedAttempt!).ok).toBe(false)
  })

  it('proves choice outcomes rather than trusting the unevaluated createGame result', () => {
    const choices = practiceExercises.flatMap(exercise => exercise.task.kind === 'choice' ? [exercise.task] : [])
    expect(choices).toHaveLength(2)
    for (const task of choices) {
      expect(createGame(task.board, task.turn).result).toBeNull()
      const outcome = evaluateOutcome(task.board, task.turn, task.noCapturePlies ?? 0)
      expect(outcome?.reason, task.id).toBe(task.situation)
      if (task.situation === 'stalemate') {
        expect(isInCheck(task.board, task.turn)).toBe(false)
        expect(outcome?.winner).toBe(opposite(task.turn))
      } else {
        expect(task.prompt).toContain('120')
        expect(task.prompt).toContain('计数')
        expect(legalMoves(task.board, task.turn).length).toBeGreaterThan(0)
        expect(outcome?.winner).toBeNull()
        expect(evaluateOutcome(task.board, task.turn, 119)).toBeNull()
      }
      expect(gradeChoiceTask(task, task.correctOptionId).status).toBe('success')
      for (const option of task.options.filter(option => option.id !== task.correctOptionId)) {
        expect(gradeChoiceTask(task, option.id).status).toBe('not-goal')
      }
      expect(gradeChoiceTask(task, 'missing-option').status).toBe('illegal')
    }
  })
})
