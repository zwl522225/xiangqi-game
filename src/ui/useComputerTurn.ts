import { useEffect, useRef, useState } from 'react'
import { chooseFallbackMove } from '../ai/evaluate'
import { difficultyProfiles } from '../ai/difficulty'
import type { AiDifficulty } from '../ai/difficulty'
import { legalMoves } from '../core/rules'
import { play } from '../core/session'
import type { Session } from '../core/session'
import type { Move } from '../core/types'

let requestSequence = 0

export function useComputerTurn(session: Session, difficulty: AiDifficulty, onChange: (session: Session) => void, onNotice: (text: string) => void): boolean {
  const [thinking, setThinking] = useState(false)
  const latest = useRef({ session, difficulty, onChange, onNotice })
  latest.current = { session, difficulty, onChange, onNotice }

  useEffect(() => {
    const expectedGame = session.game
    if (session.mode !== 'ai' || expectedGame.result || expectedGame.turn === session.playerSide || session.viewIndex !== session.records.length) {
      setThinking(false)
      return
    }
    const id = ++requestSequence
    let cancelled = false
    let settled = false
    let worker: Worker | null = null
    let timeout: number | undefined
    setThinking(true)
    const applyComputer = (candidate: Move | null) => {
      const current = latest.current
      const live = current.session
      if (cancelled || settled || live.game !== expectedGame || current.difficulty !== difficulty || live.mode !== 'ai' || live.playerSide !== session.playerSide || live.viewIndex !== live.records.length) return
      settled = true
      worker?.terminate()
      window.clearTimeout(timeout)
      const moves = legalMoves(live.game.board, live.game.turn)
      // Only accept a member of the freshly generated legal set, including malformed replies.
      let accepted = moves.find(move => candidate?.from?.x === move.from.x && candidate?.from?.y === move.from.y && candidate?.to?.x === move.to.x && candidate?.to?.y === move.to.y) ?? null
      const fallback = !accepted
      if (fallback) {
        try { accepted = chooseFallbackMove(live.game, moves) } catch { accepted = moves[0] ?? null }
      }
      if (accepted) {
        const result = play(live, accepted)
        if (result.ok) {
          current.onChange(result.session)
          const detail = result.session.game.repetitionWarning ? '局面再次重复；复杂循环需按棋例判断。' : result.session.records.at(-1)!.notation
          current.onNotice(fallback ? `电脑本次采用基础策略：${detail}` : detail)
        }
      }
      setThinking(false)
    }
    timeout = window.setTimeout(() => applyComputer(null), difficultyProfiles[difficulty].timeoutMs)
    try {
      worker = new Worker(new URL('../ai/worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = event => {
        // Workers created here always echo id. Accept older adapters without an id as well.
        if (event.data?.id !== undefined && event.data.id !== id) return
        applyComputer(event.data?.move ?? null)
      }
      worker.onerror = () => applyComputer(null)
      worker.postMessage({ id, game: expectedGame, difficulty })
    } catch { applyComputer(null) }
    return () => { cancelled = true; worker?.terminate(); window.clearTimeout(timeout) }
  }, [session.game, session.mode, session.playerSide, session.viewIndex, session.records.length, difficulty])

  return thinking
}
