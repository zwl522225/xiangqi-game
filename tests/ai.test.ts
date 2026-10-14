import { describe, expect, it, vi } from 'vitest'
import { chooseFallbackMove, chooseMove, searchMove } from '../src/ai/evaluate'
import { createGame, isInCheck, legalMoves, moveBoard, tryMove } from '../src/core/rules'
import { mateBoard, position, stalemateBoard } from '../src/content/positions'
import * as rules from '../src/core/rules'
import type { Board } from '../src/core/types'

describe('beginner computer player', () => {
  it('chooses a legal, reproducible move from the opening', () => {
    const game = createGame()
    const first = chooseMove(game)
    expect(first).toBeTruthy()
    expect(legalMoves(game.board, game.turn)).toContainEqual(first)
    expect(chooseMove(game)).toEqual(first)
  })

  it('never leaves its general under attack', () => {
    const board: Board = Array.from({ length: 10 }, () => Array(9).fill(null))
    board[9][4] = { side: 'red', type: 'general' }
    board[0][3] = { side: 'black', type: 'general' }
    board[5][4] = { side: 'black', type: 'rook' }
    const move = chooseMove(createGame(board))
    expect(move).toBeTruthy()
    expect(isInCheck(moveBoard(board, move!), 'red')).toBe(false)
  })

  it('takes an immediate mate and returns null if no legal move exists', () => {
    const game = createGame(mateBoard)
    const move = chooseMove(game)
    expect(move).toBeTruthy()
    const result = tryMove(game, move!)
    expect(result.ok && result.game.result?.reason).toBe('checkmate')
    const stuck: Board = Array.from({ length: 10 }, () => Array(9).fill(null))
    stuck[9][4] = { side: 'red', type: 'general' }
    stuck[0][3] = { side: 'black', type: 'general' }
    stuck[8][3] = { side: 'black', type: 'rook' }
    stuck[8][5] = { side: 'black', type: 'rook' }
    expect(chooseMove(createGame(stuck))).toBe(null)
  })

  it('uses a legal deterministic move for the lightweight fallback', () => {
    const game = createGame()
    const moves = legalMoves(game.board, game.turn)
    const first = chooseFallbackMove(game, moves)
    expect(moves).toContainEqual(first)
    expect(chooseFallbackMove(game, moves)).toEqual(first)
    expect(chooseFallbackMove(game, [])).toBe(null)
  })
})

