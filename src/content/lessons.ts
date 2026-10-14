import type { Board, Move, Side } from '../core/types'
import { createInitialBoard } from '../core/board'
import { captureBoard, defendBoard, mateBoard, stalemateBoard } from './positions'

export type Lesson = {
  id: string; title: string; summary: string; prompt: string; board: Board; turn: Side
  target: Move; explanation: string
  bonus?: { board: Board; turn: Side; prompt: string; target: Move; explanation: string }
}

export const lessons: Lesson[] = [
  {
    id: 'board', title: '01 · 棋盘与先后手', summary: '棋子落在交叉点，红方先走。',
    prompt: '点选左边的红兵，再向前走一格。', board: createInitialBoard(), turn: 'red',
    target: { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } },
    explanation: '红方从棋盘下方向上进兵。双方每次各走一着，轮流行棋。',
  },
  {
    id: 'major-pieces', title: '02 · 车马炮', summary: '车走直线，马有马腿，炮吃子要隔一子。',
    prompt: '先试一手“炮二平五”：把右炮平到中路。', board: createInitialBoard(), turn: 'red',
    target: { from: { x: 7, y: 7 }, to: { x: 4, y: 7 } },
    explanation: '炮平走时像车一样不能越子；以后吃子时要恰好隔着一个炮架。',
  },
  {
    id: 'palace-river', title: '03 · 九宫与河界', summary: '将帅和士守九宫，相象不过河，兵卒过河后可横走。',
    prompt: '让右相斜走两格，守住中路。', board: createInitialBoard(), turn: 'red',
    target: { from: { x: 6, y: 9 }, to: { x: 4, y: 7 } },
    explanation: '相走田字，田字中心不能有子，也不能跨过楚河汉界。',
  },
  {
    id: 'capture', title: '04 · 吃子与保护', summary: '走到对方棋子所在的点，就能吃掉它。',
    prompt: '用红车吃掉同一路上的黑车。', board: captureBoard, turn: 'red',
    target: { from: { x: 4, y: 5 }, to: { x: 4, y: 3 } },
    explanation: '车沿直线吃子，途中不可越过别的棋子。吃子后要留意自己的将帅是否安全。',
  },
  {
    id: 'check', title: '05 · 将军与应将', summary: '将帅受到攻击时，下一着必须化解。',
    prompt: '黑车正在将军。用红车横走到将前挡住。', board: defendBoard, turn: 'red',
    target: { from: { x: 0, y: 8 }, to: { x: 4, y: 8 } },
    explanation: '应将可以移将、吃掉攻击子或在攻击线上垫子；这一手选择垫车。',
  },
  {
    id: 'finish', title: '06 · 将死与困毙', summary: '没有合法应将是将死；未被将却无子可走是困毙。',
    prompt: '把红车向前走一格，将死黑将。', board: mateBoard, turn: 'red',
    target: { from: { x: 4, y: 2 }, to: { x: 4, y: 1 } },
    explanation: '黑将被将军，也没有合法的解将办法，所以黑方负。',
    bonus: {
      board: stalemateBoard, turn: 'red', prompt: '再把左红车向前走一格，形成困毙。',
      target: { from: { x: 3, y: 2 }, to: { x: 3, y: 1 } },
      explanation: '此时黑将没有受到攻击，却无处可走，同样判黑方负。',
    },
  },
  {
    id: 'notation', title: '07 · 看懂棋谱', summary: '棋谱用棋子、纵线、进退平和距离记录每一步。',
    prompt: '让左车向前走一格，读一读新产生的记谱。', board: createInitialBoard(), turn: 'red',
    target: { from: { x: 0, y: 9 }, to: { x: 0, y: 8 } },
    explanation: '这一着记为“车九进一”：红方左车在九路向前走一格。',
  },
  {
    id: 'opening', title: '08 · 开局第一步', summary: '先发展棋子、兼顾中路，不急着孤军深入。',
    prompt: '向前走一格，试试“仙人指路”的第一步。', board: createInitialBoard(), turn: 'red',
    target: { from: { x: 6, y: 6 }, to: { x: 6, y: 5 } },
    explanation: '挺起靠右的兵，给马和相留出活动空间；下一步要看对手如何回应。',
  },
]
