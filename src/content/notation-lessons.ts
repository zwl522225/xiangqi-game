import type { LessonUnit, MoveTask } from './curriculum'
import type { Board, Move, Side } from '../core/types'
import { position } from './positions'

type Scene = {
  board: Board
  turn: Side
  notation: string
  move: Move
  observe: string
  focus: string
  explanation: string
}
const mv = (fx: number, fy: number, tx: number, ty: number): Move => ({ from: { x: fx, y: fy }, to: { x: tx, y: ty } })
const board = (...pieces: Parameters<typeof position>): Board => position(
  [4, 9, 'red', 'general'], [3, 0, 'black', 'general'], ...pieces,
)

function unit(id: string, title: string, summary: string, scenes: [Scene, Scene, Scene, Scene]): LessonUnit {
  const task = (scene: Scene, suffix: string): MoveTask => ({
    id: `${id}-${suffix}`, kind: 'move', board: scene.board, turn: scene.turn,
    prompt: `轮到${scene.turn === 'red' ? '红方' : '黑方'}：请在棋盘上走出“${scene.notation}”。本题只核对指定记谱。`,
    goal: { kind: 'notation', value: scene.notation }, solutions: [scene.move],
    hints: [scene.observe, scene.focus, `走出${scene.notation}：从 (${scene.move.from.x},${scene.move.from.y}) 到 (${scene.move.to.x},${scene.move.to.y})。`],
    successExplanation: scene.explanation,
    notGoalExplanation: `这手合法，但与本题要求的“${scene.notation}”不符；请重新核对棋子、方向与末字。`,
  })
  return { id, title, summary, demo: task(scenes[0], 'demo'), practice: task(scenes[0], 'practice'), variants: scenes.slice(1).map((scene, index) => task(scene, `variant-${index + 1}`)) }
}

