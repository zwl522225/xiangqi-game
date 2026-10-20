import { openings, type Opening } from '../content/openings'
import { createGame, tryMove, type Game } from './rules'
import { formatMove } from './notation'
import { samePosition, type Move, type Side } from './types'

export type OpeningRound = {
  openingId: string; openingVersion: number; side: Side; ply: number
  errors: number; hinted: boolean; demonstrated: boolean; hintLevel: number
}
export type OpeningGroup = {
  openingId: string; openingVersion: number; side: Side; completed: boolean; unassisted: boolean
}
export type OpeningTrainingData = { version: 1; groups: OpeningGroup[]; active: OpeningRound | null }
export type OpeningAction =
  | { type: 'start'; openingId: string; side: Side }
  | { type: 'move'; move: Move }
  | { type: 'reply' }
  | { type: 'hint' }
  | { type: 'demonstrate' }
export type OpeningTrainingView = {
  opening: Opening; game: Game; complete: boolean; learnerTurn: boolean
  notation: string[]; lastNote: string | null
}

export function defaultOpeningTraining(): OpeningTrainingData {
  return {
    version: 1,
    groups: openings.flatMap(opening => (['red', 'black'] as const).map(side => ({
      openingId: opening.id, openingVersion: opening.version, side, completed: false, unassisted: false,
    }))),
    active: null,
  }
}

// A round stores only a route prefix. Reconstruct every board and notation through the rules engine.
export function openingTrainingView(round: OpeningRound | null): OpeningTrainingView | null {
  if (!round) return null
  const opening = openings.find(item => item.id === round.openingId && item.version === round.openingVersion)
  if (!opening || (round.side !== 'red' && round.side !== 'black')
    || !Number.isInteger(round.ply) || round.ply < 0 || round.ply > opening.steps.length) return null
  let game = createGame()
  const notation: string[] = []
  for (const step of opening.steps.slice(0, round.ply)) {
    const result = tryMove(game, step.move)
    if (!result.ok || result.game.result) return null
    notation.push(formatMove(game.board, step.move))
    game = result.game
  }
  const complete = round.ply === opening.steps.length
  return {
    opening, game, complete, learnerTurn: !complete && game.turn === round.side, notation,
    lastNote: round.ply ? opening.steps[round.ply - 1].note : null,
  }
}

function advance(data: OpeningTrainingData, round: OpeningRound, view: OpeningTrainingView, demonstrated: boolean) {
  const active = { ...round, ply: round.ply + 1, hintLevel: 0, demonstrated: round.demonstrated || demonstrated }
  let groups = data.groups
  if (active.ply === view.opening.steps.length) {
    const unassisted = active.errors === 0 && !active.hinted && !active.demonstrated
    const matches = (group: OpeningGroup) => group.openingId === active.openingId
      && group.openingVersion === active.openingVersion && group.side === active.side
    const completed: OpeningGroup = {
      openingId: active.openingId, openingVersion: active.openingVersion, side: active.side,
      completed: true, unassisted,
    }
    groups = groups.some(matches)
      ? groups.map(group => matches(group) ? { ...group, completed: true, unassisted: group.unassisted || unassisted } : group)
      : [...groups, completed]
  }
  const step = view.opening.steps[round.ply]
  return { data: { ...data, groups, active }, message: `${formatMove(view.game.board, step.move)}：${step.note}` }
}

export function transitionOpeningTraining(data: OpeningTrainingData, action: OpeningAction): { data: OpeningTrainingData; message: string } {
  if (action.type === 'start') {
    const opening = openings.find(item => item.id === action.openingId)
    if (!opening || (action.side !== 'red' && action.side !== 'black')) return { data, message: '找不到可练习的开局路线' }
    const active: OpeningRound = {
      openingId: opening.id, openingVersion: opening.version, side: action.side, ply: 0,
      errors: 0, hinted: false, demonstrated: false, hintLevel: 0,
    }
    return { data: { ...data, active }, message: action.side === 'red' ? '轮到你执红走棋' : '请先查看红方应手' }
  }
  const round = data.active
  const view = openingTrainingView(round)
  if (!round || !view) return { data, message: '请先开始一组开局跟练' }
  if (view.complete) return { data, message: '本组八着已完成' }

  if (action.type === 'reply') {
    if (view.learnerTurn) return { data, message: '当前是你的回合' }
    const result = tryMove(view.game, view.opening.steps[round.ply].move)
    if (!result.ok) return { data, message: result.error }
    return advance(data, round, view, false)
  }
  if (!view.learnerTurn) return { data, message: '请查看对方的指定应手' }

  if (action.type === 'hint') {
    if (round.hintLevel >= 3) return { data, message: '本步的三层提示已全部显示' }
    const hintLevel = round.hintLevel + 1
    return {
      data: { ...data, active: { ...round, hinted: true, hintLevel } },
      message: view.opening.steps[round.ply].hints[hintLevel - 1],
    }
  }
  const step = view.opening.steps[round.ply]
  if (action.type === 'demonstrate') {
    const result = tryMove(view.game, step.move)
    if (!result.ok) return { data, message: result.error }
    return advance(data, round, view, true)
  }

  // A deviation is a route mismatch only after the real rules accept it.
  const result = tryMove(view.game, action.move)
  if (!result.ok || !samePosition(action.move.from, step.move.from) || !samePosition(action.move.to, step.move.to)) {
    return {
      data: { ...data, active: { ...round, errors: Math.min(999, round.errors + 1) } },
      message: result.ok ? '这是合法走法，但不在本次练习路线中；可在自由对弈中尝试' : result.error,
    }
  }
  return advance(data, round, view, false)
}
