import type { Board, Move, Side } from '../core/types'
import { cannonBoard, captureBoard, defendBoard, mateBoard, stalemateBoard, position } from './positions'
export type Puzzle = { id: string; title: string; prompt: string; hint: string; board: Board; turn: Side; target: Move; explanation: string }
const m = (fx: number, fy: number, tx: number, ty: number): Move => ({ from: { x: fx, y: fy }, to: { x: tx, y: ty } })
export const puzzles: Puzzle[] = [
  { id: 'win-rook', title: '直线得子', prompt: '红先，用车吃掉黑车。', hint: '沿同一纵线向前看。', board: captureBoard, turn: 'red', target: m(4, 5, 4, 3), explanation: '车不能越子，这条线上没有阻挡，可以直接吃车。' },
  { id: 'block-check', title: '垫车应将', prompt: '红先，用车挡住黑车的将军。', hint: '把车移到将帅前面。', board: defendBoard, turn: 'red', target: m(0, 8, 4, 8), explanation: '垫子切断攻击线，是常见的应将方法。' },
  { id: 'mate', title: '一步将死', prompt: '红先，让黑将无路可走。', hint: '红车向前靠近黑将。', board: mateBoard, turn: 'red', target: m(4, 2, 4, 1), explanation: '黑方既被将军，又没有合法应将，红方获胜。' },
  { id: 'stalemate', title: '一步困毙', prompt: '红先，让黑将无子可走。', hint: '左车向前一格，守住左侧。', board: stalemateBoard, turn: 'red', target: m(3, 2, 3, 1), explanation: '黑将没有被将军，却没有合法着法，仍然判负。' },
  { id: 'king-escape', title: '移帅解围', prompt: '红先，移动帅避开黑车攻击。', hint: '帅只能在九宫内走一格。', board: position([4, 9, 'red', 'general'], [3, 0, 'black', 'general'], [4, 5, 'black', 'rook']), turn: 'red', target: m(4, 9, 5, 9), explanation: '帅横走一格离开黑车所在的纵线，成功应将。' },
  { id: 'cannon-screen', title: '炮打隔子', prompt: '红先，用炮吃黑车。', hint: '中间正好有一个炮架。', board: cannonBoard, turn: 'red', target: m(1, 5, 5, 5), explanation: '炮吃子必须恰好隔一子；中间的黑卒正好是炮架。' },
]
