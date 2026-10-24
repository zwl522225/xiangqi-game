import { useState } from 'react'
import { EndgameLessons } from './EndgameLessons'
import { Learn } from './Learn'
import type { EndgameLessonsController } from './useEndgameLessons'

/** The App owns persistent learning state; this page owns only its selected mode. */
export function EndgameWorkspace({ controller, completed, onComplete, onTerm }: {
  controller: EndgameLessonsController; completed: string[]; onComplete: (id: string) => void; onTerm: (id: string) => void
}) {
  const [mode, setMode] = useState<'teaching' | 'single'>('teaching')
  return <>
    <div className="learning-actions practice-modes" aria-label="残局练习模式">
      <button type="button" aria-pressed={mode === 'teaching'} onClick={() => setMode('teaching')}>分步教学</button>
      <button type="button" aria-pressed={mode === 'single'} onClick={() => setMode('single')}>基础单步题</button>
    </div>
    {mode === 'teaching' ? <EndgameLessons controller={controller} /> : <Learn kind="puzzle" completed={completed} onComplete={onComplete} onTerm={onTerm} />}
  </>
}
