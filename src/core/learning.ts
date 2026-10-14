import { createInitialBoard } from './board'
import { positionKey } from './rules'
import type { Game } from './rules'
import { createSession, play } from './session'
import type { RecordItem, Session } from './session'
import type { Progress } from './storage'

function addUnique(values: string[], value: string): string[] {
  return values.includes(value) ? [...values] : [...values, value]
}

// Call as soon as a hint or answer is shown; exposure remains recorded across visits.
export function markVariantAssisted(progress: Progress, variantId: string): Progress {
  return { ...progress, assistedVariants: addUnique(progress.assistedVariants, variantId) }
}

export function selectNextChallengeVariant(progress: Progress, variantIds: readonly string[], seenVariantIds: readonly string[] = []): string | null {
  return variantIds.find(id => !progress.assistedVariants.includes(id) && !seenVariantIds.includes(id)) ?? null
}

export function recordChallenge(progress: Progress, unitId: string, variantId: string, assisted: boolean): Progress {
  const assistedVariants = assisted ? addUnique(progress.assistedVariants, variantId) : [...progress.assistedVariants]
  const mastered = !assisted && !progress.assistedVariants.includes(variantId)
  return {
    ...progress,
    practicedUnits: addUnique(progress.practicedUnits, unitId),
    masteredUnits: mastered ? addUnique(progress.masteredUnits, unitId) : [...progress.masteredUnits],
    assistedVariants,
  }
}

export function startLearningMatch(progress: Progress, session: Session): Progress {
  const initialKey = positionKey(createInitialBoard(), 'red')
  const freshInitial = (game: Game) => game.result === null && game.turn === 'red' &&
    game.noCapturePlies === 0 && !game.repetitionWarning && game.positionKeys.length === 1 &&
    game.positionKeys[0] === initialKey && positionKey(game.board, game.turn) === initialKey
  const standardStart = session.records.length === 0 && session.snapshots.length === 1 &&
    session.viewIndex === 0 && freshInitial(session.game) && freshInitial(session.snapshots[0])
  return {
    ...progress, session,
    learningMatch: { active: session.mode === 'ai', standardStart, coachEnabled: false, coachEverUsed: false, checkpointSeen: false, toolMoveUsed: false },
  }
}

export function setCoachEnabled(progress: Progress, enabled: boolean): Progress {
  const match = progress.learningMatch
  if (!match) return { ...progress }
  return { ...progress, learningMatch: { ...match, coachEnabled: enabled, coachEverUsed: match.coachEverUsed || enabled } }
}

function sameGame(expected: Game, actual: Game | undefined): boolean {
  if (!actual || expected.turn !== actual.turn || expected.noCapturePlies !== actual.noCapturePlies ||
    expected.repetitionWarning !== actual.repetitionWarning) return false
  if (expected.result === null || actual.result === null) {
    if (expected.result !== actual.result) return false
  } else if (expected.result.winner !== actual.result.winner || expected.result.reason !== actual.result.reason) return false
  if (!Array.isArray(actual.positionKeys) || expected.positionKeys.length !== actual.positionKeys.length ||
    expected.positionKeys.some((key, index) => key !== actual.positionKeys[index])) return false
  if (!Array.isArray(actual.board) || actual.board.length !== expected.board.length) return false
  return expected.board.every((row, y) => Array.isArray(actual.board[y]) && actual.board[y].length === row.length &&
    row.every((piece, x) => {
      const other = actual.board[y][x]
      return piece === null || other === null ? piece === other :
        piece.side === other.side && piece.type === other.type
    }))
}

function sameRecord(expected: RecordItem, actual: RecordItem | undefined): boolean {
  return Boolean(actual?.move?.from && actual.move.to &&
    expected.move.from.x === actual.move.from.x && expected.move.from.y === actual.move.from.y &&
    expected.move.to.x === actual.move.to.x && expected.move.to.y === actual.move.to.y &&
    expected.notation === actual.notation && expected.coordinate === actual.coordinate &&
    expected.side === actual.side && expected.captured === actual.captured && expected.check === actual.check)
}

function replayedTerminal(session: Session): boolean {
  try {
    if (!Array.isArray(session.records) || session.records.length === 0 ||
      !Array.isArray(session.snapshots) || session.snapshots.length !== session.records.length + 1) return false
    if (session.playerSide !== 'red' && session.playerSide !== 'black') return false
    let replay = createSession('ai', session.playerSide)
    if (!sameGame(replay.game, session.snapshots[0])) return false
    let humanMoves = 0
    for (const [index, record] of session.records.entries()) {
      const result = play(replay, record.move)
      if (!result.ok || !sameRecord(result.session.records[index], record) ||
        !sameGame(result.session.game, session.snapshots[index + 1])) return false
      if (record.side === session.playerSide) humanMoves++
      replay = result.session
    }
    return humanMoves > 0 && sameGame(replay.game, session.game)
  } catch {
    return false
  }
}

export function awardMatchMilestones(progress: Progress, session: Session): Progress {
  const match = progress.learningMatch
  const reason = session.game.result?.reason
  if (!match?.active || !match.standardStart || session !== progress.session || session.mode !== 'ai' ||
    (reason !== 'checkmate' && reason !== 'stalemate' && reason !== 'natural-limit') ||
    !replayedTerminal(session)) return { ...progress }
  return {
    ...progress,
    milestones: {
      firstMatch: true,
      independentMatch: progress.milestones.independentMatch || (!match.coachEverUsed && !match.toolMoveUsed),
    },
  }
}
