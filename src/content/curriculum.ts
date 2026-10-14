import { createInitialBoard } from '../core/board'
import { coordinateMove, formatMove } from '../core/notation'
import { moveBoard } from '../core/rules'
import type { Board, Move, PieceType, Position, Side } from '../core/types'
import { cannonBoard, captureBoard, defendBoard, position } from './positions'

export type MoveGoal =
  | { kind: 'destination'; to: Position; piece?: PieceType; from?: Position }
  | { kind: 'piece-move'; piece: PieceType }
  | { kind: 'capture'; by: PieceType; target: PieceType; at: Position }
  | { kind: 'resolve-check' | 'checkmate' | 'stalemate'; piece?: PieceType; from?: Position; direction?: 'horizontal' | 'vertical' }
  | { kind: 'give-check'; piece?: PieceType; direction?: 'horizontal' | 'vertical' }
  | { kind: 'notation'; value: string }
  | { kind: 'one-of'; goals: MoveGoal[] }

type TaskBase = {
  id: string
  board: Board
  turn: Side
  prompt: string
  hints: [string, string, string]
  successExplanation: string
  notGoalExplanation: string
}

export type MoveTask = TaskBase & {
  kind: 'move'
  goal: MoveGoal
  solutions: Move[]
  blockedAttempt?: Move
  noCapturePlies?: number
}

export type ChoiceTask = TaskBase & {
  kind: 'choice'
  situation: 'stalemate' | 'agreement' | 'natural-limit' | 'opening-purpose'
  options: { id: string; label: string }[]
  correctOptionId: string
  noCapturePlies?: number
}

export type LessonTask = MoveTask | ChoiceTask
export type LessonUnit = {
  id: string
  title: string
  summary: string
  demo: LessonTask
  practice: LessonTask
  variants: LessonTask[]
  relatedExamples?: { id: string; title: string; board: Board; turn: Side; move: Move; explanation: string }[]
}
export type LessonChapter = { id: string; title: string; summary: string; units: LessonUnit[] }

type MoveScene = Pick<MoveTask, 'board' | 'turn' | 'prompt' | 'goal' | 'solutions' | 'successExplanation'> &
  Partial<Pick<MoveTask, 'blockedAttempt' | 'noCapturePlies'>>
type ChoiceScene = Pick<ChoiceTask, 'board' | 'turn' | 'prompt' | 'situation' | 'options' | 'correctOptionId' | 'successExplanation'> &
  Partial<Pick<ChoiceTask, 'noCapturePlies'>>

function moveUnit(id: string, title: string, summary: string, observe: string, focus: string, notGoal: string, demo: MoveScene, variants: MoveScene[]): LessonUnit {
  const task = (scene: MoveScene, suffix: string): MoveTask => ({
    ...scene, id: `${id}-${suffix}`, kind: 'move', notGoalExplanation: notGoal,
    hints: [observe, focus, `示范着法：${formatMove(scene.board, scene.solutions[0])}，${coordinateMove(scene.solutions[0])}。`],
  })
  return { id, title, summary, demo: task(demo, 'demo'), practice: task(demo, 'practice'), variants: variants.map((scene, index) => task(scene, `variant-${index + 1}`)) }
}

function choiceUnit(id: string, title: string, summary: string, observe: string, focus: string, notGoal: string, demo: ChoiceScene, variants: ChoiceScene[]): LessonUnit {
  const task = (scene: ChoiceScene, suffix: string): ChoiceTask => ({
    ...scene, id: `${id}-${suffix}`, kind: 'choice', notGoalExplanation: notGoal,
    hints: [observe, focus, `答案：${scene.options.find(option => option.id === scene.correctOptionId)?.label}。`],
  })
  return { id, title, summary, demo: task(demo, 'demo'), practice: task(demo, 'practice'), variants: variants.map((scene, index) => task(scene, `variant-${index + 1}`)) }
}

