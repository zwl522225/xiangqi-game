import { formatMove } from './notation'
import { isInCheck, tryMove } from './rules'
import type { Game, MoveResult } from './rules'
import type { Move, PieceType, Position } from './types'
import type { ChoiceTask, MoveGoal, MoveTask } from '../content/curriculum'

export type Grade =
  | { status: 'illegal'; message: string }
  | { status: 'not-goal'; message: string }
  | { status: 'success'; game: Game; message: string }

function matchesNamedMove(goal: { piece?: PieceType; from?: Position; direction?: 'horizontal' | 'vertical' }, game: Game, move: Move): boolean {
  const mover = game.board[move.from.y]?.[move.from.x]
  return (!goal.piece || mover?.type === goal.piece) &&
    (!goal.from || (goal.from.x === move.from.x && goal.from.y === move.from.y)) &&
    (!goal.direction || (goal.direction === 'horizontal' ? move.from.y === move.to.y : move.from.x === move.to.x))
}

function meetsGoal(goal: MoveGoal, game: Game, move: Move, result: Extract<MoveResult, { ok: true }>): boolean {
  const mover = game.board[move.from.y]?.[move.from.x]
  switch (goal.kind) {
    case 'destination':
      return move.to.x === goal.to.x && move.to.y === goal.to.y && (!goal.piece || mover?.type === goal.piece) &&
        (!goal.from || (move.from.x === goal.from.x && move.from.y === goal.from.y))
    case 'piece-move':
      return mover?.type === goal.piece
    case 'capture': {
      const captured = game.board[move.to.y]?.[move.to.x]
      return result.captured && mover?.type === goal.by && captured?.type === goal.target &&
        move.to.x === goal.at.x && move.to.y === goal.at.y
    }
    case 'resolve-check':
      return matchesNamedMove(goal, game, move) && isInCheck(game.board, game.turn) && !isInCheck(result.game.board, game.turn)
    case 'give-check':
      return matchesNamedMove(goal, game, move) && result.check
    case 'checkmate':
      return matchesNamedMove(goal, game, move) && result.game.result?.reason === 'checkmate' && result.game.result.winner === game.turn
    case 'stalemate':
      return matchesNamedMove(goal, game, move) && result.game.result?.reason === 'stalemate' && result.game.result.winner === game.turn
    case 'notation':
      return formatMove(game.board, move) === goal.value
    case 'one-of':
      return goal.goals.some(part => meetsGoal(part, game, move, result))
  }
}

export function gradeMoveTask(task: MoveTask, game: Game, move: Move): Grade {
  const result = tryMove(game, move)
  if (!result.ok) return { status: 'illegal', message: result.error }
  if (!meetsGoal(task.goal, game, move, result)) return { status: 'not-goal', message: task.notGoalExplanation }
  return { status: 'success', game: result.game, message: `${formatMove(game.board, move)}：${task.successExplanation}` }
}

export function gradeChoiceTask(task: ChoiceTask, optionId: string): Omit<Grade, 'game'> {
  if (!task.options.some(option => option.id === optionId)) return { status: 'illegal', message: '请选择任务卡中的一个选项。' }
  if (optionId !== task.correctOptionId) return { status: 'not-goal', message: task.notGoalExplanation }
  return { status: 'success', message: task.successExplanation }
}
