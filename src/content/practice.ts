import { createInitialBoard } from '../core/board'
import { coordinateMove, formatMove } from '../core/notation'
import { moveBoard } from '../core/rules'
import type { Move } from '../core/types'
import type { ChoiceTask, LessonTask, MoveTask } from './curriculum'
import { position } from './positions'

export type PracticeTopicId = 'moves' | 'capture' | 'check' | 'endgame' | 'notation'
export type PracticeExercise = {
  id: string
  version: number
  topicId: PracticeTopicId
  unitId: string
  title: string
  task: LessonTask
}

export const practiceTopics: { id: PracticeTopicId; title: string; description: string }[] = [
  { id: 'moves', title: '基础走法', description: '换个局面辨认直线、马腿、象眼与九宫。' },
  { id: 'capture', title: '吃子与保护', description: '找准吃子目标，或挡住将帅受到的攻击。' },
  { id: 'check', title: '将军与应将', description: '制造真实将军，并尝试不同的合法应将。' },
  { id: 'endgame', title: '终局判断', description: '从合法着法和实际攻击判断将死、困毙与限着和棋。' },
  { id: 'notation', title: '记谱与开局', description: '把中文棋谱走到棋盘上，练习有目的地出马。' },
]

const mv = (fx: number, fy: number, tx: number, ty: number): Move => ({ from: { x: fx, y: fy }, to: { x: tx, y: ty } })
type MoveScene = Omit<MoveTask, 'id' | 'kind' | 'hints'> & { hints: [string, string] }
function moveExercise(id: string, topicId: PracticeTopicId, unitId: string, title: string, scene: MoveScene): PracticeExercise {
  return {
    id, version: 1, topicId, unitId, title,
    task: {
      ...scene, id, kind: 'move',
      hints: [...scene.hints, `参考着法：${formatMove(scene.board, scene.solutions[0])}，${coordinateMove(scene.solutions[0])}。符合题意的其他合法着法也可。`],
    },
  }
}
function choiceExercise(id: string, unitId: string, title: string, scene: Omit<ChoiceTask, 'id' | 'kind' | 'hints'> & { hints: [string, string] }): PracticeExercise {
  return {
    id, version: 1, topicId: 'endgame', unitId, title,
    task: { ...scene, id, kind: 'choice', hints: [...scene.hints, `答案：${scene.options.find(option => option.id === scene.correctOptionId)!.label}。`] },
  }
}

// A fresh opening line: both cannons move inward, then the edge soldiers advance.
// The left cannon now occupies the usual inward horse destination: read the board first.
const developedOpening = [mv(1, 7, 2, 7), mv(7, 2, 6, 2), mv(0, 6, 0, 5), mv(8, 3, 8, 4)]
  .reduce((board, move) => moveBoard(board, move), createInitialBoard())
const outcomeOptions = [
  { id: 'mate-loss', label: '被将军且无合法着法，将死判负' },
  { id: 'stalemate-loss', label: '未被将军却无合法着法，困毙判负' },
  { id: 'natural-draw', label: '达到本游戏自然限着，和棋' },
]