describe('real difficulty search', () => {
  const trap = () => createGame(position(
    [4, 9, 'red', 'general'], [3, 0, 'black', 'general'],
    [4, 5, 'red', 'rook'], [4, 2, 'black', 'rook'],
    [4, 3, 'black', 'horse'], [4, 6, 'red', 'soldier'],
  ))

  it.each(['easy', 'normal', 'challenge'] as const)('%s is deterministic, legal, handles check and real terminal wins', difficulty => {
    const game = createGame()
    const move = chooseMove(game, difficulty)
    expect(legalMoves(game.board, game.turn)).toContainEqual(move)
    expect(chooseMove(game, difficulty)).toEqual(move)
    const checked = createGame(position([4, 9, 'red', 'general'], [3, 0, 'black', 'general'], [4, 5, 'black', 'rook']))
    const escaped = tryMove(checked, chooseMove(checked, difficulty)!)
    expect(escaped.ok && !isInCheck(escaped.game.board, 'red')).toBe(true)
    for (const [board, reason] of [[mateBoard, 'checkmate'], [stalemateBoard, 'stalemate']] as const) {
      const winning = createGame(board)
      const result = tryMove(winning, chooseMove(winning, difficulty)!)
      expect(result.ok && result.game.result).toEqual({ winner: 'red', reason })
    }
    expect(chooseMove({ ...game, result: { winner: null, reason: 'agreement' } }, difficulty)).toBeNull()
    // With no capturable pieces, every available move really reaches the limit.
    const drawn = { ...createGame(position([4, 9, 'red', 'general'], [3, 0, 'black', 'general'])), noCapturePlies: 119 }
    const draw = tryMove(drawn, chooseMove(drawn, difficulty)!)
    expect(draw.ok && draw.game.result).toEqual({ winner: null, reason: 'natural-limit' })
  })

  it('easy takes a hanging horse while normal sees the legal rook recapture and avoids it', () => {
    const game = trap()
    const greedy = chooseMove(game, 'easy')!
    expect(greedy).toEqual({ from: { x: 4, y: 5 }, to: { x: 4, y: 3 } })
    const capture = tryMove(game, greedy)
    expect(capture.ok && capture.captured).toBe(true)
    if (!capture.ok) throw new Error(capture.error)
    const reply = tryMove(capture.game, { from: { x: 4, y: 2 }, to: { x: 4, y: 3 } })
    expect(reply.ok && reply.captured && reply.game.board[3][4]).toEqual({ side: 'black', type: 'rook' })
    expect(chooseMove(game, 'normal')).not.toEqual(greedy)
  })

  it('challenge actually replays our third ply within its node budget', () => {
    const game = trap()
    const realTryMove = rules.tryMove
    const third: { game: rules.Game; move: NonNullable<ReturnType<typeof chooseMove>> }[] = []
    const spy = vi.spyOn(rules, 'tryMove').mockImplementation((state, move) => {
      if (state.positionKeys.length === game.positionKeys.length + 2) third.push({ game: state, move })
      return realTryMove(state, move)
    })
    try {
      const move = chooseMove(game, 'challenge')
      expect(legalMoves(game.board, game.turn)).toContainEqual(move)
      expect(third.length).toBeGreaterThan(0)
      expect(spy.mock.calls.length).toBeLessThanOrEqual(2000)
      for (const node of third) {
        expect(node.game.turn).toBe('red')
        const replay = realTryMove(node.game, node.move)
        expect(replay.ok).toBe(true)
        expect(replay.ok && replay.game.positionKeys.length).toBe(game.positionKeys.length + 3)
      }
    } finally { spy.mockRestore() }
  })

  it.each(['normal', 'challenge'] as const)('%s values a formal draw on the opponent reply as neutral despite losing material', difficulty => {
    const game = { ...createGame(position([4, 9, 'red', 'general'], [3, 0, 'black', 'general'], [0, 0, 'black', 'rook'])), noCapturePlies: 118 }
    const report = searchMove(game, difficulty)
    const ours = tryMove(game, report.move!)
    expect(ours.ok && ours.game.result).toBeNull()
    if (!ours.ok) throw new Error(ours.error)
    for (const reply of legalMoves(ours.game.board, 'black')) {
      const drawn = tryMove(ours.game, reply)
      expect(drawn.ok && drawn.game.result).toEqual({ winner: null, reason: 'natural-limit' })
    }
    expect(report.score).toBe(0)
  })

  it('discards an unfinished deeper iteration and retains the completed two-ply choice', () => {
    const game = trap()
    const shallow = searchMove(game, 'normal')
    const limited = searchMove(game, 'challenge', shallow.nodes + 1)
    expect(limited.completedPlies).toBe(2)
    expect(limited.nodes).toBeLessThanOrEqual(shallow.nodes + 1)
    expect(limited.move).toEqual(shallow.move)
    expect(searchMove(game, 'challenge').completedPlies).toBe(3)
  })

  it('keeps a forced draw neutral when the opponent can also capture into a zero-material third ply', () => {
    const game = { ...createGame(position(
      [4, 9, 'red', 'general'], [3, 0, 'black', 'general'],
      [0, 1, 'black', 'rook'], [7, 8, 'red', 'rook'], [0, 0, 'red', 'cannon'],
    )), noCapturePlies: 118 }
    expect(isInCheck(game.board, 'red')).toBe(false)
    expect(isInCheck(game.board, 'black')).toBe(false)
    expect(searchMove(game, 'normal').score).toBe(0)
    const report = searchMove(game, 'challenge')
    expect(report.completedPlies).toBe(3)
    const chosen = tryMove(game, report.move!)
    if (!chosen.ok) throw new Error(chosen.error)
    const drawReply = legalMoves(chosen.game.board, 'black').find(move => !chosen.game.board[move.to.y][move.to.x])!
    const chosenDraw = tryMove(chosen.game, drawReply)
    expect(chosenDraw.ok && chosenDraw.game.result).toEqual({ winner: null, reason: 'natural-limit' })
    // Replay the formerly overvalued root as well, regardless of the corrected tie selection.
    const rootMove = { from: { x: 7, y: 8 }, to: { x: 7, y: 7 } }
    const root = tryMove(game, rootMove)
    if (!root.ok) throw new Error(root.error)
    const drawn = tryMove(root.game, { from: { x: 0, y: 1 }, to: { x: 0, y: 2 } })
    expect(drawn.ok && drawn.game.result).toEqual({ winner: null, reason: 'natural-limit' })
    const captured = tryMove(root.game, { from: { x: 0, y: 1 }, to: { x: 0, y: 0 } })
    expect(captured.ok && captured.captured).toBe(true)
    if (!captured.ok) throw new Error(captured.error)
    expect(captured.game.result).toBeNull()
    const response = tryMove(captured.game, { from: rootMove.to, to: { x: 6, y: rootMove.to.y } })
    expect(response.ok && response.game.result).toBeNull()
    expect(response.ok && response.game.board.flat().filter(piece => piece?.type === 'rook')).toHaveLength(2)
    expect(report.score).toBe(0)
    expect(searchMove(game, 'challenge').move).toEqual(report.move)
  })

  it('replays third-ply ties between a material-equal capture and a formal draw', () => {
    const game = { ...createGame(position(
      [4, 9, 'red', 'general'], [3, 0, 'black', 'general'],
      [0, 1, 'black', 'rook'], [7, 8, 'red', 'rook'], [0, 0, 'black', 'cannon'],
    )), noCapturePlies: 117 }
    const realTryMove = rules.tryMove
    const groups = new Map<rules.Game, { move: NonNullable<ReturnType<typeof chooseMove>>; after: rules.Game }[]>()
    const spy = vi.spyOn(rules, 'tryMove').mockImplementation((state, move) => {
      const result = realTryMove(state, move)
      if (state.noCapturePlies === 119 && state.positionKeys.length === game.positionKeys.length + 2 && result.ok) {
        const group = groups.get(state) ?? []
        group.push({ move, after: result.game })
        groups.set(state, group)
      }
      return result
    })
    try {
      const report = searchMove(game, 'challenge')
      const tied = [...groups.entries()].find(([, nodes]) => {
        const captureIndex = nodes.findIndex(node => !node.after.result && node.after.board.flat().filter(Boolean).length === 4 && node.after.board.flat().filter(piece => piece?.type === 'rook').length === 2)
        const drawIndex = nodes.findIndex(node => node.after.result?.reason === 'natural-limit')
        return captureIndex >= 0 && drawIndex > captureIndex
      })
      expect(tied).toBeTruthy()
      for (const node of tied![1]) {
        const replay = realTryMove(tied![0], node.move)
        expect(replay.ok && replay.game).toEqual(node.after)
      }
      expect(report.completedPlies).toBe(3)
      expect(report.nodes).toBeLessThanOrEqual(2000)
      expect(realTryMove(game, report.move!).ok).toBe(true)
    } finally { spy.mockRestore() }
  })

  it('challenge sees its cannon recapture on the third ply and accepts the rook exchange that normal avoids', () => {
    const board = trap().board
    board[8][4] = { side: 'red', type: 'cannon' }
    const game = createGame(board)
    const sacrifice = { from: { x: 4, y: 5 }, to: { x: 4, y: 3 } }
    expect(chooseMove(game, 'normal')).not.toEqual(sacrifice)
    expect(chooseMove(game, 'challenge')).toEqual(sacrifice)
    let state = game
    for (const move of [sacrifice, { from: { x: 4, y: 2 }, to: { x: 4, y: 3 } }, { from: { x: 4, y: 8 }, to: { x: 4, y: 3 } }]) {
      const result = tryMove(state, move)
      expect(result.ok && result.captured).toBe(true)
      if (!result.ok) throw new Error(result.error)
      state = result.game
    }
    expect(state.board[3][4]).toEqual({ side: 'red', type: 'cannon' })
    expect(state.board.flat().filter(piece => piece?.type === 'rook' || piece?.type === 'horse')).toHaveLength(0)
    expect(isInCheck(state.board, 'red')).toBe(false)
  })

  it('the real worker routes difficulty and defaults missing or invalid values to normal', async () => {
    const fake = { onmessage: null as ((event: { data: unknown }) => void) | null, postMessage: vi.fn() }
    vi.stubGlobal('self', fake)
    try {
      await import('../src/ai/worker')
      const board = trap().board
      board[8][4] = { side: 'red', type: 'cannon' }
      const game = createGame(board)
      for (const [difficulty, y] of [['easy', 3], ['normal', 4], ['challenge', 3], [undefined, 4], ['invalid', 4]] as const) {
        fake.onmessage?.({ data: { id: 42, game, difficulty } })
        expect(fake.postMessage).toHaveBeenLastCalledWith({ id: 42, move: { from: { x: 4, y: 5 }, to: { x: 4, y } } })
      }
    } finally { vi.unstubAllGlobals() }
  })
})
