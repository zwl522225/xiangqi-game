import { describe, expect, it } from 'vitest'
import { acceptDraw, createSession, offerDraw, play, resign, setView, undo, viewGame } from '../src/core/session'

const redSoldier = { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } }
const blackSoldier = { from: { x: 0, y: 3 }, to: { x: 0, y: 4 } }

describe('match session', () => {
  it('keeps readable records and lets review the start without changing live state', () => {
    const initial = createSession()
    const result = play(initial, { from: { x: 7, y: 7 }, to: { x: 4, y: 7 } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.session.records[0]).toMatchObject({ notation: '炮二平五', coordinate: '(7,7)→(4,7)' })
    const reviewing = setView(result.session, 0)
    expect(viewGame(reviewing).board[7][7]?.type).toBe('cannon')
    expect(reviewing.game.board[7][4]?.type).toBe('cannon')
  })

  it('undoes one move in local play and a pair in human-versus-computer', () => {
    const local = play(createSession(), redSoldier)
    expect(local.ok && undo(local.session).game.turn).toBe('red')
    let ai = createSession('ai', 'red')
    const first = play(ai, redSoldier)
    if (!first.ok) return
    const second = play(first.session, blackSoldier)
    if (!second.ok) return
    ai = undo(second.session)
    expect(ai.game.turn).toBe('red')
    expect(ai.records).toHaveLength(0)
  })

  it('requires agreement for a local draw and records resignation', () => {
    const offered = offerDraw(createSession(), 'red')
    expect(offered.game.result).toBe(null)
    expect(acceptDraw(offered, 'red').game.result).toBe(null)
    expect(acceptDraw(offered, 'black').game.result).toEqual({ winner: null, reason: 'agreement' })
    expect(resign(createSession(), 'red').game.result).toEqual({ winner: 'black', reason: 'resignation' })
  })
})
