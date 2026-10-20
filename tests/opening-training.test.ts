import { describe, expect, it } from 'vitest'
import { openings } from '../src/content/openings'
import { createGame, tryMove } from '../src/core/rules'

const prefixes = [
  [[7, 7, 4, 7], [7, 0, 6, 2], [7, 9, 6, 7], [1, 0, 2, 2]],
  [[1, 7, 4, 7], [1, 0, 2, 2], [1, 9, 2, 7], [7, 0, 6, 2]],
  [[6, 9, 4, 7], [7, 0, 6, 2], [7, 9, 6, 7], [6, 3, 6, 4]],
  [[6, 6, 6, 5], [1, 2, 4, 2], [7, 9, 6, 7], [7, 0, 6, 2]],
]

describe('opening training content', () => {
  it.each(openings.map((opening, index) => ({ opening, index })))('keeps the $opening.id prefix and provides eight legal plies', ({ opening, index }) => {
    expect(opening.steps).toHaveLength(8)
    expect(opening.steps.slice(0, 4).map(({ move }) => [move.from.x, move.from.y, move.to.x, move.to.y])).toEqual(prefixes[index])
    let game = createGame()
    for (const step of opening.steps) {
      const result = tryMove(game, step.move)
      expect(result.ok, `${opening.id}: ${JSON.stringify(step.move)}`).toBe(true)
      if (!result.ok) throw new Error(result.error)
      game = result.game
      expect(game.result).toBeNull()
    }
    expect(game.turn).toBe('red')
  })
})

it('versions original content and supplies intent, piece and target hints for every ply', () => {
  expect(openings.map(opening => opening.id)).toEqual(['central-cannon', 'screen-horses', 'flying-elephant', 'immortal-points'])
  for (const opening of openings) {
    expect(opening.version).toBe(1)
    for (const step of opening.steps) {
      expect(step.note.length).toBeGreaterThan(5)
      expect(step.intent.length).toBeGreaterThan(5)
      expect(step.hints).toHaveLength(3)
      expect(step.hints[0]).toBe(step.intent)
      for (const hint of step.hints) expect(hint.length).toBeGreaterThan(5)
    }
  }
})

// The transitions use the actual rules and replay, without browser or session state.
import {
  defaultOpeningTraining, openingTrainingView, transitionOpeningTraining,
  type OpeningAction, type OpeningRound, type OpeningTrainingData,
} from '../src/core/opening-training'
import { formatMove } from '../src/core/notation'
import type { Side } from '../src/core/types'

function start(openingId = openings[0].id, side: Side = 'red') {
  return transitionOpeningTraining(defaultOpeningTraining(), { type: 'start', openingId, side }).data
}
function nextAction(data: OpeningTrainingData): OpeningAction {
  const view = openingTrainingView(data.active)!
  return view.learnerTurn
    ? { type: 'move', move: view.opening.steps[data.active!.ply].move }
    : { type: 'reply' }
}
function finish(initial: OpeningTrainingData) {
  let data = initial
  while (!openingTrainingView(data.active)!.complete) data = transitionOpeningTraining(data, nextAction(data)).data
  return data
}