// These are original teaching setups, not claims of reachability from the opening.
// Target strings and coordinates are authored independently of the formatter.
export const notationUnits: LessonUnit[] = [
  unit('notation-files', '红黑路数从哪边数', '先按行棋方自己的方向数路，再读进退平；翻转画面不改变记谱。', [
    {
      board: board([8,8,'red','rook'], [2,0,'black','elephant'], [2,6,'red','soldier']), turn: 'red', notation: '车一进三', move: mv(8,8,8,5),
      observe: '红方从自己右手边起数一至九路；默认画面中，红方一路在右侧。',
      focus: '找一路红车；红方的进是朝黑方底线，沿本路走。',
      explanation: '红方一路车在 (8,8)；“车一”指它，“进”朝黑方底线，“三”是前进距离三格，到 (8,5)。没有吃子，也未将军。',
    },
    {
      board: board([6,2,'black','cannon'], [1,7,'red','horse'], [8,3,'black','soldier'], [5,9,'red','advisor']), turn: 'black', notation: '炮7平3', move: mv(6,2,2,2),
      observe: '黑方按自己的右手方向数路；默认画面从左到右是黑方1至9路。',
      focus: '找黑方7路炮；平表示横走，先找到黑方3路。',
      explanation: '黑方7路炮在 (6,2)；“平”是横走，“3”是目标路3路，不是走三格，到 (2,2)。途中无子，无吃子、无将军。',
    },
    {
      board: board([1,6,'red','cannon'], [7,2,'black','horse'], [6,9,'red','elephant'], [0,3,'black','soldier']), turn: 'red', notation: '炮八退二', move: mv(1,6,1,8),
      observe: '红方八路与黑方2路是同一条真实纵线，但使用哪种路数取决于行棋方。',
      focus: '红炮在八路；退是朝红方底线，不是朝黑方前进。',
      explanation: '红方八路炮在 (1,6)；“退”朝红方底线，末字“二”是后退距离两格，到 (1,8)。没有吃子，也未将军。',
    },
    {
      board: board([0,4,'black','rook'], [0,6,'red','soldier'], [5,0,'black','advisor'], [7,8,'red','cannon']), turn: 'black', notation: '车1进2', move: mv(0,4,0,6),
      observe: '黑方1路在默认画面的左侧；黑方前进方向朝红方底线。',
      focus: '从黑车沿1路朝红方底线数两个交叉点，检查途中和落点。',
      explanation: '黑方1路车在 (0,4)；“进”朝红方底线，“2”是前进距离两格，到 (0,6) 吃掉红兵，走后未将军。',
    },
  ]),
  unit('notation-straight', '直走的进退平', '车炮将帅兵卒纵走末字是距离；横走末字是目标路数，仍须遵守各自走法。', [
    {
      board: board([2,7,'red','rook'], [6,1,'black','cannon'], [6,3,'black','soldier'], [0,7,'red','elephant']), turn: 'red', notation: '车七进三', move: mv(2,7,2,4),
      observe: '纵走用进或退；先确认行棋方与纵线。',
      focus: '七路红车朝黑方底线走，沿途须没有棋子；三表示走几格。',
      explanation: '红方七路车在 (2,7)；“进”朝黑方底线，“三”是距离三格，到 (2,4)。车未越子，走后无吃子、无将军。',
    },
    {
      board: board([7,4,'black','cannon'], [2,8,'red','horse'], [6,0,'black','elephant'], [8,5,'red','soldier']), turn: 'black', notation: '炮8退3', move: mv(7,4,7,1),
      observe: '黑方的退是朝黑方底线，也就是默认画面的上方。',
      focus: '8路黑炮不吃子时不能越子；朝黑方底线数三格。',
      explanation: '黑方8路炮在 (7,4)；“退”朝黑方底线，“3”是距离三格，到 (7,1)。路径为空，无吃子、无将军。',
    },
    {
      board: board([3,9,'red','advisor'], [1,3,'black','horse'], [4,4,'black','soldier'], [0,8,'red','cannon']), turn: 'red', notation: '帅五平四', move: mv(4,9,5,9),
      observe: '平是横走，帅仍须直走一步、留在九宫内。',
      focus: '红帅在五路，四路是它旁边的纵线；不是横走四格。',
      explanation: '红方五路帅在 (4,9)；“平”横走，“四”是目标路四路，到 (5,9)。只走一步且仍在九宫，无吃子、无将军。',
    },
    {
      board: board([2,5,'black','soldier'], [8,2,'black','cannon'], [0,8,'red','rook'], [4,8,'red','advisor']), turn: 'black', notation: '卒3平4', move: mv(2,5,3,5),
      observe: '先看黑卒是否过河；过河才可以横走。',
      focus: '3路黑卒已经过河，平4要横走到相邻的黑方4路。',
      explanation: '黑方3路卒在 (2,5)，已经过河；“平”横走，“4”是目标路4路，到 (3,5)。卒只走一步，无吃子、无将军。',
    },
  ]),
  unit('notation-target-file', '马相仕的末字', '马相象仕士斜走时，进退说明方向、末字说明目标路，另查马腿、象眼、河界与九宫。', [
    {
      board: board([2,6,'red','horse'], [2,5,'red','soldier'], [4,5,'black','cannon'], [8,3,'black','soldier'], [5,7,'red','advisor']), turn: 'red', notation: '马七进五', move: mv(2,6,4,5),
      observe: '马的末字是目标路；先看从七路向前可到哪条纵线。',
      focus: '马腿 (2,5) 有红兵；马腿 (3,6) 为空，可走日字到五路。',
      explanation: '红方七路马在 (2,6)；“进”朝黑方底线，“五”是目标路五路，走日字到 (4,5)。马腿 (3,6) 为空，吃掉黑炮，未将军；马腿 (2,5) 有兵不能跳。',
    },
    {
      board: board([2,0,'black','elephant'], [1,1,'black','horse'], [7,6,'red','cannon'], [0,5,'red','soldier'], [5,0,'black','advisor']), turn: 'black', notation: '象3进5', move: mv(2,0,4,2),
      observe: '象的末字也是目标路；黑方进朝红方底线，但象不能过河。',
      focus: '3路黑象向5路走田字，象眼 (3,1) 为空；象眼 (1,1) 有黑马。',
      explanation: '黑方3路象在 (2,0)；“进”朝红方底线，“5”是目标路5路，到 (4,2)。象眼 (3,1) 为空且未过河，无吃子、无将军；不能越过被马堵住的象眼 (1,1)。',
    },
    {
      board: board([5,7,'red','advisor'], [8,7,'red','elephant'], [0,2,'black','rook'], [6,6,'red','soldier']), turn: 'red', notation: '仕四退五', move: mv(5,7,4,8),
      observe: '仕的退朝红方底线，末字不是距离；落点必须在九宫斜线上。',
      focus: '四路红仕斜退一格到九宫中央的五路，不可斜走出宫。',
      explanation: '红方四路仕在 (5,7)；“退”朝红方底线，“五”是目标路五路，斜走一步到 (4,8)，仍在九宫。无吃子、无将军。',
    },
    {
      board: board([6,3,'black','horse'], [6,4,'black','soldier'], [4,4,'red','soldier'], [0,1,'black','cannon'], [2,9,'red','elephant']), turn: 'black', notation: '马7退6', move: mv(6,3,5,1),
      observe: '黑马退朝黑方底线；末字6是目标路，不能当作退六格。',
      focus: '7路黑马向后走日字；马腿 (6,2) 为空，马腿 (6,4) 被黑卒挡住。',
      explanation: '黑方7路马在 (6,3)；“退”朝黑方底线，“6”是目标路6路，走日字到 (5,1)。马腿 (6,2) 为空，无吃子、无将军；马腿 (6,4) 有卒不能跳。',
    },
  ]),
  unit('notation-front-back', '同线的前后棋子', '同方恰好两枚同类车马炮在同一路时，靠近对方底线的是前子；前后按行棋方判断。', [
    {
      board: board([0,3,'red','rook'], [0,8,'red','rook'], [6,6,'red','soldier'], [6,0,'black','elephant'], [7,2,'black','cannon']), turn: 'red', notation: '前车平六', move: mv(0,3,3,3),
      observe: '同一路上有两辆红车，先按红方朝黑方底线的前进方向分前后。',
      focus: '靠近黑方底线的 (0,3) 是前车；平六表示横走到红方六路。',
      explanation: '红方九路两车中，(0,3) 更靠近黑方底线，所以用“前车”替代“车九”；“平”横走，“六”是目标路六路，到 (3,3)。无吃子，走后沿纵线将军。',
    },
    {
      board: board([7,2,'black','horse'], [7,6,'black','horse'], [2,7,'red','cannon'], [4,6,'red','soldier'], [4,1,'black','advisor']), turn: 'black', notation: '前马退6', move: mv(7,6,5,5),
      observe: '黑方朝红方底线前进；同线黑马中，更靠近红方底线的才是前马。',
      focus: '(7,6) 的黑马靠近红方底线；退6是退向黑方6路，仍需检查马腿。',
      explanation: '黑方8路两马中，(7,6) 更靠近红方底线，所以是“前马”；“退”朝黑方底线，“6”是目标路6路，到 (5,5)。马腿 (6,6) 为空，无吃子、无将军。',
    },
    {
      board: board([6,6,'red','cannon'], [6,8,'red','cannon'], [0,7,'red','elephant'], [1,1,'black','rook'], [0,4,'black','soldier']), turn: 'red', notation: '后炮平一', move: mv(6,8,8,8),
      observe: '同路两门红炮按朝黑方底线的前进方向排序；更靠红方底线的是后炮。',
      focus: '选择 (6,8) 的后炮；平一是横走到红方一路，不是平走一格。',
      explanation: '红方三路两炮中，(6,8) 更靠近红方底线，记作“后炮”；“平”横走，“一”是目标路一路，到 (8,8)。路径为空，无吃子、无将军。',
    },
    {
      board: board([8,1,'black','rook'], [8,4,'black','rook'], [1,8,'red','horse'], [4,2,'black','elephant'], [2,5,'red','soldier'], [6,3,'black','soldier']), turn: 'black', notation: '后车退1', move: mv(8,1,8,0),
      observe: '黑方前进朝红方底线，靠近黑方底线的同线车是后车。',
      focus: '(8,1) 的黑车是后车；退1沿本路朝黑方底线走一格。',
      explanation: '黑方9路两车中，(8,1) 更靠近黑方底线，所以是“后车”；“退”朝黑方底线，“1”是后退距离一格，到 (8,0)。无吃子、无将军。',
    },
  ]),
]
