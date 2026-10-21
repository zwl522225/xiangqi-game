import type { Board, PieceType, Side } from '../core/types'
import type { TacticTopic } from '../core/tactics-goals'

export type Tactic = {
  id: string
  version: 1
  topic: TacticTopic
  side: Side
  board: Board
  maxOwnMoves: 2 | 3
  title: string
  prompt: string
  objective: string
  hints: [string, string]
  explanation: string
}

export function tacticBoard(pieces: [Side, PieceType, number, number][]): Board {
  const board: Board = Array.from({ length: 10 }, () => Array(9).fill(null))
  for (const [side, type, x, y] of pieces) board[y][x] = { side, type }
  return board
}

const entries: { id: string; side: Side; topic: TacticTopic; pieces: Parameters<typeof tacticBoard>[0]; hints: [string, string]; explanation: string }[] = [
  { id: 'checks-red', side: 'red', topic: 'checks', pieces: [['red','general',4,9],['black','general',4,0],['red','soldier',4,5],['red','rook',0,2],['red','rook',1,2]],
    hints: ['观察两辆车能控制哪些横线。每一步都必须真实将军。', '两辆车可以轮流封锁横线；留意对方将被迫移动后的实际位置。'], explanation: '两车配合限制将的活动范围。在实际应手后继续检查封锁线，三步内形成真实将死。' },
  { id: 'checks-black', side: 'black', topic: 'checks', pieces: [['black','general',3,0],['red','general',4,9],['black','rook',0,3],['black','horse',4,5]],
    hints: ['观察车的直线与马的控制点怎样配合。', '先找真实将军的着法，再根据帅的应手检查马腿和宫内退路。'], explanation: '车与马协同控制宫内退路；每次将军和最终将死都按实际局面判断。' },
  { id: 'gain-red', side: 'red', topic: 'gain', pieces: [['red','general',4,9],['black','general',4,0],['red','horse',2,4],['black','rook',5,3],['red','soldier',4,5]],
    hints: ['目标是黑车。观察马能否同时威胁将与车。', '用将军争取下一步吃车的机会，并检查对方应将后能否吃回。'], explanation: '马借将军形成双重威胁。本题只保证走完两步及最后一次防守后的净吃子记分至少为四。' },
  { id: 'gain-black', side: 'black', topic: 'gain', pieces: [['black','general',3,0],['red','general',4,9],['black','rook',5,5],['black','horse',7,8],['red','horse',3,9]],
    hints: ['目标是红马。观察红帅和红马所在的同一横线。', '先考虑车将军迫使帅离开横线；黑马能保护车的落点，随后仍须检查吃回。'], explanation: '车借将军打开通向红马的横线，马保护关键落点。最后一次合法防守也计入本题净吃子记分。' },
  { id: 'counter-red', side: 'red', topic: 'counter', pieces: [['red','general',4,9],['black','general',3,0],['black','rook',4,5],['red','rook',0,5]],
    hints: ['红帅正在被将军，先找能真正解除攻击的着法。', '观察红车能否处理正在将军的黑车；再按黑将的实际位置寻找安全反将。'], explanation: '先解除车的将军，再依据对方应手反将。走完最后一次应将后，不负、不和且本题净吃子记分不低于零才完成。' },
  { id: 'counter-black', side: 'black', topic: 'counter', pieces: [['black','general',4,0],['red','general',5,9],['red','horse',3,2],['black','cannon',3,5],['black','soldier',3,4],['black','rook',0,8],['red','soldier',7,6]],
    hints: ['黑将正在被马将军。观察炮与炮架能否解除将军。', '先处理将军的红马；对方走后，再观察黑车怎样从横线反将并避免损失。'], explanation: '炮借炮架解除马的将军，车按实际分支寻找反将。本题目标截至最后一次应将，不推断以后的胜负。' },
]
const titles = { checks: '连续将军', gain: '吃子获利', counter: '解将反击' }
const objectives = {
  checks: '己方每步都将军，并在三步以内将死。',
  gain: '走两步，并计入对方最后一次合法应手，本题净吃子记分至少增加四分。',
  counter: '先合法解将，第二步真实反将；对方应将后未负、未和，本题净吃子记分不低于零。',
}
export const tactics: Tactic[] = entries.map(({ pieces, ...entry }) => ({ ...entry, version: 1, board: tacticBoard(pieces),
  maxOwnMoves: entry.topic === 'checks' ? 3 : 2, title: `${titles[entry.topic]} · 执${entry.side === 'red' ? '红' : '黑'}`,
  objective: objectives[entry.topic], prompt: `${objectives[entry.topic]}这是独立教学设置局面。` }))
