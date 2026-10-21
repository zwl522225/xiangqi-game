import type { TacticTopic } from './tactics-goals'
import type { Move } from './types'
import type { TacticFeedback, TacticView } from './tactics-view'
import { tactics } from '../content/tactics'
import { tacticFeedback, tacticHints, tacticView } from './tactics-view'

export type TacticsRequest = { mode: 'topic'; topic: TacticTopic } | { mode: 'recommended' | 'mistakes' }
export type TacticsResult = 'independent' | 'assisted' | 'revealed' | 'skipped'
export type TacticsError = { version: 1; path: Move[]; move: Move }
export type TacticsRecord = { id: string; version: 1; everCompleted: boolean; everIndependent: boolean; review: null | 'pending' | 'reviewed'; errors: number; lastError: TacticsError | null }
export type TacticsItem = { id: string; version: 1; path: Move[]; errors: number; hintLevel: number; hinted: boolean; demonstrated: boolean; refutationViewed: boolean; retried: boolean; revealed: boolean; answerFrom: number | null; result: TacticsResult | null }
export type TacticsRound = { request: TacticsRequest; index: number; items: TacticsItem[] }
export type TacticsData = { version: 1; records: TacticsRecord[]; round: TacticsRound | null }
type SimpleAction = 'reply' | 'hint' | 'demonstrate' | 'refutation' | 'answer' | 'retry' | 'skip' | 'next'
export type TacticsAction = { type: 'start'; request: TacticsRequest } | { type: 'move'; move: Move } | { [K in SimpleAction]: { type: K } }[SimpleAction]
export type CurrentTactic = { item: TacticsItem; record: TacticsRecord; view: TacticView; hints: string[]; lastWrong: { error: TacticsError; view: TacticView; feedback: TacticFeedback } | null }
export function defaultTactics(): TacticsData {
  return { version: 1, records: tactics.map(({ id, version }) => ({ id, version, everCompleted: false, everIndependent: false, review: null, errors: 0, lastError: null })), round: null }
}
export function currentTactic(data: TacticsData): CurrentTactic | null {
  const item = data.round?.items[data.round.index]
  if (!item) return null
  const view = tacticView(item.id, item.path), record = data.records.find(r => r.id === item.id)
  if (!view || !record) return null
  const error = item.errors > 0 ? record.lastError : null
  const errorView = error ? tacticView(item.id, error.path) : null
  return { item, record, view, hints: tacticHints(item.id, item.path), lastWrong: error && errorView
    ? { error, view: errorView, feedback: tacticFeedback(item.id, error.path, error.move) } : null }
}
export function tacticsSummary(data: TacticsData) {
  const counts = { independent: 0, assisted: 0, revealed: 0, skipped: 0 }
  for (const item of data.round?.items ?? []) if (item.result) counts[item.result]++
  return { finished: data.round !== null && data.round.index === data.round.items.length,
    total: data.round?.items.length ?? 0, counts, items: data.round?.items ?? [] }
}
function newItem(id: string): TacticsItem {
  return { id, version: 1, path: [], errors: 0, hintLevel: 0, hinted: false, demonstrated: false,
    refutationViewed: false, retried: false, revealed: false, answerFrom: null, result: null }
}
/** Malformed coordinates are not a board submission and cannot enter the bounded error log. */
function boardMove(move: Move): boolean {
  return Boolean(move?.from && move?.to) && [move.from, move.to].every(p => Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < 9 && p.y >= 0 && p.y < 10)
}
const cloneMove = (move: Move): Move => ({ from: { ...move.from }, to: { ...move.to } })
const assisted = (item: TacticsItem) => item.errors > 0 || item.hinted || item.demonstrated || item.refutationViewed || item.retried || item.revealed