describe('opening training replay and transitions', () => {
  it('creates eight independent empty groups and no active round', () => {
    const data = defaultOpeningTraining()
    expect(data).toEqual({ version: 1, groups: openings.flatMap(opening => ['red', 'black'].map(side => ({
      openingId: opening.id, openingVersion: opening.version, side, completed: false, unassisted: false,
    }))), active: null })
    expect(defaultOpeningTraining()).not.toBe(data)
    expect(defaultOpeningTraining().groups).not.toBe(data.groups)
    expect(openingTrainingView(null)).toBeNull()
  })

  it.each(openings.flatMap(opening => (['red', 'black'] as const).map(side => ({ opening, side }))))(
    'replays and completes $opening.id as $side using four learner moves', ({ opening, side }) => {
      let data = start(opening.id, side)
      let game = createGame()
      const notation: string[] = []
      let learnerMoves = 0
      for (let ply = 0; ply < 8; ply++) {
        const view = openingTrainingView(data.active)!
        expect(view.game).toEqual(game)
        expect(view.complete).toBe(false)
        expect(view.learnerTurn).toBe(game.turn === side)
        expect(view.notation).toEqual(notation)
        expect(view.lastNote).toBe(ply ? opening.steps[ply - 1].note : null)
        if (view.learnerTurn) learnerMoves++
        const input = data
        const previous = structuredClone(data)
        const action = nextAction(data)
        data = transitionOpeningTraining(data, action).data
        expect(input).toEqual(previous)
        expect(previous.active!.ply).toBe(ply)
        expect(data.active!.ply).toBe(ply + 1)
        notation.push(formatMove(game.board, opening.steps[ply].move))
        const moved = tryMove(game, opening.steps[ply].move)
        if (!moved.ok) throw new Error(moved.error)
        game = moved.game
        if (ply === 6) expect(data.groups.find(g => g.openingId === opening.id && g.side === side)?.completed).toBe(false)
      }
      expect(learnerMoves).toBe(4)
      expect(openingTrainingView(data.active)).toMatchObject({ complete: true, learnerTurn: false, game, notation, lastNote: opening.steps[7].note })
      expect(data.groups.filter(group => group.completed)).toEqual([{
        openingId: opening.id, openingVersion: opening.version, side, completed: true, unassisted: true,
      }])
    },
  )

  it('distinguishes illegal rules feedback from a legal deviation without advancing', () => {
    const data = start()
    const illegal = transitionOpeningTraining(data, { type: 'move', move: { from: { x: 7, y: 9 }, to: { x: 7, y: 8 } } })
    expect(illegal.message).toContain('不能走到这里')
    expect(illegal.data.active).toMatchObject({ ply: 0, errors: 1 })
    const deviation = transitionOpeningTraining(illegal.data, { type: 'move', move: { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } } })
    expect(deviation.message).toBe('这是合法走法，但不在本次练习路线中；可在自由对弈中尝试')
    expect(deviation.data.active).toMatchObject({ ply: 0, errors: 2 })
    expect(openingTrainingView(deviation.data.active)!.game).toEqual(createGame())
    const retry = transitionOpeningTraining(deviation.data, nextAction(deviation.data)).data
    expect(retry.active).toMatchObject({ ply: 1, errors: 2 })
    expect(finish(retry).groups[0]).toMatchObject({ completed: true, unassisted: false })
    expect(data.active!.errors).toBe(0)
  })

  it('includes the actual rule reason for an out of board move and caps errors at 999', () => {
    const data = start()
    data.active!.errors = 998
    const action: OpeningAction = { type: 'move', move: { from: { x: -1, y: 9 }, to: { x: 0, y: 8 } } }
    const first = transitionOpeningTraining(data, action)
    const second = transitionOpeningTraining(first.data, action)
    expect(first.message).toContain('落点不在棋盘上')
    expect(second.data.active).toMatchObject({ errors: 999, ply: 0 })
    expect(finish(second.data).groups[0].unassisted).toBe(false)
  })

  it('waits for the first red reply when learning black and prevents double reply', () => {
    const data = start(openings[0].id, 'black')
    expect(openingTrainingView(data.active)!.learnerTurn).toBe(false)
    const once = transitionOpeningTraining(data, { type: 'reply' }).data
    const twice = transitionOpeningTraining(once, { type: 'reply' }).data
    expect(once.active!.ply).toBe(1)
    expect(twice).toEqual(once)
    const red = start()
    expect(transitionOpeningTraining(red, { type: 'reply' }).data).toEqual(red)
  })

  it('locks learner move, hint and demonstration during opponent turns', () => {
    const black = start(openings[0].id, 'black')
    const actions: OpeningAction[] = [{ type: 'hint' }, { type: 'demonstrate' }, { type: 'move', move: openings[0].steps[0].move }]
    for (const action of actions) expect(transitionOpeningTraining(black, action).data).toEqual(black)
    const redAfterMove = transitionOpeningTraining(start(), { type: 'move', move: openings[0].steps[0].move }).data
    for (const action of actions) expect(transitionOpeningTraining(redAfterMove, action).data).toEqual(redAfterMove)
  })

  it('reveals three hints in order, preserves assistance and resets only the current hint level on advance', () => {
    let data = start()
    for (let level = 1; level <= 3; level++) {
      const result = transitionOpeningTraining(data, { type: 'hint' })
      expect(result.data.active).toMatchObject({ hinted: true, hintLevel: level, ply: 0, errors: 0 })
      expect(result.message).toBe(openings[0].steps[0].hints[level - 1])
      data = result.data
    }
    expect(transitionOpeningTraining(data, { type: 'hint' }).data).toEqual(data)
    const advanced = transitionOpeningTraining(data, nextAction(data)).data
    expect(advanced.active).toMatchObject({ hinted: true, hintLevel: 0, errors: 0, ply: 1 })
    expect(finish(advanced).groups[0]).toMatchObject({ completed: true, unassisted: false })
  })

  it('demonstrates exactly one learner move and permanently records its use', () => {
    const data = start()
    const shown = transitionOpeningTraining(data, { type: 'demonstrate' })
    expect(shown.data.active).toMatchObject({ ply: 1, demonstrated: true, hinted: false, errors: 0, hintLevel: 0 })
    expect(shown.message).toContain(openings[0].steps[0].note)
    expect(transitionOpeningTraining(shown.data, { type: 'demonstrate' }).data).toEqual(shown.data)
    expect(finish(shown.data).groups[0]).toMatchObject({ completed: true, unassisted: false })
  })

  it('clears hint level on demonstration and keeps the earlier error and hint history', () => {
    let data = start()
    data = transitionOpeningTraining(data, { type: 'move', move: { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } } }).data
    data = transitionOpeningTraining(data, { type: 'hint' }).data
    data = transitionOpeningTraining(data, { type: 'demonstrate' }).data
    expect(data.active).toMatchObject({ ply: 1, errors: 1, hinted: true, demonstrated: true, hintLevel: 0 })
  })

  it('keeps completed and unassisted flags monotonic across worse retries and other groups', () => {
    const first = finish(start())
    const again = transitionOpeningTraining(first, { type: 'start', openingId: openings[0].id, side: 'red' }).data
    expect(again.groups).toEqual(first.groups)
    expect(again.active).toMatchObject({ ply: 0, errors: 0, hinted: false, demonstrated: false, hintLevel: 0 })
    const worse = finish(transitionOpeningTraining(again, { type: 'hint' }).data)
    expect(worse.groups).toEqual(first.groups)
    const other = transitionOpeningTraining(worse, { type: 'start', openingId: openings[1].id, side: 'black' }).data
    expect(finish(other).groups.filter(group => group.unassisted)).toHaveLength(2)
  })

  it('upgrades an assisted completion after a clean retry', () => {
    const assisted = finish(transitionOpeningTraining(start(), { type: 'demonstrate' }).data)
    expect(assisted.groups[0].unassisted).toBe(false)
    const retried = transitionOpeningTraining(assisted, { type: 'start', openingId: openings[0].id, side: 'red' }).data
    expect(finish(retried).groups[0].unassisted).toBe(true)
  })

  it('makes all repeated completion actions idempotent', () => {
    const data = finish(start())
    const actions: OpeningAction[] = [{ type: 'reply' }, { type: 'hint' }, { type: 'demonstrate' }, { type: 'move', move: openings[0].steps[0].move }]
    for (const action of actions) expect(transitionOpeningTraining(data, action).data).toEqual(data)
    expect(data.groups).toHaveLength(8)
  })

  it('preserves the input and old groups when replacing an unfinished round', () => {
    const data = transitionOpeningTraining(start(), { type: 'hint' }).data
    const before = structuredClone(data)
    const next = transitionOpeningTraining(data, { type: 'start', openingId: openings[2].id, side: 'black' }).data
    expect(data).toEqual(before)
    expect(next.groups).toEqual(before.groups)
    expect(next.active).toEqual({ openingId: openings[2].id, openingVersion: 1, side: 'black', ply: 0, errors: 0, hinted: false, demonstrated: false, hintLevel: 0 })
  })

  it('safely ignores unknown routes and actions before starting', () => {
    const data = defaultOpeningTraining()
    expect(transitionOpeningTraining(data, { type: 'start', openingId: 'unknown', side: 'red' }).data).toEqual(data)
    for (const type of ['reply', 'hint', 'demonstrate'] as const) expect(transitionOpeningTraining(data, { type }).data).toEqual(data)
    expect(transitionOpeningTraining(data, { type: 'move', move: openings[0].steps[0].move }).data).toEqual(data)
  })

  it('refuses to replay an unknown, incompatible or out of range round', () => {
    const round = start().active!
    const corrupt: OpeningRound[] = [
      { ...round, openingId: 'unknown' }, { ...round, openingVersion: 2 }, { ...round, ply: -1 },
      { ...round, ply: 9 }, { ...round, ply: 0.5 },
    ]
    for (const active of corrupt) {
      expect(openingTrainingView(active)).toBeNull()
      const data = { ...defaultOpeningTraining(), active }
      expect(transitionOpeningTraining(data, { type: 'reply' }).data).toEqual(data)
    }
  })
})
