import type { Board } from '../core/types'
import { createInitialBoard } from '../core/board'
import { cannonBoard, captureBoard, defendBoard, mateBoard, stalemateBoard, position } from './positions'
export type GlossaryEntry = { id: string; term: string; category: '基础' | '战术' | '开局' | '残局'; definition: string; example: { board: Board; caption: string } }

const start = createInitialBoard()
const face = position([4, 9, 'red', 'general'], [4, 0, 'black', 'general'])
const blockedHorse = position([4, 9, 'red', 'general'], [3, 0, 'black', 'general'], [4, 5, 'red', 'horse'], [4, 4, 'red', 'soldier'])
const blockedElephant = position([4, 9, 'red', 'general'], [3, 0, 'black', 'general'], [4, 7, 'red', 'elephant'], [3, 6, 'red', 'soldier'])
const g = (id: string, term: string, category: GlossaryEntry['category'], definition: string, board: Board, caption: string): GlossaryEntry => (
  { id, term, category, definition, example: { board, caption } }
)

export const glossary: GlossaryEntry[] = [
  g('intersection', '交叉点', '基础', '象棋子摆在横线与竖线的交点上，不放在方格中央。', start, '开局的棋子都站在线的交点上。'),
  g('river', '楚河汉界', '基础', '棋盘中间没有竖线连接的一带叫河界；相、象不能跨过它。', start, '中间空出的一带就是河界。'),
  g('palace', '九宫', '基础', '双方底线中央各有一个 3×3 的活动区域，帅将和仕士都受它限制。', start, '底线中央有斜线的区域是九宫。'),
  g('red-first', '红先', '基础', '标准对局由红方先走，随后双方轮流各走一着。', start, '开局先选一枚红子落第一着。'),
  g('check', '将军', '基础', '一方走子后，下一着有机会吃到对方将帅，就称为将军。', defendBoard, '黑车沿中路攻击红帅，红方必须处理。'),
  g('respond', '应将', '基础', '将帅被攻击的一方，下一着必须让将帅脱离危险。', defendBoard, '红车平到帅前，挡住黑车的攻击线。'),
  g('checkmate', '将死', '基础', '一方被将军，却找不到任何合法的应将着法，就被将死而判负。', mateBoard, '红车进到黑将前，形成将死。'),
  g('stalemate', '困毙', '基础', '轮到一方走棋时，虽未被将军，却没有任何合法着法，也判该方负。', stalemateBoard, '红车进到左侧后，黑将无路可走。'),
  g('facing', '将帅照面', '基础', '将和帅不能在同一纵线上直接相见；两者之间必须有棋子隔开。', face, '图中将帅直接相见，是不允许出现的局面。'),
  g('horse-leg', '蹩马腿', '基础', '马走日字，先走的一格若有棋子占据，该方向的两步都不能走。', blockedHorse, '红马前面被红兵挡住，不能向前跳。'),
  g('elephant-eye', '塞象眼', '基础', '相象走田字；田字中心若有子，就不能沿那个方向走。', blockedElephant, '红相左前方的象眼被红兵占住。'),
  g('cannon-screen', '炮架', '基础', '炮吃子时，炮与目标之间必须恰有一枚棋子，称为炮架。', cannonBoard, '黑卒位于红炮与黑车之间，形成炮架。'),
  g('crossed-soldier', '过河兵', '基础', '兵卒过河后，除了继续前进，也能向左右各走一格，始终不能后退。', start, '河界另一侧的兵卒会增加横向走法。'),
  g('notation', '棋谱', '基础', '按顺序记录每一着的棋子、起始纵线和走法，就组成棋谱。', start, '“炮二平五”表示红方二路炮平到五路。'),
  g('initiative', '先手', '战术', '走出带威胁的着法，使对手需要优先回应，称为取得先手。', defendBoard, '黑车将军时，红方必须先应将。'),
  g('passive', '后手', '战术', '需要先处理对方威胁、暂时不能按原计划走棋的处境，常称后手。', defendBoard, '红方此刻要先防守，再安排自己的进攻。'),
  g('threaten', '捉子', '战术', '走子后威胁在下一着吃掉对方棋子，是一种获得子力的手段。', captureBoard, '红车沿中路直接盯住黑车。'),
  g('exchange', '兑子', '战术', '双方有意识地互换同类或价值相近的棋子，用来简化局面。', captureBoard, '两车在同一路上可能产生交换。'),
  g('sacrifice', '弃子', '战术', '主动让出一枚棋子，以换取更大的进攻、位置或将杀机会。', mateBoard, '判断弃子时，要先看后续是否真的有将杀。'),
  g('pin', '牵制', '战术', '利用后方重要棋子作目标，让前方防守子不敢随意离线。', captureBoard, '红车沿纵线施压，移动挡子前要看后方安全。'),
  g('discovered', '闪击', '战术', '移开一枚挡路的己方棋子，让后方车、炮等突然发动攻击。', mateBoard, '沿线棋子的位置变化可能打开新的攻击线。'),
  g('fork', '双重攻击', '战术', '一着棋同时威胁两个目标，让对方难以同时保护。', cannonBoard, '看炮路时，也要检查另一侧有没有同时受攻的子。'),
  g('defended', '有根子', '战术', '己方棋子被吃后，通常能由另一枚己子反吃回来的棋子，叫有根子。', mateBoard, '红车互相照应时，比孤立的车更安全。'),
  g('central-cannon', '中炮', '开局', '把炮平到中央纵线，尽早对中路施加压力的开局走法。', start, '可在棋路馆逐着看“炮二平五”。'),
  g('screen-horses', '屏风马', '开局', '双马朝中路发展，形成稳固阵形，常用来应对中炮。', start, '棋路馆中的黑方两马依次出动。'),
  g('flying-elephant', '飞相局', '开局', '先走相巩固中路，再选择后续出子方向的开局。', start, '右相可从底线飞到中路的相位。'),
  g('immortal-points', '仙人指路', '开局', '先挺三路兵，保留炮、马等主力棋子的后续选择。', start, '红方右侧的兵先向前走一格。'),
  g('endgame', '残局', '残局', '经过中局交换后棋子较少的阶段，常要精确计算将帅的活动格。', stalemateBoard, '棋子虽少，一步仍可能决定胜负。'),
  g('natural-limit', '自然限着', '残局', '连续 60 回合双方都没有吃子，按竞赛规则可形成和棋。', stalemateBoard, '残局久无吃子时要留意自然限着。'),
  g('draw', '和棋', '残局', '双方没有分出胜负，或满足规则规定的和棋条件，结果为和棋。', stalemateBoard, '提和需对方同意；困毙不是和棋。'),
  g('perpetual-check', '长将', '残局', '连续照将并形成循环的着法；竞赛棋例需要按具体局面裁决。', defendBoard, '循环将军不可简单按三次重复自动判和。'),
]