/** Only published edges are advanced; this module performs no search and has no browser effects. */
export function transitionTactics(data: TacticsData, action: TacticsAction): { data: TacticsData; message: string } {
  if (action.type === 'start') {
    const request = action.request
    const priority = (id: string) => {
      const record = data.records.find(r => r.id === id)!
      return record.review === 'pending' ? 0 : !record.everCompleted ? 1 : 2
    }
    const choices = tactics.filter(t => request.mode === 'topic' ? t.topic === request.topic
      : request.mode !== 'mistakes' || data.records.find(r => r.id === t.id)?.review === 'pending')
      .sort((a, b) => (request.mode === 'recommended' ? priority(a.id) - priority(b.id) : 0) || a.id.localeCompare(b.id))
      .slice(0, request.mode === 'topic' ? 2 : 3)
    return { data: { ...data, round: { request: { ...request }, index: 0, items: choices.map(t => newItem(t.id)) } }, message: choices.length ? '本轮训练已开始。' : '暂无待复习错题。' }
  }
  const current = currentTactic(data)
  if (!current || !data.round) return { data, message: '' }
  if (action.type === 'next') {
    if (!current.item.result) return { data, message: '请先完成或跳过本题。' }
    const round = { ...data.round, index: data.round.index + 1 }
    return { data: { ...data, round }, message: round.index === round.items.length ? '本轮训练结束。' : '已进入下一题。' }
  }
  const item: TacticsItem = { ...current.item, path: current.item.path.map(cloneMove) }
  const record: TacticsRecord = { ...current.record }
  const publish = (message: string) => ({ data: { ...data, records: data.records.map(r => r.id === record.id ? record : r),
    round: { ...data.round!, items: data.round!.items.map((old, index) => index === data.round!.index ? item : old) } }, message })
  if (action.type === 'retry') {
    Object.assign(item, { path: [], hintLevel: 0, answerFrom: null, result: null, retried: true })
    return publish('重新从本题起点练习；本题辅助、错误和重试历史保留。')
  }
  if (item.result) return { data, message: '本题已结束，可重试或进入下一题。' }
  if (action.type === 'skip') { item.result = 'skipped'; item.hintLevel = 0; return publish('本题已跳过。') }
  if (action.type === 'refutation') {
    if (!current.lastWrong) return { data, message: '本题尚无错误提交。' }
    item.refutationViewed = true
    return publish(current.lastWrong.feedback.message)
  }
  if (action.type === 'hint') {
    if (!current.view.learnerTurn) return { data, message: '请先查看对方应手。' }
    item.hinted = true; item.hintLevel = Math.min(3, item.hintLevel + 1)
    return publish(current.hints[item.hintLevel - 1])
  }
  if (action.type === 'answer') {
    item.revealed = true; item.answerFrom = item.path.length; item.hintLevel = 0
    let view = current.view
    while (!view.complete && item.path.length < 6) {
      const move = view.learnerTurn ? view.correctMoves[0] : view.reply
      if (!move) break
      item.path.push(cloneMove(move))
      view = tacticView(item.id, item.path)!
    }
    item.result = 'revealed'
    return publish('已展开从当前正确变化继续的完整答案，示范后缀已标记。')
  }
  let move: Move
  if (action.type === 'reply') {
    if (current.view.learnerTurn || !current.view.reply) return { data, message: '现在轮到你行棋。' }
    move = current.view.reply
  } else {
    if (!current.view.learnerTurn) return { data, message: '现在轮到对方，请查看对方应手。' }
    if (action.type === 'demonstrate') { item.demonstrated = true; move = current.view.correctMoves[0] }
    else {
      move = action.move
      if (!boardMove(move)) return { data, message: '坐标不在棋盘上。' }
      const feedback = tacticFeedback(item.id, item.path, move)
      if (feedback.status !== 'success') {
        item.errors = Math.min(999, item.errors + 1); record.errors = Math.min(999, record.errors + 1)
        record.review = 'pending'; record.lastError = { version: 1, path: item.path.map(cloneMove), move: cloneMove(move) }
        return publish(feedback.message)
      }
    }
  }
  item.path.push(cloneMove(move)); item.hintLevel = 0
  const view = tacticView(item.id, item.path)!
  let message = view.notes.at(-1) ?? ''
  if (view.complete) {
    item.result = assisted(item) ? 'assisted' : 'independent'
    record.everCompleted = true
    if (item.result === 'independent') {
      record.everIndependent = true
      if (record.review === 'pending') record.review = 'reviewed'
    }
    message += item.result === 'independent' ? ' 本轮首次无提示且无错误完成。' : ' 辅助练习完成。'
  }
  return publish(message)
}
