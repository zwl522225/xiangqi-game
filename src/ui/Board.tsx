import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { samePosition } from '../core/types'
import type { Board as BoardState, Move, Piece, Position, Side } from '../core/types'
import { BoardAnnotations } from './BoardAnnotations'
import type { Annotation } from '../core/annotations'
import { useBoardDisplay } from './BoardDisplayContext'

const redNames = { general: '帅', advisor: '仕', elephant: '相', horse: '马', rook: '车', cannon: '炮', soldier: '兵' }
const blackNames = { general: '将', advisor: '士', elephant: '象', horse: '马', rook: '车', cannon: '炮', soldier: '卒' }
export const pieceName = (piece: Piece) => `${piece.side === 'red' ? '红' : '黑'}${piece.side === 'red' ? redNames[piece.type] : blackNames[piece.type]}`

type Props = {
  board: BoardState
  selected?: Position | null
  legalTargets?: Position[]
  lastMove?: Move | null
  onCell?: (position: Position) => void
  onCancel?: () => void
  compact?: boolean
  checkedSide?: Side | null
  annotations?: Annotation[]
  annotationPending?: Position | null
  orientation?: Side
}

export function Board({ board, selected = null, legalTargets = [], lastMove = null, onCell, onCancel, compact = false, checkedSide = null, orientation = 'red', annotations = [], annotationPending = null }: Props) {
  const { boardTheme, showCoordinates } = useBoardDisplay()
  const [focusedPosition, setCursor] = useState<Position | null>(null)
  const cursor = focusedPosition ?? { x: 4, y: orientation === 'black' ? 0 : 9 }
  const refs = useRef<(HTMLButtonElement | null)[][]>(Array.from({ length: 10 }, () => Array(9).fill(null)))
  const project = ({ x, y }: Position) => orientation === 'black' ? { x: 8 - x, y: 9 - y } : { x, y }
  const horizontal = (x: number) => `${5 + x * 11.25}%`
  const vertical = (y: number) => `${(40 + y * 90) / 9}%`

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, position: Position) {
    const delta: Record<string, [number, number]> = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel?.()
      return
    }
    if (!delta[event.key]) return
    event.preventDefault()
    const [dx, dy] = delta[event.key]
    const direction = orientation === 'black' ? -1 : 1
    const next = { x: Math.max(0, Math.min(8, position.x + dx * direction)), y: Math.max(0, Math.min(9, position.y + dy * direction)) }
    setCursor(next)
    refs.current[next.y][next.x]?.focus()
  }

  return (
    <div className={`board-frame${compact ? ' board-frame--compact' : ''}${boardTheme === 'clear' ? ' board-frame--clear' : ''}${showCoordinates ? ' board-frame--coordinates' : ''}`}>
      <div className="xiangqi-board" role="group" aria-label="象棋棋盘">
        {showCoordinates ? <div className="board-coordinates" aria-hidden="true">
          {(['top', 'bottom'] as const).flatMap(edge => Array.from({ length: 9 }, (_, x) => <span
            key={`${edge}-${x}`} className={`board-coordinate board-coordinate--${edge}`}
            data-coordinate-axis="x" data-coordinate-edge={edge} data-coordinate-value={x}
            style={{ left: horizontal(project({ x, y: 0 }).x) }}
          >{x}</span>))}
          {(['left', 'right'] as const).flatMap(edge => Array.from({ length: 10 }, (_, y) => <span
            key={`${edge}-${y}`} className={`board-coordinate board-coordinate--${edge}`}
            data-coordinate-axis="y" data-coordinate-edge={edge} data-coordinate-value={y}
            style={{ top: vertical(project({ x: 0, y }).y) }}
          >{y}</span>))}
        </div> : null}
        <svg className="board-lines" viewBox="0 0 800 900" aria-hidden="true" preserveAspectRatio="none">
          <rect x="24" y="24" width="752" height="852" fill="none" stroke="currentColor" strokeWidth="3" />
          {Array.from({ length: 10 }, (_, y) => <line key={`h${y}`} x1="40" y1={40 + y * 90} x2="760" y2={40 + y * 90} />)}
          {Array.from({ length: 9 }, (_, x) => <g key={`v${x}`}>
            <line x1={40 + x * 90} y1="40" x2={40 + x * 90} y2="400" />
            <line x1={40 + x * 90} y1="490" x2={40 + x * 90} y2="850" />
          </g>)}
          <line x1="40" y1="400" x2="40" y2="490" />
          <line x1="760" y1="400" x2="760" y2="490" />
          <line x1="310" y1="40" x2="490" y2="220" />
          <line x1="490" y1="40" x2="310" y2="220" />
          <line x1="310" y1="670" x2="490" y2="850" />
          <line x1="490" y1="670" x2="310" y2="850" />
          <text x="210" y="467">楚 河</text><text x="590" y="467">汉 界</text>
        </svg>
        {annotations.length || annotationPending ? <BoardAnnotations items={annotations} pending={annotationPending} orientation={orientation} /> : null}
        {board.flatMap((row, y) => row.map((piece, x) => {
          const position = { x, y }
          const displayed = project(position)
          const active = selected && samePosition(selected, position)
          const legal = legalTargets.some(target => samePosition(target, position))
          const recent = lastMove && (samePosition(lastMove.from, position) || samePosition(lastMove.to, position))
          const checked = piece?.type === 'general' && piece.side === checkedSide
          const annotationLabel = annotations.filter(item => item.kind === 'circle' ? samePosition(item.at, position) : samePosition(item.from, position) || samePosition(item.to, position)).map(item => item.kind === 'circle' ? '重点格' : `箭头 (${item.from.x},${item.from.y}) 到 (${item.to.x},${item.to.y})`).join('，')
          const label = `${piece ? `${pieceName(piece)}，坐标 ${x},${y}` : `交叉点 ${x},${y}`}${active ? '，已选中' : ''}${legal ? '，可走落点' : ''}${recent ? '，上一步' : ''}${checked ? '，正在被将军' : ''}`
          return <button
            key={`${x}-${y}`}
            ref={element => { refs.current[y][x] = element }}
            type="button"
            className={`board-point${active ? ' is-selected' : ''}${legal ? ' is-legal' : ''}${recent ? ' is-recent' : ''}${checked ? ' is-check' : ''}`}
            style={{ left: horizontal(displayed.x), top: vertical(displayed.y) }}
            aria-label={`${label}${annotationLabel ? `，${annotationLabel}` : ''}${annotationPending && samePosition(annotationPending, position) ? '，箭头待选起点' : ''}`}
            aria-pressed={Boolean(active)}
            tabIndex={samePosition(cursor, position) ? 0 : -1}
            onFocus={() => { if (!samePosition(cursor, position)) setCursor(position) }}
            onClick={() => { setCursor(position); onCell?.(position) }}
            onKeyDown={event => handleKey(event, position)}
          >
            {piece ? <span className={`piece piece--${piece.side}`}>{piece.side === 'red' ? redNames[piece.type] : blackNames[piece.type]}</span> : legal ? <span className="legal-ring" /> : null}
            {checked ? <span className="check-marker" aria-hidden="true">将</span> : null}
          </button>
        }))}
      </div>
    </div>
  )
}
