import { chooseMove } from './evaluate'
import type { Game } from '../core/rules'
import { normalizeDifficulty } from './difficulty'
import type { AiDifficulty } from './difficulty'

export type WorkerRequest = { id: number; game: Game; difficulty?: AiDifficulty }
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, game, difficulty } = event.data
  try {
    self.postMessage({ id, move: chooseMove(game, normalizeDifficulty(difficulty)) })
  } catch {
    self.postMessage({ id, move: null })
  }
}
