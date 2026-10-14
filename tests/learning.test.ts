import { describe, expect, it } from 'vitest'
import { createSession, play, resign } from '../src/core/session'
import type { Session } from '../src/core/session'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'
import { awardMatchMilestones, markVariantAssisted, recordChallenge, selectNextChallengeVariant, setCoachEnabled, startLearningMatch } from '../src/core/learning'

let completedGame: Session | undefined
function naturalLimitSession(): Session {
  if (completedGame) return completedGame
  const moves = [
    { from: { x: 0, y: 9 }, to: { x: 0, y: 8 } },
    { from: { x: 0, y: 0 }, to: { x: 0, y: 1 } },
    { from: { x: 0, y: 8 }, to: { x: 0, y: 9 } },
    { from: { x: 0, y: 1 }, to: { x: 0, y: 0 } },
  ]
  let session = createSession('ai')
  for (let index = 0; index < 120; index++) {
    const result = play(session, moves[index % moves.length])
    if (!result.ok) throw new Error(`move ${index + 1} was illegal: ${result.error}`)
    session = result.session
  }
  expect(session.game.result).toEqual({ winner: null, reason: 'natural-limit' })
  completedGame = session
  return session
}

describe('challenge progress', () => {
  it('records an unassisted first completion as practiced and mastered without mutating prior state', () => {
    const progress = defaultProgress()
    const next = recordChallenge(progress, 'horse', 'horse-variant-1', false)
    expect(next.practicedUnits).toEqual(['horse'])
    expect(next.masteredUnits).toEqual(['horse'])
    expect(next.assistedVariants).toEqual([])
    expect(progress.practicedUnits).toEqual([])
    expect(progress.masteredUnits).toEqual([])
  })

  it('keeps a hinted variant ineligible for mastery even when completed without help later', () => {
    const progress = defaultProgress()
    const hinted = markVariantAssisted(progress, 'horse-variant-1')
    const first = recordChallenge(hinted, 'horse', 'horse-variant-1', true)
    const repeated = recordChallenge(first, 'horse', 'horse-variant-1', false)
    expect(progress.assistedVariants).toEqual([])
    expect(first.practicedUnits).toEqual(['horse'])
    expect(repeated.practicedUnits).toEqual(['horse'])
    expect(repeated.masteredUnits).toEqual([])
    expect(repeated.assistedVariants).toEqual(['horse-variant-1'])
  })

  it('offers another unseen and unassisted variant and lets it grant mastery', () => {
    const first = recordChallenge(defaultProgress(), 'horse', 'horse-variant-1', true)
    const ids = ['horse-variant-1', 'horse-variant-2', 'horse-variant-3']
    expect(selectNextChallengeVariant(first, ids, ['horse-variant-2'])).toBe('horse-variant-3')
    const next = recordChallenge(first, 'horse', 'horse-variant-3', false)
    expect(next.masteredUnits).toEqual(['horse'])
    expect(first.masteredUnits).toEqual([])
    expect(recordChallenge(next, 'horse', 'horse-variant-3', false).masteredUnits).toEqual(['horse'])
  })

  it('does not offer false mastery when all variants were exposed or already seen', () => {
    const exposed = markVariantAssisted(markVariantAssisted(defaultProgress(), 'horse-variant-1'), 'horse-variant-2')
    const ids = ['horse-variant-1', 'horse-variant-2']
    expect(selectNextChallengeVariant(exposed, ids)).toBeNull()
    expect(recordChallenge(exposed, 'horse', 'horse-variant-2', false).masteredUnits).toEqual([])
    expect(selectNextChallengeVariant(defaultProgress(), ids, ids)).toBeNull()
  })
})

