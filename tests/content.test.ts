import { describe, expect, it } from 'vitest'
import { createGame, tryMove } from '../src/core/rules'
import { lessons } from '../src/content/lessons'
import { openings } from '../src/content/openings'
import { glossary } from '../src/content/glossary'
import { puzzles } from '../src/content/puzzles'

describe('learning content', () => {
  it('offers eight lessons with achievable board actions', () => {
    expect(lessons).toHaveLength(8)
    for (const lesson of lessons) {
      expect(lesson.title.length).toBeGreaterThan(1)
      expect(lesson.prompt.length).toBeGreaterThan(3)
      expect(tryMove(createGame(lesson.board, lesson.turn), lesson.target).ok).toBe(true)
    }
  })

  it('plays four legal and explained opening lines', () => {
    expect(openings).toHaveLength(4)
    for (const opening of openings) {
      expect(opening.steps.length).toBeGreaterThanOrEqual(2)
      let game = createGame()
      for (const step of opening.steps) {
        expect(step.note.length).toBeGreaterThan(3)
        const result = tryMove(game, step.move)
        expect(result.ok, `${opening.title}: ${JSON.stringify(step.move)}`).toBe(true)
        if (!result.ok) break
        game = result.game
      }
    }
  })

  it('has searchable glossary examples and six legal endgame exercises', () => {
    expect(glossary.length).toBeGreaterThanOrEqual(24)
    expect(new Set(glossary.map(entry => entry.id)).size).toBe(glossary.length)
    for (const entry of glossary) {
      expect(entry.definition.length).toBeGreaterThan(5)
      expect(entry.example.board.length).toBe(10)
      expect(entry.example.caption.length).toBeGreaterThan(2)
    }
    expect(puzzles).toHaveLength(6)
    for (const puzzle of puzzles) {
      expect(puzzle.board.flat().filter(Boolean).length).toBeLessThanOrEqual(8)
      expect(tryMove(createGame(puzzle.board, puzzle.turn), puzzle.target).ok).toBe(true)
    }
  })

  it('really reaches mate and stalemate in the named exercises', () => {
    for (const [id, reason] of [['mate', 'checkmate'], ['stalemate', 'stalemate']] as const) {
      const puzzle = puzzles.find(item => item.id === id)!
      const result = tryMove(createGame(puzzle.board, puzzle.turn), puzzle.target)
      expect(result.ok && result.game.result?.reason).toBe(reason)
    }
    const finish = lessons.find(item => item.id === 'finish')!
    expect(finish.bonus).toBeTruthy()
    const bonus = finish.bonus!
    const result = tryMove(createGame(bonus.board, bonus.turn), bonus.target)
    expect(result.ok && result.game.result?.reason).toBe('stalemate')
  })
})