const mv = (fx: number, fy: number, tx: number, ty: number): Move => ({ from: { x: fx, y: fy }, to: { x: tx, y: ty } })
const dest = (x: number, y: number, piece: PieceType, from?: Position): MoveGoal => ({ kind: 'destination', to: { x, y }, piece, from })
const basic = (...extra: Parameters<typeof position>): Board => position(
  [4, 9, 'red', 'general'], [3, 0, 'black', 'general'], ...extra,
)
const initial = createInitialBoard()
const blackOpening = moveBoard(initial, mv(2, 6, 2, 5))
const blackNotation = moveBoard(initial, mv(8, 6, 8, 5))
const redOpening = moveBoard(moveBoard(initial, mv(6, 6, 6, 5)), mv(4, 3, 4, 4))
const drawOptions = [
  { id: 'stalemate-loss', label: '困毙：无合法着法的一方负' },
  { id: 'agreement-draw', label: '双方同意和棋' },
  { id: 'natural-draw', label: '长期无吃子达到自然限着，和棋' },
]
const openingOptions = [
  { id: 'develop-horse', label: '发展马，增加可用着法' },
  { id: 'control-centre', label: '控制中路' },
  { id: 'immediate-mate', label: '这一着已经将死对方' },
]

export const curriculum: LessonChapter[] = [
  {
    id: 'board', title: '01 · 棋盘与先后手', summary: '棋子在交叉点上，红黑轮流行棋。', units: [
      moveUnit('turns', '交叉点与轮流行棋', '看清轮到哪一方，沿自己的前进方向走兵卒。',
        '先看棋子落在哪个交叉点，再确认行棋方。', '红方向上，黑方向下；兵卒只能向前。', '着法虽合法，但没有按题目走兵卒到指定交叉点。',
        { board: initial, turn: 'red', prompt: '轮到红方：把左边红兵向前走一个交叉点。', goal: dest(0, 5, 'soldier'), solutions: [mv(0, 6, 0, 5)], successExplanation: '红兵从下向上前进一步，之后轮到黑方。' },
        [
          { board: basic([2, 3, 'black', 'soldier'], [7, 7, 'red', 'cannon']), turn: 'black', prompt: '轮到黑方：让黑卒向前走一步。', goal: dest(2, 4, 'soldier'), solutions: [mv(2, 3, 2, 4)], successExplanation: '黑卒从上向下前进，棋子始终落在交叉点。' },
          { board: basic([6, 6, 'red', 'soldier'], [1, 2, 'black', 'cannon']), turn: 'red', prompt: '轮到红方：将右侧红兵前进一步。', goal: dest(6, 5, 'soldier'), solutions: [mv(6, 6, 6, 5)], successExplanation: '前进到相邻交叉点，走后轮到黑方。' },
        ]),
    ],
  },
  {
    id: 'major-pieces', title: '02 · 车马炮', summary: '车走直线，马腿受阻不能跳，炮隔一子才能吃。', units: [
      moveUnit('rook', '车走直线', '车沿横线或竖线走，不能越过棋子。', '先找目标和车是否在同一条直线上。', '检查途中有没有棋子挡路。', '这手没有让车沿指定方向到达目标。',
        { board: basic([0, 8, 'red', 'rook'], [7, 3, 'black', 'soldier']), turn: 'red', prompt: '把红车沿竖线走到 (0,5)。', goal: dest(0, 5, 'rook'), solutions: [mv(0, 8, 0, 5)], successExplanation: '车沿同一纵线前进，途中没有越子。' },
        [
          { board: basic([7, 6, 'red', 'rook'], [3, 6, 'black', 'horse']), turn: 'red', prompt: '红车沿横线吃掉没有棋子遮挡的黑马。', goal: { kind: 'capture', by: 'rook', target: 'horse', at: { x: 3, y: 6 } }, solutions: [mv(7, 6, 3, 6)], successExplanation: '车沿横线走到黑马所在的点，途中没有越子。' },
          { board: basic([8, 1, 'black', 'rook'], [8, 5, 'red', 'soldier'], [6, 1, 'red', 'horse']), turn: 'black', prompt: '轮到黑方：沿竖线吃掉前方的红兵。', goal: { kind: 'capture', by: 'rook', target: 'soldier', at: { x: 8, y: 5 } }, solutions: [mv(8, 1, 8, 5)], successExplanation: '黑车沿竖线吃兵；横线上的红马是另一条合法着法，但不符合本题目标。' },
        ]),
      moveUnit('horse-leg', '蹩马腿', '马走日字，先经过的马腿交叉点必须空着。', '先找到马的起点与日字落点。', '检查起点旁、朝日字长边方向的马腿。', '目标着法应避开被占住的马腿。',
        { board: basic([1, 9, 'red', 'horse'], [1, 8, 'red', 'soldier']), turn: 'red', prompt: '上方马腿被挡住；把红马走到 (3,8)。', goal: dest(3, 8, 'horse'), solutions: [mv(1, 9, 3, 8)], blockedAttempt: mv(1, 9, 0, 7), successExplanation: '右侧马腿为空，马可以走到 (3,8)；被兵挡住的上方不能跳。' },
        [
          { board: basic([4, 7, 'red', 'horse'], [4, 6, 'red', 'soldier'], [6, 6, 'black', 'rook']), turn: 'red', prompt: '上方马腿有兵；找通畅的马腿吃掉黑车。', goal: { kind: 'capture', by: 'horse', target: 'rook', at: { x: 6, y: 6 } }, solutions: [mv(4, 7, 6, 6)], successExplanation: '右侧马腿没有子，红马走日字吃掉黑车。' },
          { board: basic([7, 0, 'black', 'horse'], [7, 1, 'black', 'soldier'], [5, 1, 'red', 'cannon']), turn: 'black', prompt: '下方马腿被挡住；改从通畅的马腿吃掉红炮。', goal: { kind: 'capture', by: 'horse', target: 'cannon', at: { x: 5, y: 1 } }, solutions: [mv(7, 0, 5, 1)], successExplanation: '向左的马腿为空，黑马走日字吃掉红炮。' },
        ]),
      { ...moveUnit('cannon-capture', '炮架与隔子吃', '炮平走可不隔子；吃子必须恰好隔一子。', '先分清平走和吃子。', '沿目标方向数炮与敌子之间的棋子，必须恰好一枚。', '这手合法，但没有由炮隔一枚炮架吃到指定棋子。',
        { board: cannonBoard, turn: 'red', prompt: '用红炮隔着 (3,5) 的卒吃掉 (5,5) 的黑车。', goal: { kind: 'capture', by: 'cannon', target: 'rook', at: { x: 5, y: 5 } }, solutions: [mv(1, 5, 5, 5)], successExplanation: '炮和黑车之间正好有一枚卒作为炮架。' },
        [
          { board: basic([7, 7, 'red', 'cannon'], [7, 5, 'red', 'soldier'], [7, 3, 'black', 'rook']), turn: 'red', prompt: '这次炮架是己方兵；隔子吃掉纵线上的黑车。', goal: { kind: 'capture', by: 'cannon', target: 'rook', at: { x: 7, y: 3 } }, solutions: [mv(7, 7, 7, 3)], successExplanation: '己方兵也能当炮架，炮越过它吃黑车。' },
          { board: basic([0, 2, 'black', 'cannon'], [0, 4, 'red', 'soldier'], [0, 7, 'red', 'rook']), turn: 'black', prompt: '轮到黑方：用黑炮隔着红兵吃掉红车。', goal: { kind: 'capture', by: 'cannon', target: 'rook', at: { x: 0, y: 7 } }, solutions: [mv(0, 2, 0, 7)], successExplanation: '黑炮与红车之间只有一枚红兵，因此可以吃。' },
        ]), relatedExamples: [{ id: 'cannon-flat-example', title: '炮二平五：炮平走', board: initial, turn: 'red', move: mv(7, 7, 4, 7), explanation: '没有吃子时，炮像车一样沿直线平走，途中不能越子。' }] },
    ],
  },
  {
    id: 'palace-river', title: '03 · 九宫与河界', summary: '帅将和士留在九宫，相象不过河，过河兵卒能横走。', units: [
      moveUnit('palace', '帅将与士的九宫', '帅将直走一步，士斜走一步，都不能离开九宫。', '先找九宫的三纵三横范围。', '帅将走直线一步；士沿斜线一步。', '合法着法没有把九宫里的指定棋子走到目标点。',
        { board: basic([3, 9, 'red', 'advisor'], [0, 6, 'red', 'soldier']), turn: 'red', prompt: '让红仕沿九宫斜线走到 (4,8)。', goal: dest(4, 8, 'advisor'), solutions: [mv(3, 9, 4, 8)], successExplanation: '仕斜走一格，仍在红方九宫内。' },
        [
          { board: basic([2, 6, 'red', 'soldier']), turn: 'red', prompt: '让红帅向九宫中心直走一步。', goal: dest(4, 8, 'general'), solutions: [mv(4, 9, 4, 8)], successExplanation: '帅直走一步，向九宫中心靠近。' },
          { board: basic([5, 0, 'black', 'advisor'], [8, 2, 'black', 'rook']), turn: 'black', prompt: '轮到黑方：让黑士沿九宫斜线回到中心。', goal: dest(4, 1, 'advisor'), solutions: [mv(5, 0, 4, 1)], successExplanation: '黑士斜走到黑方九宫中心。' },
        ]),
      moveUnit('elephant-river', '相象不过河', '相象走田字，象眼不能被堵，也不能过河。', '数两步斜线的田字落点。', '检查田字中心和楚河汉界。', '目标是相象合法守在己方河岸的指定点。',
        { board: initial, turn: 'red', prompt: '让右相走到 (4,7)，守住中路。', goal: dest(4, 7, 'elephant', { x: 6, y: 9 }), solutions: [mv(6, 9, 4, 7)], successExplanation: '右相走田字、象眼为空，仍留在己方河岸。' },
        [
          { board: basic([2, 9, 'red', 'elephant'], [6, 6, 'red', 'soldier']), turn: 'red', prompt: '让左相朝边线斜走，仍留在己方河岸。', goal: dest(0, 7, 'elephant'), solutions: [mv(2, 9, 0, 7)], successExplanation: '相斜走两格，象眼空着，未过河。' },
          { board: basic([6, 0, 'black', 'elephant'], [0, 6, 'red', 'soldier']), turn: 'black', prompt: '轮到黑方：让黑象向右边线斜走，仍不过河。', goal: dest(8, 2, 'elephant'), solutions: [mv(6, 0, 8, 2)], successExplanation: '黑象留在上半棋盘，走法同样受象眼限制。' },
        ]),
      moveUnit('soldier', '兵卒过河', '兵卒向前一步；过河后还可以横走，不可后退。', '先判断兵卒是否已经过河。', '过河前只向前，过河后可向左右。', '这手没有按过河兵卒的目标方向到达指定点。',
        { board: basic([2, 4, 'red', 'soldier']), turn: 'red', prompt: '红兵已经过河，把它横走到 (3,4)。', goal: dest(3, 4, 'soldier'), solutions: [mv(2, 4, 3, 4)], successExplanation: '红兵过河后可向左右横走一步。' },
        [
          { board: basic([6, 5, 'black', 'soldier'], [1, 7, 'red', 'cannon']), turn: 'black', prompt: '黑卒已经过河；横走一步，向中路靠近。', goal: dest(5, 5, 'soldier'), solutions: [mv(6, 5, 5, 5)], successExplanation: '黑卒过河后可向中路横走，但仍不能后退。' },
          { board: basic([5, 3, 'red', 'soldier'], [8, 4, 'black', 'horse']), turn: 'red', prompt: '这枚红兵已经过河；横走一步，靠近右侧黑马。', goal: dest(6, 3, 'soldier'), solutions: [mv(5, 3, 6, 3)], successExplanation: '过河兵可在同一横线上向侧边走一步。' },
        ]),
    ],
  },
  {
    id: 'capture', title: '04 · 吃子与保护', summary: '吃掉指定对方棋子，或挡住将帅所受攻击。', units: [
      moveUnit('capture-target', '吃到指定棋子', '走到对方棋子的位置才能吃子。', '先确认目标是对方棋子。', '检查己方棋子的走法以及吃后将帅安全。', '这手没有吃到题目指定的棋子。',
        { board: captureBoard, turn: 'red', prompt: '用红车吃掉 (4,3) 的黑车。', goal: { kind: 'capture', by: 'rook', target: 'rook', at: { x: 4, y: 3 } }, solutions: [mv(4, 5, 4, 3)], successExplanation: '红车沿竖线到黑车的位置，黑车被吃掉。' },
        [
          { board: basic([2, 7, 'red', 'horse'], [4, 6, 'black', 'cannon']), turn: 'red', prompt: '找到没有蹩马腿的着法，用红马吃掉黑炮。', goal: { kind: 'capture', by: 'horse', target: 'cannon', at: { x: 4, y: 6 } }, solutions: [mv(2, 7, 4, 6)], successExplanation: '马腿为空，红马走到黑炮所在点并吃掉它。' },
          { board: position([5, 9, 'red', 'general'], [3, 0, 'black', 'general'], [4, 4, 'red', 'soldier'], [4, 3, 'black', 'cannon'], [8, 7, 'red', 'rook']), turn: 'red', prompt: '找出能吃到黑炮的过河红兵着法。', goal: { kind: 'capture', by: 'soldier', target: 'cannon', at: { x: 4, y: 3 } }, solutions: [mv(4, 4, 4, 3)], successExplanation: '红兵向前一步，占据黑炮所在的交叉点。' },
        ]),
      moveUnit('protect', '挡住攻击线', '将帅受到直线攻击时，可以用棋子垫在攻击线上。', '先沿攻击线找到将帅与攻击子。', '找一枚能合法到达两者之间的己方棋子。', '这手没有按任务挡住攻击线。',
        { board: defendBoard, turn: 'red', prompt: '用左红车走到 (4,8)，挡住黑车对帅的攻击。', goal: dest(4, 8, 'rook'), solutions: [mv(0, 8, 4, 8)], successExplanation: '红车进入黑车与红帅之间，直线攻击被挡住。' },
        [
          { board: basic([4, 5, 'black', 'rook'], [3, 9, 'red', 'advisor']), turn: 'red', prompt: '用九宫内的红仕挡在黑车与帅之间。', goal: dest(4, 8, 'advisor'), solutions: [mv(3, 9, 4, 8)], successExplanation: '仕在九宫内斜走一步，垫在攻击线中间。' },
          { board: basic([4, 3, 'black', 'rook'], [6, 7, 'red', 'rook'], [0, 6, 'red', 'soldier']), turn: 'red', prompt: '用右侧红车挡住黑车的直线攻击。', goal: dest(4, 7, 'rook'), solutions: [mv(6, 7, 4, 7)], successExplanation: '车横走到中路，黑车不再直攻红帅。' },
        ]),
    ],
  },
  {
    id: 'check', title: '05 · 将军与应将', summary: '将军是直接攻击将帅；被将的一方必须先化解。', units: [
      moveUnit('give-check', '认出将军', '走后对方将帅受到攻击，就形成将军。', '观察对方将帅的位置。', '试着让车、马或炮的攻击线覆盖将帅。', '合法着法没有形成将军。',
        { board: basic([4, 5, 'red', 'rook']), turn: 'red', prompt: '横走红车，对黑将形成将军。', goal: { kind: 'give-check', direction: 'horizontal' }, solutions: [mv(4, 5, 3, 5)], successExplanation: '红车来到黑将同一路，黑方下一着必须应将。' },
        [
          { board: basic([0, 3, 'red', 'horse'], [7, 7, 'red', 'soldier']), turn: 'red', prompt: '用红马走日字，对黑将形成将军。', goal: { kind: 'give-check', piece: 'horse' }, solutions: [mv(0, 3, 2, 2)], successExplanation: '红马走日字后攻击黑将，黑方下一着必须应将。' },
          { board: basic([1, 5, 'red', 'cannon'], [3, 3, 'black', 'soldier']), turn: 'red', prompt: '横走红炮，使炮架与黑将成一直线并将军。', goal: { kind: 'give-check' }, solutions: [mv(1, 5, 3, 5)], successExplanation: '黑卒成了炮架，红炮隔一子攻击黑将。' },
        ]),
      moveUnit('resolve-check', '应将', '被将军时，合法着法必须真正解除攻击。', '先确认谁正在攻击己方将帅。', '可以移将、垫子或吃攻击子；走后将帅必须安全。', '着法合法，但没有化解本题的将军。',
        { board: defendBoard, turn: 'red', prompt: '黑车正在将军；任选一着合法的应将着法。', goal: { kind: 'resolve-check' }, solutions: [mv(0, 8, 4, 8), mv(4, 9, 5, 9)], successExplanation: '走后红帅不再受攻击；垫车或移帅都可应将。' },
        [
          { board: basic([4, 3, 'black', 'rook'], [3, 9, 'red', 'advisor']), turn: 'red', prompt: '黑车直攻红帅；任选合法办法解除将军。', goal: { kind: 'resolve-check' }, solutions: [mv(3, 9, 4, 8), mv(4, 9, 5, 9)], successExplanation: '垫仕或移帅都能使红帅脱离攻击。' },
          { board: basic([4, 4, 'black', 'cannon'], [4, 7, 'red', 'soldier'], [0, 8, 'red', 'rook']), turn: 'red', prompt: '黑炮借红兵作炮架将军；任选合法办法应将。', goal: { kind: 'resolve-check' }, solutions: [mv(4, 9, 5, 9), mv(0, 8, 4, 8)], successExplanation: '移帅或增加一枚遮挡棋子，都能解除隔子将军。' },
        ]),
    ],
  },
  {
    id: 'finish', title: '06 · 将死与困毙', summary: '将死与困毙都判无着方负；同意和棋与自然限着是和棋。', units: [
      moveUnit('checkmate', '将死', '被将军且没有任何合法应将着法，就是将死。', '先看落子后是否将军。', '再看对方是否还有任一种合法应将。', '这手没有形成真正的将死。',
        { board: position([4, 9, 'red', 'general'], [4, 0, 'black', 'general'], [5, 0, 'black', 'rook'], [4, 1, 'black', 'soldier'], [3, 1, 'red', 'rook'], [4, 3, 'red', 'rook']), turn: 'red', prompt: '吃掉黑卒，走出真正的将死。', goal: { kind: 'checkmate' }, solutions: [mv(4, 3, 4, 1)], successExplanation: '黑卒原先隔开攻击线；红车吃卒后将军，黑方无合法应将。' },
        [
          { board: position([4, 9, 'red', 'general'], [4, 0, 'black', 'general'], [3, 0, 'black', 'horse'], [4, 1, 'black', 'soldier'], [5, 1, 'red', 'rook'], [4, 3, 'red', 'rook']), turn: 'red', prompt: '黑卒尚挡着红车；找出吃卒将死的一着。', goal: { kind: 'checkmate' }, solutions: [mv(4, 3, 4, 1)], successExplanation: '红车吃掉挡路黑卒，另一车守住逃点，黑将无解。' },
          { board: position([4, 9, 'red', 'general'], [4, 0, 'black', 'general'], [5, 0, 'black', 'rook'], [4, 1, 'black', 'soldier'], [3, 1, 'red', 'rook'], [4, 4, 'red', 'cannon'], [4, 2, 'red', 'soldier']), turn: 'red', prompt: '不直接用车将军；横走红兵，让炮线形成将死。', goal: { kind: 'checkmate', piece: 'soldier', direction: 'horizontal' }, solutions: [mv(4, 2, 5, 2)], successExplanation: '红兵横走后，黑卒成为唯一炮架；黑将被炮将死。' },
        ]),
      moveUnit('stalemate', '困毙', '未被将军却没有任何合法着法，也是负。', '先看对方将帅是否正在被攻击。', '再检查对方所有棋子是否都无合法着法。', '这手没有形成未被将军且无合法着法的困毙。',
        { board: position([5, 9, 'red', 'general'], [4, 0, 'black', 'general'], [2, 1, 'red', 'rook'], [5, 1, 'red', 'rook']), turn: 'red', prompt: '横走左红车，封住黑将最后一个逃点，形成困毙。', goal: { kind: 'stalemate', from: { x: 2, y: 1 }, direction: 'horizontal' }, solutions: [mv(2, 1, 3, 1)], successExplanation: '黑将未受攻击，最后一个逃点被红车控制，黑方负。' },
        [
          { board: position([3, 9, 'red', 'general'], [4, 0, 'black', 'general'], [3, 1, 'red', 'rook'], [2, 3, 'red', 'horse']), turn: 'red', prompt: '不用车将军；找出用马封住最后逃点的一着。', goal: { kind: 'stalemate', piece: 'horse' }, solutions: [mv(2, 3, 4, 2)], successExplanation: '马控制最后逃点，黑将未受攻击却无合法着法。' },
          { board: position([5, 9, 'red', 'general'], [4, 0, 'black', 'general'], [3, 1, 'red', 'rook'], [5, 1, 'black', 'soldier'], [5, 2, 'red', 'rook']), turn: 'red', prompt: '黑卒正挡着红车；吃掉它来封住最后逃点。', goal: { kind: 'stalemate' }, solutions: [mv(5, 2, 5, 1)], successExplanation: '黑卒被吃后，红车控制最后逃点；黑将并未被将军。' },
        ]),
      choiceUnit('draws', '困毙与两类和棋', '认清无合法着法、双方同意与自然限着的不同结果。', '先问双方是否都还有合法着法。', '再看是否双方同意和棋，或达到长期无吃子的自然限着。', '这段情境的终局原因与所选名称不同。',
        { board: initial, turn: 'red', situation: 'agreement', prompt: '双方都还有棋可走，一方提和并得到对方接受。结果是什么？', options: drawOptions, correctOptionId: 'agreement-draw', successExplanation: '双方同意和棋，胜负为和；这不是困毙。' },
        [
          { board: position([3, 9, 'red', 'general'], [5, 0, 'black', 'general'], [2, 1, 'red', 'horse'], [6, 1, 'red', 'rook']), turn: 'black', situation: 'stalemate', prompt: '轮到黑方：黑将未受攻击，却没有任何合法着法。结果是什么？', options: drawOptions, correctOptionId: 'stalemate-loss', successExplanation: '这是困毙，按现有规则黑方负，不是和棋。' },
          { board: basic([0, 6, 'red', 'soldier'], [8, 3, 'black', 'soldier']), turn: 'red', noCapturePlies: 120, situation: 'natural-limit', prompt: '双方都有合法着法，但长期没有吃子，已到自然限着。结果是什么？', options: drawOptions, correctOptionId: 'natural-draw', successExplanation: '达到自然限着时判和棋，双方均无胜者。' },
        ]),
    ],
  },
  {
    id: 'notation', title: '07 · 看懂棋谱', summary: '中文棋谱记录棋子、纵线、进退平与距离。', units: [
      moveUnit('read-notation', '按记谱走棋', '读出一条中文记谱，再在棋盘上走出对应着法。', '先识别棋子和它所在的纵线。', '进退是朝向关系；平是横走，末字是距离或目标纵线。', '这手的中文记谱与题目不符。',
        { board: initial, turn: 'red', prompt: '按“车九进一”走棋，并核对坐标。', goal: { kind: 'notation', value: '车九进一' }, solutions: [mv(0, 9, 0, 8)], successExplanation: '红方九路车从 (0,9) 到 (0,8)，记为车九进一。' },
        [
          { board: basic([1, 9, 'red', 'horse'], [6, 6, 'red', 'soldier']), turn: 'red', prompt: '按“马八进七”走棋，并核对坐标。', goal: { kind: 'notation', value: '马八进七' }, solutions: [mv(1, 9, 2, 7)], successExplanation: '红马从八路走日字到七路，坐标是 (1,9) 到 (2,7)。' },
          { board: blackNotation, turn: 'black', prompt: '按“炮2平5”走棋，并核对坐标。', goal: { kind: 'notation', value: '炮2平5' }, solutions: [mv(1, 2, 4, 2)], successExplanation: '黑炮从二路平移到五路，坐标是 (1,2) 到 (4,2)。' },
        ]),
    ],
  },
  {
    id: 'opening', title: '08 · 开局第一步', summary: '可以发展马或控制中路，并说出着法目的。', units: [
      moveUnit('opening-move', '开局的有目的出子', '在任务给定的局面里，发展马或控制中路都可以。', '先想这一步要发展棋子还是控制中路。', '找一枚能合法出动的马，或一步到中路的兵。', '这手合法，但未实现本关指定的开局目标。',
        { board: initial, turn: 'red', prompt: '试试仙人指路：把右侧红兵向前走一步。', goal: dest(6, 5, 'soldier'), solutions: [mv(6, 6, 6, 5)], successExplanation: '红兵向前试探；开局仍要看对手应手。' },
        [
          { board: blackOpening, turn: 'black', prompt: '红兵已经先走；黑方发展任一边的马。', goal: { kind: 'piece-move', piece: 'horse' }, solutions: [mv(1, 0, 2, 2), mv(7, 0, 6, 2)], successExplanation: '马从底线出动，获得更多活动点；两边的合法出马都可。' },
          { board: redOpening, turn: 'red', prompt: '另一开局局面：发展马，或走中兵控制中路。', goal: { kind: 'one-of', goals: [{ kind: 'piece-move', piece: 'horse' }, dest(4, 5, 'soldier')] }, solutions: [mv(1, 9, 2, 7), mv(4, 6, 4, 5)], successExplanation: '发展马或挺中兵都符合本关给出的目的；这里不声称唯一最佳着法。' },
        ]),
      choiceUnit('opening-purpose', '说出开局目的', '把落子和本关明确给出的意图对应起来。', '先看刚走动了什么棋子。', '判断是增加马的活动点，还是占据中路。', '所选目的与展示的着法不符。',
        { board: moveBoard(initial, mv(1, 9, 2, 7)), turn: 'black', situation: 'opening-purpose', prompt: '红马刚从 (1,9) 走到 (2,7)。这一着的主要目的是什么？', options: openingOptions, correctOptionId: 'develop-horse', successExplanation: '马离开底线，取得更多活动点。' },
        [
          { board: moveBoard(initial, mv(4, 6, 4, 5)), turn: 'black', situation: 'opening-purpose', prompt: '红中兵刚从 (4,6) 前进到 (4,5)。这一步的目的是什么？', options: openingOptions, correctOptionId: 'control-centre', successExplanation: '挺起中兵，争取中路空间。' },
          { board: moveBoard(moveBoard(initial, mv(8, 6, 8, 5)), mv(7, 0, 6, 2)), turn: 'red', situation: 'opening-purpose', prompt: '另一条开局线上，红兵先走，黑马从 (7,0) 到 (6,2)。黑方这一步的目的是什么？', options: openingOptions, correctOptionId: 'develop-horse', successExplanation: '黑马离开底线，获得更多活动点。' },
        ]),
    ],
  },
]