describe('learning match milestones', () => {
  it('awards a replayable standard-start natural-limit game', () => {
    const session = naturalLimitSession()
    const initial = { ...startLearningMatch(defaultProgress(), createSession('ai')), session }
    const awarded = awardMatchMilestones(initial, initial.session)
    expect(awarded.milestones).toEqual({ firstMatch: true, independentMatch: true })
    expect(initial.milestones).toEqual({ firstMatch: false, independentMatch: false })
  })

  it('keeps a tool-assisted real terminal game eligible for first match but not independent match', () => {
    const initial = startLearningMatch(defaultProgress(), createSession('ai'))
    const assisted = { ...initial, session: naturalLimitSession(), learningMatch: { ...initial.learningMatch!, toolMoveUsed: true } }
    const disabled = setCoachEnabled(assisted, false)
    expect(disabled.learningMatch).toMatchObject({ toolMoveUsed: true, coachEverUsed: false })
    expect(awardMatchMilestones(disabled, disabled.session).milestones).toEqual({ firstMatch: true, independentMatch: false })
    expect(startLearningMatch(disabled, createSession('ai')).learningMatch?.toolMoveUsed).toBe(false)
  })

  it('keeps coach use sticky after disabling and after persistence reload', () => {
    const initial = startLearningMatch(defaultProgress(), createSession('ai'))
    const coached = setCoachEnabled(initial, true)
    const disabled = setCoachEnabled(coached, false)
    expect(disabled.learningMatch).toMatchObject({ coachEnabled: false, coachEverUsed: true })
    expect(initial.learningMatch?.coachEverUsed).toBe(false)
    const store = new Map<string, string>()
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value) } }
    expect(saveProgress(storage, disabled)).toBe(true)
    const restored = { ...loadProgress(storage), session: naturalLimitSession() }
    expect(saveProgress(storage, restored)).toBe(true)
    const reloaded = loadProgress(storage)
    expect(reloaded.learningMatch?.coachEverUsed).toBe(true)
    expect(awardMatchMilestones(reloaded, reloaded.session).milestones).toEqual({ firstMatch: true, independentMatch: false })
  })

  it.each(['resignation', 'agreement'] as const)('does not award for %s', reason => {
    const initial = startLearningMatch(defaultProgress(), createSession('ai'))
    const session: Session = reason === 'resignation' ? resign(createSession('ai'), 'red') :
      { ...initial.session, game: { ...initial.session.game, result: { winner: null, reason } } }
    const current = { ...initial, session }
    expect(awardMatchMilestones(current, current.session).milestones).toEqual(initial.milestones)
  })

  it('rejects unfinished, nonstandard, local, and inactive matches', () => {
    const initial = startLearningMatch(defaultProgress(), createSession('ai'))
    expect(awardMatchMilestones(initial, initial.session).milestones.firstMatch).toBe(false)
    const localSession = { ...naturalLimitSession(), mode: 'local' as const }
    expect(awardMatchMilestones({ ...initial, session: localSession }, localSession).milestones.firstMatch).toBe(false)
    const nonstandard = startLearningMatch(defaultProgress(), { ...createSession('ai'), records: [{
      move: { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } }, notation: '', coordinate: '', side: 'red', captured: false, check: false,
    }] })
    expect(nonstandard.learningMatch?.standardStart).toBe(false)
    const finished = naturalLimitSession()
    expect(awardMatchMilestones({ ...nonstandard, session: finished }, finished).milestones.firstMatch).toBe(false)
    expect(awardMatchMilestones({ ...defaultProgress(), session: finished }, finished).milestones.firstMatch).toBe(false)
  })

  it('rejects a completed game passed from outside progress', () => {
    const progress = startLearningMatch(defaultProgress(), createSession('ai'))
    expect(awardMatchMilestones(progress, naturalLimitSession()).milestones.firstMatch).toBe(false)
  })

  it.each(['checkmate', 'stalemate', 'natural-limit'] as const)('rejects an injected %s result without any moves', reason => {
    const initial = startLearningMatch(defaultProgress(), createSession('ai'))
    const session: Session = { ...initial.session, game: { ...initial.session.game, result: { winner: reason === 'natural-limit' ? null : 'red', reason } } }
    expect(awardMatchMilestones({ ...initial, session }, session).milestones.firstMatch).toBe(false)
  })

  it('rejects an altered move record in an otherwise completed game', () => {
    const initial = startLearningMatch(defaultProgress(), createSession('ai'))
    const finished = naturalLimitSession()
    const records = [...finished.records]
    records[0] = { ...records[0], move: { from: { x: 4, y: 4 }, to: { x: 4, y: 5 } } }
    const session = { ...finished, records }
    expect(awardMatchMilestones({ ...initial, session }, session).milestones.firstMatch).toBe(false)
  })

  it('rejects altered notation or a forged final outcome after legal moves', () => {
    const initial = startLearningMatch(defaultProgress(), createSession('ai'))
    const finished = naturalLimitSession()
    const records = [...finished.records]
    records[0] = { ...records[0], notation: '伪造着法' }
    const wrongRecord = { ...finished, records }
    expect(awardMatchMilestones({ ...initial, session: wrongRecord }, wrongRecord).milestones.firstMatch).toBe(false)
    const wrongResult: Session = { ...finished, game: { ...finished.game, result: { winner: 'red', reason: 'checkmate' } } }
    expect(awardMatchMilestones({ ...initial, session: wrongResult }, wrongResult).milestones.firstMatch).toBe(false)
  })

  it('rejects a completed game whose initial snapshot was altered', () => {
    const initial = startLearningMatch(defaultProgress(), createSession('ai'))
    const finished = naturalLimitSession()
    const snapshots = [...finished.snapshots]
    snapshots[0] = { ...snapshots[0], noCapturePlies: 1 }
    const session = { ...finished, snapshots }
    expect(awardMatchMilestones({ ...initial, session }, session).milestones.firstMatch).toBe(false)
  })

  it('does not mistake an edited initial board state for a standard opening', () => {
    const session = createSession('ai')
    const altered = { ...session, game: { ...session.game, noCapturePlies: 100 } }
    expect(startLearningMatch(defaultProgress(), altered).learningMatch?.standardStart).toBe(false)
  })

  it('starts a new match with coach history reset while keeping earned milestones', () => {
    const old = { ...defaultProgress(), milestones: { firstMatch: true, independentMatch: false } }
    const coached = setCoachEnabled(startLearningMatch(old, createSession('ai')), true)
    const fresh = startLearningMatch(coached, createSession('ai'))
    expect(fresh.learningMatch).toEqual({ active: true, standardStart: true, coachEnabled: false, coachEverUsed: false, checkpointSeen: false, toolMoveUsed: false })
    expect(fresh.milestones).toEqual(old.milestones)
    expect(coached.learningMatch?.coachEverUsed).toBe(true)
  })
})
