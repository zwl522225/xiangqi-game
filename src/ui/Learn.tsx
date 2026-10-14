import { useMemo, useState } from 'react'
import { legalMoves, tryMove, createGame } from '../core/rules'
import type { Game } from '../core/rules'
import { samePosition } from '../core/types'
import type { Position } from '../core/types'
import { formatMove } from '../core/notation'
import { lessons } from '../content/lessons'
import { puzzles } from '../content/puzzles'
import { Board, pieceName } from './Board'

type Props = { kind: 'lesson' | 'puzzle'; completed: string[]; onComplete: (id: string) => void; onTerm: (id: string) => void; onPracticeAi?: () => void }
const lessonTerms = ['intersection', 'cannon-screen', 'palace', 'exchange', 'respond', 'checkmate', 'notation', 'immortal-points']

export function Learn({ kind, completed, onComplete, onTerm, onPracticeAi }: Props) {
  const items = kind === 'lesson' ? lessons : puzzles
  const [index, setIndex] = useState(0)
  const [stage, setStage] = useState(0)
  const [game, setGame] = useState<Game>(() => createGame(items[0].board, items[0].turn))
  const [selected, setSelected] = useState<Position | null>(null)
  const [answered, setAnswered] = useState(false)
  const [demoActive, setDemoActive] = useState(false)
  const [hint, setHint] = useState(false)
  const [notice, setNotice] = useState('点选棋子，再走到目标点。')
  const item = items[index]
  const bonus = kind === 'lesson' && stage === 1 ? lessons[index].bonus : undefined
  const task = bonus ?? item
  const legal = useMemo(() => legalMoves(game.board, game.turn), [game.board, game.turn])
  const targets = selected ? legal.filter(move => samePosition(move.from, selected)).map(move => move.to) : []

  function reset(targetIndex = index, targetStage = stage) {
    const nextItem = items[targetIndex]
    const nextBonus = kind === 'lesson' && targetStage === 1 ? lessons[targetIndex].bonus : undefined
    setGame(createGame((nextBonus ?? nextItem).board, (nextBonus ?? nextItem).turn))
    setIndex(targetIndex)
    setStage(targetStage)
    setSelected(null)
    setAnswered(false)
    setDemoActive(false)
    setHint(false)
    setNotice('点选棋子，再走到目标点。')
  }

  function handleCell(position: Position) {
    if (demoActive) { setNotice('先点击“现在自己走”，再试一次。'); return }
    if (answered) return
    const piece = game.board[position.y][position.x]
    if (selected) {
      if (samePosition(selected, position)) { setSelected(null); return }
      const attempted = { from: selected, to: position }
      const result = tryMove(game, attempted)
      if (result.ok) {
        if (samePosition(task.target.from, selected) && samePosition(task.target.to, position)) {
          setGame(result.game)
          setAnswered(true)
          setSelected(null)
          const fullyDone = !('bonus' in item && item.bonus && stage === 0)
          if (fullyDone) onComplete(item.id)
          setNotice(fullyDone ? kind === 'lesson' ? '完成本节！' : '练习完成！' : '第一步正确，接着看看困毙。')
        } else {
          setNotice('这步符合规则，但本题还有更合适的目标。请再试一次。')
        }
        return
      }
      setNotice(result.error)
    }
    if (piece?.side === game.turn) {
      setSelected(position)
      setNotice('已标出合法落点。')
    }
  }

  function toggleDemo() {
    if (demoActive) {
      setGame(createGame(task.board, task.turn))
      setDemoActive(false)
      setSelected(null)
      setNotice('现在轮到你复现刚才的着法。')
      return
    }
    const result = tryMove(createGame(task.board, task.turn), task.target)
    if (!result.ok) { setNotice('暂时无法演示这一步，请重试。'); return }
    setGame(result.game)
    setDemoActive(true)
    setSelected(null)
    setNotice('演示完成。点击“现在自己走”，回到原局面。')
  }

  const isLesson = kind === 'lesson'
  return <div className="learning-layout">
    <section className="learning-main">
      <div className="learning-intro"><p className="eyebrow">{isLesson ? `第 ${index + 1} / 8 节` : `第 ${index + 1} / 6 题`}</p><h2>{item.title}</h2><p>{'summary' in item ? item.summary : item.prompt}</p></div>
      <div className="lesson-prompt"><strong>{task.prompt}</strong><span role="status">{notice}</span></div>
      <Board board={game.board} selected={selected} legalTargets={targets} lastMove={demoActive || answered ? task.target : null} onCell={handleCell} onCancel={() => setSelected(null)} />
      {demoActive ? <div className="feedback demo"><strong>示范：{formatMove(task.board, task.target)}</strong><p>{pieceName(task.board[task.target.from.y][task.target.from.x]!)}从 {task.target.from.x},{task.target.from.y} 走到 {task.target.to.x},{task.target.to.y}。{task.explanation}</p></div> : null}
      {answered ? <div className="feedback success"><strong>{isLesson && 'bonus' in item && item.bonus && stage === 0 ? '第一步正确' : isLesson ? '完成本节' : '练习完成'}</strong><p>{task.explanation}</p></div> : null}
      <div className="learning-actions">
        {isLesson && !answered ? <button type="button" onClick={toggleDemo}>{demoActive ? '现在自己走' : '演示这一步'}</button> : null}
        <button type="button" onClick={() => setHint(!hint)}>{hint ? '收起提示' : '提示'}</button>
        <button type="button" onClick={() => reset()}>重试</button>
        <button type="button" onClick={() => onTerm(isLesson ? lessonTerms[index] : 'endgame')}>查看相关术语</button>
        {answered ? <button type="button" className="primary-action" onClick={() => {
          if (isLesson && 'bonus' in item && item.bonus && stage === 0) reset(index, 1)
          else if (isLesson && index === items.length - 1) onPracticeAi?.()
          else reset(Math.min(items.length - 1, index + 1), 0)
        }}>{isLesson && 'bonus' in item && item.bonus && stage === 0 ? '继续：困毙练习' : isLesson && index === items.length - 1 ? '执红对电脑练习' : index < items.length - 1 ? isLesson ? '下一节' : '下一题' : '再练一次'}</button> : null}
      </div>
      {hint ? <p className="hint-box">{isLesson ? task.prompt : 'hint' in item ? item.hint : task.prompt}</p> : null}
    </section>
    <aside className="learning-side panel">
      <p className="eyebrow">{isLesson ? '学习路线' : '残局题册'}</p><h3>{isLesson ? '一步一步来' : '短局面，练眼力'}</h3>
      <div className="lesson-list">
        {items.map((option, optionIndex) => <button key={option.id} type="button" className={optionIndex === index ? 'active' : ''} onClick={() => reset(optionIndex, 0)}><span>{option.title}</span><small>{completed.includes(option.id) ? '已完成' : '未完成'}</small></button>)}
      </div>
      <p className="muted">走错不会改变局面，可以反复尝试。也可以直接选择任何一节。</p>
    </aside>
  </div>
}