export const practiceExercises: PracticeExercise[] = [
  moveExercise('practice-moves-rook-route', 'moves', 'rook', '车从横线绕开阻挡', {
    board: position([5, 9, 'red', 'general'], [4, 0, 'black', 'general'], [2, 7, 'red', 'rook'], [2, 6, 'red', 'soldier'], [2, 4, 'black', 'soldier']),
    turn: 'red', prompt: '红车前方被己方兵挡住；沿横线走到右侧第七条纵线（坐标 x=6）。',
    goal: { kind: 'destination', to: { x: 6, y: 7 }, piece: 'rook' }, solutions: [mv(2, 7, 6, 7)], blockedAttempt: mv(2, 7, 2, 4),
    hints: ['车可以横走或直走，但不能越过己方兵。', '目标纵线是 x=6；保持车所在横线。'],
    successExplanation: '红车沿没有遮挡的横线到达目标；前方的兵仍挡住纵线，不能越过去吃卒。',
    notGoalExplanation: '这手合法，但没有让红车沿横线到达指定纵线。',
  }),
  moveExercise('practice-moves-horse-leg', 'moves', 'horse-leg', '从空马腿跃出', {
    board: position([3, 9, 'red', 'general'], [5, 0, 'black', 'general'], [6, 7, 'red', 'horse'], [6, 6, 'red', 'soldier'], [8, 6, 'black', 'cannon']),
    turn: 'red', prompt: '红马上方被兵蹩腿；从通畅的马腿走日字，落到黑炮所在处。',
    goal: { kind: 'capture', by: 'horse', target: 'cannon', at: { x: 8, y: 6 } }, solutions: [mv(6, 7, 8, 6)], blockedAttempt: mv(6, 7, 5, 5),
    hints: ['先区分日字的长边和短边。', '吃右边黑炮时，先经过马右侧相邻的交叉点，这里没有棋子。'],
    successExplanation: '红马从空着的右侧马腿跃出，落到黑炮位置并吃炮；不能跳过上方的兵。',
    notGoalExplanation: '这手合法，但本题要利用通畅的马腿吃到黑炮。',
  }),
  moveExercise('practice-moves-elephant-eye', 'moves', 'elephant-river', '避开被堵的象眼', {
    board: position([5, 9, 'red', 'general'], [3, 0, 'black', 'general'], [4, 7, 'red', 'elephant'], [3, 6, 'red', 'horse']),
    turn: 'red', prompt: '左前方象眼被马占住；把红相向右前方走田字，守在己方河岸。',
    goal: { kind: 'destination', to: { x: 6, y: 5 }, piece: 'elephant' }, solutions: [mv(4, 7, 6, 5)], blockedAttempt: mv(4, 7, 2, 5),
    hints: ['相走田字，两格斜线的正中间就是象眼。', '右前方的象眼没有子，落点仍在红方半场。'],
    successExplanation: '右侧象眼为空，红相走田字到己方河岸，没有越河。',
    notGoalExplanation: '这手合法，但没有让红相向右前方走田字。',
  }),
  moveExercise('practice-moves-palace', 'moves', 'palace', '黑士从中心斜走', {
    board: position([3, 9, 'red', 'general'], [5, 0, 'black', 'general'], [4, 1, 'black', 'advisor']),
    turn: 'black', prompt: '轮到黑方：让九宫中心的黑士向左下方斜走一步，仍留在九宫。',
    goal: { kind: 'destination', to: { x: 3, y: 2 }, piece: 'advisor' }, solutions: [mv(4, 1, 3, 2)],
    blockedAttempt: mv(4, 1, 2, 3),
    hints: ['黑方九宫在棋盘上方，士每次斜走一步。', '从中心向左下方斜走，纵横坐标各改变一。'],
    successExplanation: '黑士沿九宫斜线走一步，落点仍在黑方九宫中。',
    notGoalExplanation: '这手合法，但没有让黑士向左下方走到九宫角点。',
  }),

  moveExercise('practice-capture-rook-target', 'capture', 'capture-target', '先看清车的吃子路线', {
    board: position([4, 9, 'red', 'general'], [5, 0, 'black', 'general'], [6, 8, 'red', 'rook'], [6, 6, 'red', 'soldier'], [6, 3, 'black', 'rook'], [2, 8, 'black', 'horse']),
    turn: 'red', prompt: '红兵挡住了纵线；用红车沿另一条通畅路线吃掉黑马。',
    goal: { kind: 'capture', by: 'rook', target: 'horse', at: { x: 2, y: 8 } }, solutions: [mv(6, 8, 2, 8)], blockedAttempt: mv(6, 8, 6, 3),
    hints: ['黑车不是本题目标，而且纵线上有红兵遮挡。', '黑马与红车同一横线，中间没有子。'],
    successExplanation: '红车沿横线吃到黑马，既没有越子，也没有误认纵线上的黑车为目标。',
    notGoalExplanation: '这手合法，但没有用红车吃掉指定黑马。',
  }),
  moveExercise('practice-capture-cannon-screen', 'capture', 'cannon-capture', '借黑马作炮架', {
    board: position([3, 9, 'red', 'general'], [5, 0, 'black', 'general'], [2, 6, 'red', 'cannon'], [4, 6, 'black', 'horse'], [7, 6, 'black', 'rook']),
    turn: 'red', prompt: '黑马站在炮和黑车之间；用红炮隔一子吃掉黑车。',
    goal: { kind: 'capture', by: 'cannon', target: 'rook', at: { x: 7, y: 6 } }, solutions: [mv(2, 6, 7, 6)], blockedAttempt: mv(2, 6, 4, 6),
    hints: ['炮吃子时，起点与目标之间必须恰好一枚棋子。', '黑马可以作炮架，但炮不能直接吃紧邻这段空线的黑马。'],
    successExplanation: '红炮隔着一枚黑马吃掉黑车；对方棋子也能作炮架。',
    notGoalExplanation: '这手合法，但本题要求红炮隔黑马吃到黑车。',
  }),
  moveExercise('practice-capture-soldier-sideways', 'capture', 'soldier', '过河兵横吃', {
    board: position([5, 9, 'red', 'general'], [3, 0, 'black', 'general'], [7, 4, 'red', 'soldier'], [6, 4, 'black', 'cannon'], [7, 2, 'black', 'rook']),
    turn: 'red', prompt: '红兵已经过河；横走一步吃掉身旁的黑炮。',
    goal: { kind: 'capture', by: 'soldier', target: 'cannon', at: { x: 6, y: 4 } }, solutions: [mv(7, 4, 6, 4)], blockedAttempt: mv(7, 4, 7, 5),
    hints: ['红兵在上半场，已经越过河界。', '过河后可以向左右走一步，仍不能后退。'],
    successExplanation: '过河红兵横走一格，落在黑炮的位置并吃掉它。',
    notGoalExplanation: '这手合法，但没有让过河红兵横走吃炮。',
  }),
  moveExercise('practice-capture-protect-general', 'capture', 'protect', '用炮挡住车线', {
    board: position([5, 8, 'red', 'general'], [3, 0, 'black', 'general'], [5, 2, 'black', 'rook'], [1, 6, 'red', 'cannon']),
    turn: 'red', prompt: '黑车正沿纵线将军；用红炮平走，挡在黑车和红帅之间。',
    goal: { kind: 'destination', to: { x: 5, y: 6 }, piece: 'cannon' }, solutions: [mv(1, 6, 5, 6)],
    hints: ['黑车和红帅同在 x=5 的纵线上。', '炮没有吃子时像车一样平走，落到攻击线上就能挡住黑车。'],
    successExplanation: '红炮进入车和帅之间，黑车的直线攻击被挡住，红帅不再被将军。',
    notGoalExplanation: '这手合法，但本题要求用红炮挡住攻击线。',
  }),

  moveExercise('practice-check-rook-line', 'check', 'give-check', '车横走形成将军', {
    board: position([3, 9, 'red', 'general'], [4, 1, 'black', 'general'], [7, 4, 'red', 'rook'], [5, 2, 'black', 'advisor']),
    turn: 'red', prompt: '让红车沿横线走动，对黑将形成将军。',
    goal: { kind: 'give-check', piece: 'rook', direction: 'horizontal' }, solutions: [mv(7, 4, 4, 4)],
    hints: ['先找到黑将所在的纵线。', '红车横走后要与黑将同一路，而且中间不能有棋子。'],
    successExplanation: '红车横走后直线攻击黑将，黑方必须应将。',
    notGoalExplanation: '这手合法，但没有由红车横走形成将军。',
  }),
  moveExercise('practice-check-horse-attack', 'check', 'give-check', '马的不同将军点', {
    board: position([3, 8, 'red', 'general'], [5, 0, 'black', 'general'], [6, 3, 'red', 'horse'], [3, 2, 'black', 'advisor']),
    turn: 'red', prompt: '用红马走日字，对黑将形成将军；可寻找不同的将军点。',
    goal: { kind: 'give-check', piece: 'horse' }, solutions: [mv(6, 3, 4, 2), mv(6, 3, 7, 1)],
    hints: ['先找出哪些马位能用日字攻击黑将。', '走到将军点后，还要检查从该点攻击黑将时的马腿是否通畅。'],
    successExplanation: '红马落子后确实攻击黑将，且攻击所需马腿没有被挡住；不同合法将军点都可。',
    notGoalExplanation: '这手合法，但红马落子后没有将军。',
  }),
  moveExercise('practice-check-cannon-line', 'check', 'give-check', '借现成炮架将军', {
    board: position([4, 9, 'red', 'general'], [3, 1, 'black', 'general'], [4, 2, 'black', 'advisor'], [7, 5, 'red', 'cannon'], [3, 3, 'black', 'horse']),
    turn: 'red', prompt: '横走红炮，让黑马成为炮架，对黑将形成将军。',
    goal: { kind: 'give-check', piece: 'cannon', direction: 'horizontal' }, solutions: [mv(7, 5, 3, 5)],
    hints: ['黑马与黑将在同一条纵线上。', '把炮平移到这条纵线，检查炮与将之间恰好只有黑马一子。'],
    successExplanation: '红炮与黑将成一直线，中间恰好一枚黑马，隔子攻击构成将军。',
    notGoalExplanation: '这手合法，但没有让红炮横走后形成将军。',
  }),
  moveExercise('practice-check-responses', 'check', 'resolve-check', '尝试不同的应将办法', {
    board: position([4, 8, 'red', 'general'], [5, 0, 'black', 'general'], [4, 2, 'black', 'rook'], [0, 7, 'red', 'rook'], [6, 3, 'red', 'horse']),
    turn: 'red', prompt: '黑车正在将军；任选一种合法应将办法，让红帅安全。',
    goal: { kind: 'resolve-check' }, solutions: [mv(0, 7, 4, 7), mv(4, 8, 3, 8)],
    hints: ['可以垫子、移动帅，或吃掉正在攻击的黑车。', '应将后不仅要避开黑车，还不能让帅将直接照面。'],
    successExplanation: '这手真正解除了将军；垫子、合法移帅或吃掉攻击子都可，走后红帅必须安全。',
    notGoalExplanation: '本题需要先化解黑车对红帅的将军。',
  }),

  moveExercise('practice-endgame-mate', 'endgame', 'checkmate', '双车封住九宫', {
    board: position([5, 9, 'red', 'general'], [4, 0, 'black', 'general'], [2, 2, 'red', 'rook'], [5, 1, 'red', 'rook']),
    turn: 'red', prompt: '红方双车配合；走一步真正的将死，让黑将既受攻击又无路可走。',
    goal: { kind: 'checkmate', piece: 'rook' }, solutions: [mv(2, 2, 2, 0)],
    hints: ['一辆车封锁九宫第二横线，另一辆车可以攻击黑将所在横线。', '让左车直进到底线；检查黑将的三个相邻落点都不能解将。'],
    successExplanation: '黑将受到车的直线攻击，所有合法应将着法都已消失，实际结果是将死。',
    notGoalExplanation: '这手合法，但黑方仍未达到被将军且无合法应将的将死条件。',
  }),
  moveExercise('practice-endgame-stalemate', 'endgame', 'stalemate', '不将军也能困毙', {
    board: position([5, 9, 'red', 'general'], [3, 0, 'black', 'general'], [4, 3, 'red', 'rook']),
    turn: 'red', prompt: '黑方只剩将；用红车走出困毙，走后黑将不被将军却没有合法着法。',
    goal: { kind: 'stalemate', piece: 'rook' }, solutions: [mv(4, 3, 4, 1)],
    hints: ['黑将现在还能沿原纵线向下走一步。', '红车沿自己的纵线前进，横向封住黑将下一行，同时保留对右侧出口的控制。'],
    successExplanation: '黑将本身没有被攻击，但所有可走点都受控制；无合法着法形成困毙，黑方负。',
    notGoalExplanation: '这手合法，但还没有形成黑将未受攻击且无合法着法的困毙。',
  }),
  choiceExercise('practice-endgame-recognize-stalemate', 'draws', '黑将无路可走怎么办', {
    board: position([4, 8, 'red', 'general'], [5, 0, 'black', 'general'], [6, 1, 'red', 'rook']),
    turn: 'black', situation: 'stalemate', prompt: '轮到黑方。结合红车控制的交叉点和帅将不能照面的规则，判断本局结果。',
    options: outcomeOptions, correctOptionId: 'stalemate-loss',
    hints: ['先检查黑将是否正被攻击，再逐一检查九宫内的出口。', '向左会与红帅照面，向下会进入红车攻击线；黑方也没有其他棋子可走。'],
    successExplanation: '黑将未被将军，却没有任何合法着法，是困毙，判黑方负。',
    notGoalExplanation: '先区分正在被将军和完全无合法着法；困毙在象棋中也判负。',
  }),
  choiceExercise('practice-endgame-natural-limit', 'draws', '读懂题设的无吃子计数', {
    board: position([3, 8, 'red', 'general'], [5, 1, 'black', 'general'], [2, 6, 'red', 'horse'], [6, 4, 'black', 'cannon']),
    turn: 'red', situation: 'natural-limit', noCapturePlies: 120,
    prompt: '题设给定：连续无吃子计数为120半回合（一方走一步算一个），双方仍有合法着法。按本游戏的自然限着规则，结果是什么？',
    options: outcomeOptions, correctOptionId: 'natural-draw',
    hints: ['本题的计数由题设给出，不能从静态棋盘看出此前走过多少步。', '本游戏连续120半回合无吃子达到自然限着；还要先排除无合法着法的将死或困毙。'],
    successExplanation: '双方仍有合法着法，题设计数达到本游戏120半回合的自然限着，判和棋；这里采用本游戏的计数规则。',
    notGoalExplanation: '棋盘上仍有合法着法，应结合题设给定的无吃子计数判断自然限着。',
  }),

  moveExercise('practice-notation-rook', 'notation', 'read-notation', '红方车谱看进几', {
    board: position([5, 9, 'red', 'general'], [3, 0, 'black', 'general'], [1, 7, 'red', 'rook'], [1, 3, 'black', 'cannon']),
    turn: 'red', prompt: '按“车八进二”走棋；红方的“进”朝向黑方，末字表示直走的距离。',
    goal: { kind: 'notation', value: '车八进二' }, solutions: [mv(1, 7, 1, 5)],
    hints: ['红方从右向左数路，八路对应 x=1。', '红车向上走两个交叉点，途中没有阻挡；远处黑炮并不是本题目标。'],
    successExplanation: '红车沿八路前进两格，中文记谱正是车八进二。',
    notGoalExplanation: '这手合法，但记谱与车八进二不一致。',
  }),
  moveExercise('practice-notation-black-horse', 'notation', 'read-notation', '黑方退马看目标路', {
    board: position([5, 9, 'red', 'general'], [4, 0, 'black', 'general'], [2, 2, 'black', 'horse']),
    turn: 'black', prompt: '轮到黑方，按“马3退1”走棋；马的末字表示目标纵线。',
    goal: { kind: 'notation', value: '马3退1' }, solutions: [mv(2, 2, 0, 1)],
    hints: ['黑方从自己的右手边数路，一路是 x=0，三路是 x=2。', '黑方向棋盘上方走是退；找退向一路且马腿空着的日字落点。'],
    successExplanation: '黑马从三路退到一路，走日字且马腿通畅，记为马3退1。',
    notGoalExplanation: '这手合法，但不是黑方棋谱指定的马3退1。',
  }),
  moveExercise('practice-notation-cannon-capture', 'notation', 'read-notation', '棋谱中的平炮吃子', {
    board: position([3, 9, 'red', 'general'], [5, 1, 'black', 'general'], [6, 6, 'red', 'cannon'], [4, 6, 'black', 'soldier'], [1, 6, 'black', 'horse']),
    turn: 'red', prompt: '按“炮三平八”走棋，并检查这一步为何能吃子。',
    goal: { kind: 'notation', value: '炮三平八' }, solutions: [mv(6, 6, 1, 6)], blockedAttempt: mv(6, 6, 4, 6),
    hints: ['红方三路是 x=6，八路是 x=1；平表示横走。', '到八路黑马之间正好隔着一枚黑卒，满足炮吃子的条件。'],
    successExplanation: '红炮从三路横走到八路，隔一枚黑卒吃马；平炮也可能是吃子着法。',
    notGoalExplanation: '这手合法，但中文记谱不是炮三平八。',
  }),
  moveExercise('practice-notation-develop-horse', 'notation', 'opening-move', '先看落点再发展马', {
    board: developedOpening, turn: 'red', prompt: '双方炮和边兵已走动。现在发展任一匹红马，找没有己子占据的合法落点。',
    goal: { kind: 'piece-move', piece: 'horse' }, solutions: [mv(1, 9, 0, 7), mv(7, 9, 6, 7)], blockedAttempt: mv(1, 9, 2, 7),
    hints: ['不要照搬初始局面的出马路线：左炮已占据一处常见的马位。', '先看马腿是否为空，再看落点有没有己方棋子；两边的马都可以尝试。'],
    successExplanation: '红马离开底线，落点没有己子且马腿通畅；本题接受所有合法出马，不声称唯一最佳开局。',
    notGoalExplanation: '这手合法，但本题指定的目的是发展红马。',
  }),
]
