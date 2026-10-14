import type { Move } from '../core/types'
export type Opening = { id: string; title: string; summary: string; steps: { move: Move; note: string }[] }
const m = (fx: number, fy: number, tx: number, ty: number): Move => ({ from: { x: fx, y: fy }, to: { x: tx, y: ty } })

export const openings: Opening[] = [
  {
    id: 'central-cannon', title: '中炮起手', summary: '用炮瞄准中路，随后出马巩固阵形。',
    steps: [
      { move: m(7, 7, 4, 7), note: '红方炮二平五，中炮把目光放到中路。' },
      { move: m(7, 0, 6, 2), note: '黑方跳右马，保护中路并准备出子。' },
      { move: m(7, 9, 6, 7), note: '红方右马出动，避免只靠一门炮进攻。' },
      { move: m(1, 0, 2, 2), note: '黑方再跳左马，形成双马护中的屏风马。' },
    ],
  },
  {
    id: 'screen-horses', title: '屏风马应对', summary: '面对中炮，黑方两翼出马守住中路。',
    steps: [
      { move: m(1, 7, 4, 7), note: '红方另一侧的炮同样可以平到中路。' },
      { move: m(1, 0, 2, 2), note: '黑方左马先起，占据稳健的出子点。' },
      { move: m(1, 9, 2, 7), note: '红方左马也出动，保持双方子力发展。' },
      { move: m(7, 0, 6, 2), note: '黑方右马补齐，双马形如屏风。' },
    ],
  },
  {
    id: 'flying-elephant', title: '飞相局', summary: '先稳住中路，再有次序地出马。',
    steps: [
      { move: m(6, 9, 4, 7), note: '红方飞右相，照应中路与底线。' },
      { move: m(7, 0, 6, 2), note: '黑方跳马发展，避免过早移动同一棋子。' },
      { move: m(7, 9, 6, 7), note: '红方右马出动，配合相守护阵地。' },
      { move: m(6, 3, 6, 4), note: '黑方挺卒，争取河口附近的空间。' },
    ],
  },
  {
    id: 'immortal-points', title: '仙人指路', summary: '先挺三路兵，观察对手布局后再决定主攻方向。',
    steps: [
      { move: m(6, 6, 6, 5), note: '红方兵三进一，先争取河口的空间。' },
      { move: m(1, 2, 4, 2), note: '黑方炮平中路，建立中路压力。' },
      { move: m(7, 9, 6, 7), note: '红方跳右马，兼顾中路和右侧。' },
      { move: m(7, 0, 6, 2), note: '黑方也跳马，把主要棋子逐步展开。' },
    ],
  },
]
