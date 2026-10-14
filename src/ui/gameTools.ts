import { play } from '../core/session'
import type { Session } from '../core/session'
import type { Move, Position } from '../core/types'

type PageTool = {
  name: string
  title: string
  description: string
  inputSchema: object
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }
  execute: (input: unknown) => unknown
}
type ModelContext = { registerTool: (tool: PageTool, options: { signal: AbortSignal }) => void | Promise<void> }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPosition(value: unknown): value is Position {
  return isRecord(value) && Object.keys(value).length === 2 && Number.isInteger(value.x) &&
    Number.isInteger(value.y) && Number(value.x) >= 0 && Number(value.x) <= 8 && Number(value.y) >= 0 && Number(value.y) <= 9
}

function isMove(value: unknown): value is Move {
  return isRecord(value) && Object.keys(value).length === 2 && isPosition(value.from) && isPosition(value.to)
}

const positionSchema = {
  type: 'object',
  properties: { x: { type: 'integer', minimum: 0, maximum: 8 }, y: { type: 'integer', minimum: 0, maximum: 9 } },
  required: ['x', 'y'], additionalProperties: false,
}

export function registerGameTools(getSession: () => Session, onPlayed: (session: Session) => void): () => void {
  const context = (document as Document & { modelContext?: ModelContext }).modelContext
  if (!context?.registerTool) return () => undefined
  const lifecycle = new AbortController()
  const options = { signal: lifecycle.signal }
  const register = (tool: PageTool) => {
    try {
      void Promise.resolve(context.registerTool(tool, options)).catch(error => console.warn('无法注册棋局操作接口', error))
    } catch (error) {
      console.warn('无法注册棋局操作接口', error)
    }
  }
  register({
    name: 'read_game_state', title: '查看当前棋局',
    description: '读取当前棋盘、轮到哪方行棋、棋谱和胜负状态。棋盘 y=0 在黑方底线，x=0 在棋盘左侧。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: () => {
      const session = getSession()
      return { board: session.game.board, turn: session.game.turn, mode: session.mode,
        playerSide: session.playerSide, moveCount: session.records.length,
        records: session.records.map(record => ({ notation: record.notation, coordinate: record.coordinate })),
        result: session.game.result, reviewing: session.viewIndex !== session.records.length }
    },
  })
  register({
    name: 'play_move', title: '走一着棋',
    description: '在当前棋局走一着合法棋，使用从黑方底线起 y=0 到红方底线 y=9、从左至右 x=0 到 x=8 的坐标；成功后立即更新可见棋盘和棋谱。',
    inputSchema: { type: 'object', properties: { from: positionSchema, to: positionSchema }, required: ['from', 'to'], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: input => {
      if (!isMove(input)) return { ok: false, error: '请输入棋盘内的起点和落点坐标' }
      const session = getSession()
      if (session.mode === 'ai' && session.game.turn !== session.playerSide) return { ok: false, error: '正在等待电脑行棋' }
      const result = play(session, input)
      if (!result.ok) return { ok: false, error: result.error }
      onPlayed(result.session)
      return { ok: true, notation: result.session.records.at(-1)?.notation, turn: result.session.game.turn,
        result: result.session.game.result }
    },
  })
  return () => lifecycle.abort()
}
