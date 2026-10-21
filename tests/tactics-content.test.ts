import { describe, expect, it } from 'vitest'
import { tacticBoard, tactics } from '../src/content/tactics'
import type { Tactic } from '../src/content/tactics'
import { tacticsData } from '../src/content/tactics-data'
import { tacticFeedback, tacticHints, tacticView } from '../src/core/tactics-view'
import { compileTactic, decode, encode, validateSetup, verifyTactic } from './helpers/tactics-compiler'
import { referenceEvaluator } from './helpers/tactics-reference'
import { legalMoves, tryMove } from '../src/core/rules'

describe('published original finite tactics', () => {
  it('contains six independent puzzles and bounded replayable complete proofs', () => {
    expect(tactics.map(t => t.id)).toEqual(['checks-red', 'checks-black', 'gain-red', 'gain-black', 'counter-red', 'counter-black'])
    expect(new TextEncoder().encode(JSON.stringify({ tactics, tacticsData })).length).toBeLessThanOrEqual(512 * 1024)
    for (const tactic of tactics) {
      expect(tactic.version).toBe(1)
      expect(tactic.maxOwnMoves).toBe(tactic.topic === 'checks' ? 3 : 2)
      expect(verifyTactic(tactic, tacticsData[tactic.id])).toEqual({ valid: true })
      const generated = compileTactic(tactic)
      expect(generated.data).toEqual(tacticsData[tactic.id])
      expect(generated.states).toBeLessThanOrEqual(1_000_000)
      let path = [] as Parameters<typeof tacticView>[1]
      while (!tacticView(tactic.id, path)!.complete) {
        const view = tacticView(tactic.id, path)!
        const move = view.learnerTurn ? view.correctMoves[0] : view.reply!
        expect(move).toBeTruthy()
        path = [...path, move]
      }
      expect(path.length).toBeGreaterThanOrEqual(3)
      expect(path.length).toBeLessThanOrEqual(6)
      expect(tacticView(tactic.id, path)!.notes).toHaveLength(path.length)
    }
  }, 120_000)
  it('accepts every published solution, rejects invalid prefixes, and gives branch-specific feedback', () => {
    for (const tactic of tactics) {
      const view = tacticView(tactic.id, [])!
      expect(view.learnerTurn).toBe(true)
      expect(view.captures.score).toBe(0)
      expect(tacticHints(tactic.id, [])).toHaveLength(3)
      for (const move of view.correctMoves) expect(tacticFeedback(tactic.id, [], move).status).toBe('success')
      expect(tacticFeedback(tactic.id, [], { from: { x: -1, y: 0 }, to: { x: 0, y: 0 } }).status).toBe('illegal')
      expect(tacticView(tactic.id, [{ from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }])).toBeNull()
    }
    expect(tacticView('unknown', [])).toBeNull()
  })
  it('adapts second-turn counter hints to the real branch after the first escape', () => {
    for (const tactic of tactics.filter(t => t.topic === 'counter')) {
      const start = tacticView(tactic.id, [])!
      for (const move of start.correctMoves) {
        const defense = tacticView(tactic.id, [move])!.reply!
        const path = [move, defense]
        const hints = tacticHints(tactic.id, path)
        expect(hints[0]).toContain('第二步')
        expect(hints.join('')).not.toContain('正在被将军')
        expect(hints[2]).toContain('当前一条正确着法')
      }
    }
  })
  it('explains an early broken checking chain without claiming the move limit was reached', () => {
    const tactic = tactics.find(t => t.id === 'checks-black')!
    const wrong = decode('1xr')
    const feedback = tacticFeedback(tactic.id, [], wrong)
    expect(feedback.status).toBe('not-goal')
    expect(feedback.refutation?.map(encode)).toEqual(['5ym', '5mi'])
    const oracle = referenceEvaluator(tactic)
    const end = oracle.replay([wrong, ...feedback.refutation!])
    expect(end.own).toBe(2)
    expect(end.checking).toBe(false)
    expect(end.game.result).toBeNull()
    expect(feedback.message).toContain('连续将军中断')
    expect(feedback.message).toContain('己方第 2 步没有将军')
    expect(feedback.message).not.toContain('未在限步内将死')
  })
  it('replays every published branch, every wrong legal move, and every legal counterline', () => {
    for (const tactic of tactics) for (const [key, node] of Object.entries(tacticsData[tactic.id])) {
      const path = key ? key.split('.').map(decode) : []
      const view = tacticView(tactic.id, path)!
      expect(view).not.toBeNull()
      expect(view.complete).toBe(node.moves.length === 0)
      if (!view.learnerTurn) continue
      for (const move of legalMoves(view.game.board, view.game.turn)) {
        const feedback = tacticFeedback(tactic.id, path, move)
        const correct = node.moves.includes(encode(move))
        expect(feedback.status).toBe(correct ? 'success' : 'not-goal')
        if (correct) continue
        expect(tacticView(tactic.id, [...path, move])).toBeNull()
        let result = tryMove(view.game, move)
        expect(result.ok).toBe(true)
        for (const defense of feedback.refutation ?? []) {
          if (!result.ok) throw Error('invalid replay')
          result = tryMove(result.game, defense)
          expect(result.ok).toBe(true)
        }
        if (feedback.refutation) expect(feedback.message).toContain('一种可行防守')
        else expect(feedback.message).toMatch(/本着没有将军|第二步没有真实将军|棋局提前结束|己方已走/)
      }
    }
  })
  it('retains multiple solutions and rejects missing defense, missing solution, false move, and invalid refutation mutants', () => {
    const tactic = tactics[0]
    const original = tacticsData[tactic.id]
    expect(original[''].moves.length).toBeGreaterThan(1)
    const missingSolution = structuredClone(original)
    missingSolution[''].moves.pop()
    expect(verifyTactic(tactic, missingSolution).valid).toBe(false)
    const missingDefense = structuredClone(original)
    const defenseKey = Object.keys(original).find(key => original[key].reply)!
    missingDefense[defenseKey].moves.pop()
    expect(verifyTactic(tactic, missingDefense).valid).toBe(false)
    const falseMove = structuredClone(original)
    falseMove[''].moves.push(Object.keys(falseMove[''].failures!)[0])
    expect(verifyTactic(tactic, falseMove).valid).toBe(false)
    const badCounter = structuredClone(original)
    const key = Object.keys(original).find(key => Object.values(original[key].failures ?? {}).some(([, line]) => line.length))!
    const failed = Object.keys(badCounter[key].failures!).find(move => badCounter[key].failures![move][1].length)!
    badCounter[key].failures![failed][1][0] = 'zzzzz'
    expect(verifyTactic(tactic, badCounter).valid).toBe(false)
  })
  it('rejects a cooperative-only gain setup even though a displayed reference line could succeed', () => {
    const base = tactics.find(t => t.id === 'gain-red')!
    const trap: Tactic = { ...base, id: 'cooperative-only', board: tacticBoard([
      ['red', 'general', 4, 9], ['black', 'general', 4, 0], ['red', 'soldier', 4, 5], ['black', 'rook', 5, 3],
    ]) }
    validateSetup(trap)
    const cooperative = referenceEvaluator(trap, true)
    expect(cooperative.proof(cooperative.replay([])).win).toBe(true)
    const universal = referenceEvaluator(trap)
    expect(universal.proof(universal.replay([])).win).toBe(false)
    expect(() => compileTactic(trap)).toThrow('no forced solution')
    expect(verifyTactic(trap, { '': { moves: [] } }).valid).toBe(false)
  })
  it('rejects an allowed failure reason whose claimed predicate is false after the submitted move', () => {
    const tactic = tactics[0]
    const mutant = structuredClone(tacticsData[tactic.id])
    const wrong = Object.keys(mutant[''].failures!).find(key => mutant[''].failures![key][0] === 'must-check')!
    const submitted = referenceEvaluator(tactic).replay([decode(wrong)])
    expect(submitted.game.result).toBeNull()
    expect(submitted.checking).toBe(false)
    mutant[''].failures![wrong][0] = 'early-terminal'
    expect(verifyTactic(tactic, mutant)).toEqual({ valid: false, error: 'Error: failure reason contradicts submitted position' })
  })
  it('rejects malformed setups and does not infer captured pieces from missing initial material', () => {
    for (const tactic of tactics) {
      const view = tacticView(tactic.id, [])!
      expect(view.captures).toEqual({ score: 0, red: [], black: [] })
    }
    const noGeneral = structuredClone(tactics[0]); noGeneral.board[0][4] = null
    expect(() => validateSetup(noGeneral)).toThrow('invalid generals')
    const outsidePalace = structuredClone(tactics[0]); outsidePalace.board[0][0] = outsidePalace.board[0][4]; outsidePalace.board[0][4] = null
    expect(() => validateSetup(outsidePalace)).toThrow('invalid generals')
    const invalidPiece = structuredClone(tactics[0]); (invalidPiece.board[5][4] as unknown as {type: string}).type = 'dragon'
    expect(() => validateSetup(invalidPiece)).toThrow('invalid piece')
  })
  it('uses independent setups rather than mirror or color-flip duplicates', () => {
    const fingerprints = new Set<string>()
    for (const tactic of tactics) {
      const variants: string[] = []
      for (const flipX of [false, true]) for (const flipSides of [false, true]) {
        const board = tactic.board.map((row, y) => row.map((_, x) => {
          const piece = tactic.board[flipSides ? 9 - y : y][flipX ? 8 - x : x]
          return piece ? { type: piece.type, side: flipSides ? piece.side === 'red' ? 'black' : 'red' : piece.side } : null
        }))
        variants.push(JSON.stringify(board))
      }
      expect(variants.some(value => fingerprints.has(value))).toBe(false)
      variants.forEach(value => fingerprints.add(value))
    }
  })
})
