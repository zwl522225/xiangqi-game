import { describe, expect, it } from 'vitest'
import { createGame, evaluateOutcome, isInCheck, legalMoves, tryMove } from '../src/core/rules'
import { opposite } from '../src/core/types'
import { curriculum } from '../src/content/curriculum'
import type { ChoiceTask, MoveTask } from '../src/content/curriculum'
import { gradeChoiceTask, gradeMoveTask } from '../src/core/lesson-goals'

const boardKey = (board: MoveTask['board']) => board.map(row => row.map(piece => piece ? `${piece.side[0]}${piece.type}` : '.').join(',')).join('/')
const mirrorKey = (board: MoveTask['board']) => board.map(row => [...row].reverse().map(piece => piece ? `${piece.side[0]}${piece.type}` : '.').join(',')).join('/')
const allTasks = () => curriculum.flatMap(chapter => chapter.units.flatMap(unit => [unit.demo, unit.practice, ...unit.variants]))

describe('beginner curriculum', () => {
  it('keeps the eight original chapter titles and stable, unique content IDs', () => {
    expect(curriculum.map(chapter => chapter.title)).toEqual([
      '01 · 棋盘与先后手', '02 · 车马炮', '03 · 九宫与河界', '04 · 吃子与保护',
      '05 · 将军与应将', '06 · 将死与困毙', '07 · 看懂棋谱', '08 · 开局第一步',
    ])
    const ids = [...curriculum.map(chapter => chapter.id), ...curriculum.flatMap(chapter => chapter.units.map(unit => unit.id)), ...allTasks().map(task => task.id), ...curriculum.flatMap(chapter => chapter.units.flatMap(unit => unit.relatedExamples?.map(example => example.id) ?? []))]
    expect(new Set(ids).size).toBe(ids.length)
    for (const chapter of curriculum) {
      expect(chapter.units.length).toBeGreaterThanOrEqual(1)
      if (chapter.id === 'notation') expect(chapter.units).toHaveLength(5)
      else expect(chapter.units.length).toBeLessThanOrEqual(3)
      for (const unit of chapter.units) {
        expect(unit.variants.length).toBeGreaterThanOrEqual(2)
        expect(unit.demo.kind).toBe(unit.practice.kind)
        expect(unit.demo.board).toEqual(unit.practice.board)
        expect(unit.demo.turn).toBe(unit.practice.turn)
        expect(unit.title.length).toBeGreaterThan(1)
      }
    }
  })

  it('has materially different challenge layouts and no shown demo layout among them', () => {
    for (const chapter of curriculum) for (const unit of chapter.units) {
      const demo = boardKey(unit.demo.board)
      const variants = unit.variants.map(task => boardKey(task.board))
      expect(new Set(variants).size, unit.id).toBe(variants.length)
      for (const variant of unit.variants) {
        expect(boardKey(variant.board), variant.id).not.toBe(demo)
        expect(boardKey(variant.board), variant.id).not.toBe(mirrorKey(unit.demo.board))
      }
      for (let i = 0; i < unit.variants.length; i++) for (let j = i + 1; j < unit.variants.length; j++) {
        expect(boardKey(unit.variants[i].board), unit.id).not.toBe(mirrorKey(unit.variants[j].board))
      }
    }
  })

  it('never reuses any demonstration board before or after its shown move as a challenge', () => {
    const shown = new Set<string>()
    for (const chapter of curriculum) for (const unit of chapter.units) {
      shown.add(boardKey(unit.demo.board))
      if (unit.demo.kind === 'move') {
        const result = tryMove(createGame(unit.demo.board, unit.demo.turn), unit.demo.solutions[0])
        expect(result.ok, unit.id).toBe(true)
        if (result.ok) shown.add(boardKey(result.game.board))
      }
      for (const example of unit.relatedExamples ?? []) {
        shown.add(boardKey(example.board))
        const result = tryMove(createGame(example.board, example.turn), example.move)
        expect(result.ok, example.id).toBe(true)
        if (result.ok) shown.add(boardKey(result.game.board))
      }
    }
    for (const chapter of curriculum) for (const unit of chapter.units) for (const variant of unit.variants) {
      expect(shown.has(boardKey(variant.board)), variant.id).toBe(false)
    }
  })

  it('leaves destination coordinates for the learner to find in unseen move challenges', () => {
    for (const chapter of curriculum) for (const unit of chapter.units) for (const variant of unit.variants) {
      if (variant.kind !== 'move') continue
      for (const solution of variant.solutions) {
        expect(variant.prompt, variant.id).not.toContain(`(${solution.to.x},${solution.to.y})`)
      }
    }
  })

  it('gives each move example a legal, goal-achieving answer', () => {
    for (const task of allTasks()) {
      expect(task.prompt.length, task.id).toBeGreaterThan(4)
      expect(task.hints).toHaveLength(3)
      expect(task.successExplanation.length, task.id).toBeGreaterThan(4)
      if (task.kind !== 'move') continue
      expect(task.solutions.length, task.id).toBeGreaterThan(0)
      for (const move of task.solutions) {
        const game = createGame(task.board, task.turn)
        if (task.noCapturePlies !== undefined) game.noCapturePlies = task.noCapturePlies
        expect(tryMove(game, move).ok, task.id).toBe(true)
        const grade = gradeMoveTask(task, game, move)
        expect(grade.status, task.id).toBe('success')
        if (grade.status === 'success') expect(grade.game).not.toBe(game)
      }
    }
  })

  it('has independent rook, blocked horse leg, cannon screen, palace, soldier and draw units', () => {
    const ids = curriculum.flatMap(chapter => chapter.units.map(unit => unit.id))
    for (const id of ['rook', 'horse-leg', 'cannon-capture', 'palace', 'soldier', 'draws']) {
      expect(ids, id).toContain(id)
    }
    const horse = curriculum.flatMap(chapter => chapter.units).find(unit => unit.id === 'horse-leg')!
    expect(horse.practice.kind).toBe('move')
    if (horse.practice.kind === 'move') {
      const invalid = horse.practice.blockedAttempt!
      expect(tryMove(createGame(horse.practice.board, horse.practice.turn), invalid)).toEqual({ ok: false, error: '马腿被挡住' })
    }
    const cannon = curriculum.flatMap(chapter => chapter.units).find(unit => unit.id === 'cannon-capture')!
    expect(cannon.practice.kind).toBe('move')
    if (cannon.practice.kind === 'move') expect(cannon.practice.goal).toMatchObject({ kind: 'capture', by: 'cannon' })
    const flat = cannon.relatedExamples?.find(example => example.title.includes('炮二平五'))!
    expect(tryMove(createGame(flat.board, flat.turn), flat.move).ok).toBe(true)
  })

  it('checks actual results for multiple legal check responses, mate and stalemate', () => {
    const units = curriculum.flatMap(chapter => chapter.units)
    const respond = units.find(unit => unit.id === 'resolve-check')!
    expect(respond.practice.kind).toBe('move')
    if (respond.practice.kind === 'move') {
      const game = createGame(respond.practice.board, respond.practice.turn)
      expect(isInCheck(game.board, game.turn)).toBe(true)
      expect(respond.practice.solutions.length).toBeGreaterThanOrEqual(2)
      for (const move of respond.practice.solutions) {
        const grade = gradeMoveTask(respond.practice, game, move)
        expect(grade.status).toBe('success')
        if (grade.status === 'success') expect(isInCheck(grade.game.board, game.turn)).toBe(false)
      }
    }
    for (const [id, reason] of [['checkmate', 'checkmate'], ['stalemate', 'stalemate']] as const) {
      const task = units.find(unit => unit.id === id)!.practice as MoveTask
      for (const move of task.solutions) {
        const grade = gradeMoveTask(task, createGame(task.board, task.turn), move)
        expect(grade.status, id).toBe('success')
        if (grade.status === 'success') expect(grade.game.result?.reason).toBe(reason)
      }
    }
  })

  it('starts each terminal move challenge before the opponent is terminal, and rejects an irrelevant king move', () => {
    for (const unitId of ['checkmate', 'stalemate']) {
      const unit = curriculum.flatMap(chapter => chapter.units).find(item => item.id === unitId)!
      for (const task of [unit.demo, ...unit.variants] as MoveTask[]) {
        expect(isInCheck(task.board, opposite(task.turn)), task.id).toBe(false)
        expect(evaluateOutcome(task.board, opposite(task.turn), 0), task.id).toBeNull()
        const game = createGame(task.board, task.turn)
        const kingMove = legalMoves(game.board, game.turn).find(move => game.board[move.from.y][move.from.x]?.type === 'general')
        expect(kingMove, task.id).toBeDefined()
        expect(gradeMoveTask(task, game, kingMove!).status, task.id).toBe('not-goal')
      }
    }
  })

  it('enforces the named elephant and the requested horizontal check', () => {
    const units = curriculum.flatMap(chapter => chapter.units)
    const elephant = units.find(unit => unit.id === 'elephant-river')!.practice as MoveTask
    const otherElephant = { from: { x: 2, y: 9 }, to: { x: 4, y: 7 } }
    expect(tryMove(createGame(elephant.board, elephant.turn), otherElephant).ok).toBe(true)
    expect(gradeMoveTask(elephant, createGame(elephant.board, elephant.turn), otherElephant).status).toBe('not-goal')
    const checkingRook = units.find(unit => unit.id === 'give-check')!.practice as MoveTask
    const verticalCheck = { from: { x: 4, y: 5 }, to: { x: 4, y: 0 } }
    expect(tryMove(createGame(checkingRook.board, checkingRook.turn), verticalCheck).ok).toBe(true)
    expect(gradeMoveTask(checkingRook, createGame(checkingRook.board, checkingRook.turn), verticalCheck).status).toBe('not-goal')
  })

  it('introduces capturing before requiring a check response', () => {
    const capture = curriculum.flatMap(chapter => chapter.units).find(unit => unit.id === 'capture-target')!
    for (const task of [capture.demo, ...capture.variants]) {
      expect(isInCheck(task.board, task.turn), task.id).toBe(false)
    }
  })

  it('rejects terminal moves by a different piece than the prompt names', () => {
    const stalemate = curriculum.flatMap(chapter => chapter.units).find(unit => unit.id === 'stalemate')!
    const demo = stalemate.practice as MoveTask
    const otherRook = { from: { x: 5, y: 1 }, to: { x: 3, y: 1 } }
    const demoGame = createGame(demo.board, demo.turn)
    expect(tryMove(demoGame, otherRook).ok).toBe(true)
    expect(gradeMoveTask(demo, demoGame, otherRook).status).toBe('not-goal')
    const horseVariant = stalemate.variants[0] as MoveTask
    const rookInstead = { from: { x: 3, y: 1 }, to: { x: 5, y: 1 } }
    const variantGame = createGame(horseVariant.board, horseVariant.turn)
    expect(tryMove(variantGame, rookInstead).ok).toBe(true)
    expect(gradeMoveTask(horseVariant, variantGame, rookInstead).status).toBe('not-goal')
  })

  it('does not give an inaccurate fixed explanation for another valid horse check or a soldier capture', () => {
    const units = curriculum.flatMap(chapter => chapter.units)
    const horseCheck = units.find(unit => unit.id === 'give-check')!.variants[0] as MoveTask
    const otherHorseCheck = { from: { x: 0, y: 3 }, to: { x: 1, y: 1 } }
    const horseGame = createGame(horseCheck.board, horseCheck.turn)
    expect(tryMove(horseGame, otherHorseCheck).ok).toBe(true)
    const checked = gradeMoveTask(horseCheck, horseGame, otherHorseCheck)
    expect(checked.status).toBe('success')
    expect(checked.message).not.toContain('(2,2)')
    const cannonMate = units.find(unit => unit.id === 'checkmate')!.variants[1] as MoveTask
    const captureScreen = { from: { x: 4, y: 2 }, to: { x: 4, y: 1 } }
    const mateGame = createGame(cannonMate.board, cannonMate.turn)
    const capture = tryMove(mateGame, captureScreen)
    expect(capture.ok && capture.game.result?.reason).toBe('checkmate')
    expect(gradeMoveTask(cannonMate, mateGame, captureScreen).status).toBe('not-goal')
  })

  it('asks learners to recognize both opening purposes in unseen choice variants', () => {
    const units = curriculum.flatMap(chapter => chapter.units)
    const purpose = units.find(unit => unit.id === 'opening-purpose')!
    expect(new Set(purpose.variants.map(task => (task as ChoiceTask).correctOptionId))).toEqual(new Set(['develop-horse', 'control-centre']))
    const earlierOpening = units.find(unit => unit.id === 'opening-move')!
    const earlierResultBoards = (earlierOpening.variants as MoveTask[]).flatMap(task =>
      legalMoves(task.board, task.turn).map(move => gradeMoveTask(task, createGame(task.board, task.turn), move))
        .filter(result => result.status === 'success')
        .map(result => result.status === 'success' ? boardKey(result.game.board) : ''),
    )
    for (const variant of purpose.variants as ChoiceTask[]) {
      expect(earlierResultBoards, variant.id).not.toContain(boardKey(variant.board))
      expect(gradeChoiceTask(variant, variant.correctOptionId).status).toBe('success')
      const wrong = variant.options.find(option => option.id !== variant.correctOptionId)!
      expect(gradeChoiceTask(variant, wrong.id).status).toBe('not-goal')
    }
  })

  it('rejects illegal and legal non-goal moves without changing the source game', () => {
    const task = curriculum.flatMap(chapter => chapter.units).find(unit => unit.id === 'rook')!.practice as MoveTask
    const game = createGame(task.board, task.turn)
    const before = JSON.stringify(game)
    const illegal = gradeMoveTask(task, game, { from: { x: 8, y: 8 }, to: { x: 8, y: 7 } })
    expect(illegal.status).toBe('illegal')
    expect(illegal.message.length).toBeGreaterThan(0)
    const wrong = legalMoves(game.board, game.turn).find(move => {
      const attempt = tryMove(game, move)
      return attempt.ok && !(move.to.x === task.solutions[0].to.x && move.to.y === task.solutions[0].to.y)
    })!
    const notGoal = gradeMoveTask(task, game, wrong)
    expect(notGoal.status).toBe('not-goal')
    expect(notGoal.message.length).toBeGreaterThan(0)
    expect(JSON.stringify(game)).toBe(before)
    expect('game' in illegal).toBe(false)
    expect('game' in notGoal).toBe(false)
    const capture = curriculum.flatMap(chapter => chapter.units).find(unit => unit.id === 'capture-target')!.practice as MoveTask
    const withExtraRook = createGame(capture.board, capture.turn)
    withExtraRook.board[4][4] = { side: 'black', type: 'rook' }
    const wrongCapture = gradeMoveTask(capture, withExtraRook, { from: { x: 4, y: 5 }, to: { x: 4, y: 4 } })
    expect(wrongCapture.status).toBe('not-goal')
  })

  it('distinguishes stalemate, accepted agreement and natural-limit draw choices', () => {
    const draw = curriculum.flatMap(chapter => chapter.units).find(unit => unit.id === 'draws')!
    const tasks = [draw.demo, draw.practice, ...draw.variants] as ChoiceTask[]
    expect(tasks.every(task => task.kind === 'choice')).toBe(true)
    expect(new Set(tasks.map(task => task.situation)).size).toBeGreaterThanOrEqual(3)
    for (const task of tasks) {
      expect(task.options.length).toBeGreaterThanOrEqual(3)
      expect(task.options.some(option => option.id === task.correctOptionId)).toBe(true)
      if (task.situation === 'stalemate') expect(evaluateOutcome(task.board, task.turn, 0)?.reason).toBe('stalemate')
      if (task.situation === 'natural-limit') expect(evaluateOutcome(task.board, task.turn, task.noCapturePlies ?? 0)?.reason).toBe('natural-limit')
      if (task.situation === 'agreement') {
        expect(legalMoves(task.board, 'red').length).toBeGreaterThan(0)
        expect(legalMoves(task.board, 'black').length).toBeGreaterThan(0)
      }
      expect(gradeChoiceTask(task, task.correctOptionId).status).toBe('success')
      const wrong = task.options.find(option => option.id !== task.correctOptionId)!
      expect(gradeChoiceTask(task, wrong.id).status).toBe('not-goal')
    }
  })
})
