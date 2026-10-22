import { useEffect, useMemo, useState } from 'react'
import { curriculum } from '../content/curriculum'
import type { LessonTask } from '../content/curriculum'
import { gradeChoiceTask, gradeMoveTask } from '../core/lesson-goals'
import { markVariantAssisted, recordChallenge, selectNextChallengeVariant } from '../core/learning'
import { createGame, isInCheck, legalMoves, tryMove } from '../core/rules'
import type { Game } from '../core/rules'
import type { Progress } from '../core/storage'
import { samePosition } from '../core/types'
import type { Move, Position } from '../core/types'
import { formatMove } from '../core/notation'
import { Board } from './Board'

type Stage = 'demo' | 'practice' | 'challenge' | 'review'
type Props = {
  progress: Progress
  onProgress: (update: (previous: Progress) => Progress) => void
  onTerm: (id: string) => void
  onPracticeAi: (coachEnabled: boolean) => void
  initialUnitId?: string
  navigationRequest?: { unitId: string; sequence: number }
}
type CourseState = {
  chapter: number; unit: number; stage: Stage; variantId: string | null
  game: Game; selected: Position | null; answered: boolean
  hints: number; answerShown: boolean; demoShown: boolean
  reference: number | null; lastMove: Move | null; notice: string
}
const lessonTerms = ['intersection', 'cannon-screen', 'palace', 'exchange', 'respond', 'checkmate', 'notation', 'immortal-points']
const hintNames = ['观察', '规则与思路', '具体着法或答案']
const stageNames: Record<Stage, string> = { demo: '演示 · 先看一遍', practice: '练习 · 原局面自己走', challenge: '挑战 · 未见变式', review: '变式练习 · 已见题目' }

function taskGame(task: LessonTask): Game {
  return { ...createGame(task.board, task.turn), noCapturePlies: task.noCapturePlies ?? 0 }
}
function initialState(chapter = 0, unit = 0, stage: Stage = 'demo', task = curriculum[chapter].units[unit].demo): CourseState {
  return {
    chapter, unit, stage, variantId: stage === 'challenge' || stage === 'review' ? task.id : null,
    game: taskGame(task), selected: null, answered: false, hints: 0, answerShown: false,
    demoShown: false, reference: null, lastMove: null,
    notice: stage === 'demo' ? '先看题目，再点击演示。演示不记录学习进度。' : stage === 'review' ? '未见变式已用完；这些题目只作练习。' : task.kind === 'choice' ? '根据局面与情境，选择一个答案。' : '点选棋子，再走到目标交叉点。',
  }
}

function initialUnitState(unitId?: string): CourseState {
  for (const [chapterIndex, chapter] of curriculum.entries()) {
    const unitIndex = chapter.units.findIndex(unit => unit.id === unitId)
    if (unitIndex >= 0) return initialState(chapterIndex, unitIndex)
  }
  return initialState()
}

export function LessonCourse({ progress, onProgress, onTerm, onPracticeAi, initialUnitId, navigationRequest }: Props) {
  const [state, setState] = useState(() => initialUnitState(initialUnitId))
  // A visited question stays seen when moving between units during this course visit.
  const [seenIds, setSeenIds] = useState<string[]>([])
  useEffect(() => {
    if (navigationRequest) setState(initialUnitState(navigationRequest.unitId))
  }, [navigationRequest])
  const chapter = curriculum[state.chapter]
  const unit = chapter.units[state.unit]
  const task = state.stage === 'demo' ? unit.demo : state.stage === 'practice' ? unit.practice : unit.variants.find(variant => variant.id === state.variantId)!
  const assisted = progress.assistedVariants.includes(task.id) || state.stage === 'review'
  const legal = useMemo(() => legalMoves(state.game.board, state.game.turn), [state.game.board, state.game.turn])
  const targets = state.selected && !state.answered && task.kind === 'move' && state.stage !== 'demo' ? legal.filter(move => samePosition(move.from, state.selected!)).map(move => move.to) : []
  const reference = state.reference === null ? null : unit.relatedExamples?.[state.reference]
  const nextChallengeId = selectNextChallengeVariant(progress, unit.variants.map(variant => variant.id), seenIds)

  function finish(message: string, game = state.game, move: Move | null = null) {
    if (state.stage === 'practice') onProgress(previous => ({ ...previous, practicedUnits: [...new Set([...previous.practicedUnits, unit.id])] }))
    else onProgress(previous => recordChallenge(previous, unit.id, task.id, assisted))
    const resultLabel = state.stage === 'practice' ? '原局面练习完成，接着试试未见变式。' : assisted ? '本题已使用帮助或已经见过，只记练习。' : '无提示完成未见变式，已掌握这个知识点。'
    setState(previous => ({ ...previous, game, lastMove: move, selected: null, answered: true, notice: `${message} ${resultLabel}` }))
  }

  function handleCell(position: Position) {
    if (state.stage === 'demo') { setState(previous => ({ ...previous, notice: '演示阶段先看示范；点击“开始原局面练习”后自己走。' })); return }
    if (state.answered || task.kind !== 'move') return
    const piece = state.game.board[position.y][position.x]
    if (state.selected) {
      if (samePosition(state.selected, position)) { setState(previous => ({ ...previous, selected: null })); return }
      const move = { from: state.selected, to: position }
      const result = gradeMoveTask(task, state.game, move)
      if (result.status === 'success') { finish(result.message, result.game, move); return }
      setState(previous => ({ ...previous, notice: result.message, selected: piece?.side === state.game.turn ? position : previous.selected }))
      return
    }
    if (piece?.side === state.game.turn) setState(previous => ({ ...previous, selected: position, notice: '已标出合法落点；落子还需要符合任务目标。' }))
    else setState(previous => ({ ...previous, notice: `轮到${state.game.turn === 'red' ? '红' : '黑'}方，请选择这一方的棋子。` }))
  }

  function choose(optionId: string) {
    if (task.kind !== 'choice' || state.stage === 'demo' || state.answered) return
    const result = gradeChoiceTask(task, optionId)
    if (result.status === 'success') finish(result.message)
    else setState(previous => ({ ...previous, notice: result.message }))
  }

  function demonstrate() {
    if (task.kind === 'choice') {
      setState(previous => ({ ...previous, demoShown: true, notice: `${task.options.find(option => option.id === task.correctOptionId)!.label}：${task.successExplanation}` }))
      return
    }
    const move = task.solutions[0]
    const result = gradeMoveTask(task, taskGame(task), move)
    if (result.status === 'success') setState(previous => ({ ...previous, game: result.game, reference: null, demoShown: true, lastMove: move, notice: `示范：${result.message}。现在可以从原局面自己练习。` }))
    else setState(previous => ({ ...previous, notice: result.message }))
  }

  function showReference(index: number) {
    const example = unit.relatedExamples![index]
    const result = tryMove(createGame(example.board, example.turn), example.move)
    if (result.ok) setState(previous => ({ ...previous, game: result.game, reference: index, lastMove: example.move, demoShown: true, notice: `${example.title}：${example.explanation}` }))
  }

  function challenge() {
    const id = nextChallengeId
    const currentIndex = unit.variants.findIndex(variant => variant.id === state.variantId)
    const next = unit.variants.find(variant => variant.id === id) ?? unit.variants[(currentIndex + 1) % unit.variants.length]
    setState(initialState(state.chapter, state.unit, id ? 'challenge' : 'review', next))
    if (id) setSeenIds(previous => [...new Set([...previous, id])])
  }

  function expose(kind: 'hint' | 'answer') {
    // Exposure is saved before the learner answers, including after leaving/reloading.
    if (state.stage === 'challenge' || state.stage === 'review') onProgress(previous => markVariantAssisted(previous, task.id))
    setState(previous => ({ ...previous, hints: kind === 'hint' ? Math.min(3, previous.hints + 1) : previous.hints, answerShown: previous.answerShown || kind === 'answer', notice: '已使用帮助；本题成功后只记练习。可换一个未曝光变式争取掌握。' }))
  }

  function retry() {
    const repeated = state.answered && (state.stage === 'challenge' || state.stage === 'review')
    setState(initialState(state.chapter, state.unit, repeated ? 'review' : state.stage, task))
  }

  function nextUnit() {
    if (state.unit + 1 < chapter.units.length) setState(initialState(state.chapter, state.unit + 1))
    else if (state.chapter + 1 < curriculum.length) setState(initialState(state.chapter + 1))
  }

  return <div className="course-layout">
    <div className="course-main">
    <header className="learning-intro course-intro"><p className="eyebrow">第 {state.chapter + 1} / 8 章 · 17 个知识点</p><h2>{chapter.title}</h2><p>{chapter.summary}</p></header>
    <div className="course-board"><Board board={state.game.board} selected={state.selected} legalTargets={targets} lastMove={state.lastMove} onCell={handleCell} onCancel={() => setState(previous => ({ ...previous, selected: null, notice: '已取消选择。' }))} checkedSide={isInCheck(state.game.board, state.game.turn) ? state.game.turn : null} /></div>
    <div className="learning-actions course-actions">
      {state.stage === 'demo' ? <><button type="button" onClick={demonstrate}>{task.kind === 'move' ? '演示这一步' : '演示如何判断'}</button><button type="button" className="primary-action" onClick={() => setState(initialState(state.chapter, state.unit, 'practice', unit.practice))}>开始原局面练习</button></> : <>
        {!state.answered ? <><button type="button" disabled={state.hints >= 3} onClick={() => expose('hint')}>{state.hints < 3 ? `提示 ${state.hints + 1} · ${hintNames[state.hints]}` : '三层提示已展开'}</button><button type="button" disabled={state.answerShown} onClick={() => expose('answer')}>揭晓答案</button></> : null}
        <button type="button" onClick={retry}>重试本题</button>
        {state.stage === 'practice' && state.answered ? <button type="button" className="primary-action" onClick={challenge}>{nextChallengeId ? '进入未见变式' : '开始变式复习'}</button> : null}
        {state.stage === 'challenge' || state.stage === 'review' ? <button type="button" onClick={challenge}>{nextChallengeId ? '换一个未见变式' : '换一个变式练习'}</button> : null}
        <button type="button" onClick={() => setState(initialState(state.chapter, state.unit))}>再看演示</button>
      </>}
      <button type="button" onClick={() => onTerm(lessonTerms[state.chapter])}>查看相关术语</button>
      {state.answered && !(state.chapter === curriculum.length - 1 && state.unit === chapter.units.length - 1) ? <button type="button" onClick={nextUnit}>下一知识点</button> : null}
    </div>
    <section className="course-feedback" aria-label="学习反馈">
      <div className={`feedback ${state.answered ? 'success' : 'demo'}`}><p role="status" aria-live="polite" aria-atomic="true">{state.notice}</p></div>
      {state.demoShown && !reference ? <div className="feedback demo"><strong>{task.kind === 'move' ? `示范：${formatMove(task.board, task.solutions[0])}` : '判断示范'}</strong><p>{task.successExplanation}</p></div> : null}
      {task.hints.slice(0, state.hints).map((hint, index) => <p className="hint-box" key={index}><strong>提示 {index + 1} · {hintNames[index]}：</strong>{hint}</p>)}
      {state.answerShown ? <div className="hint-box"><strong>答案：{task.kind === 'move' ? formatMove(task.board, task.solutions[0]) : task.options.find(option => option.id === task.correctOptionId)!.label}</strong><p>{task.successExplanation}</p></div> : null}
    </section>
    </div>
    <div className="course-sidebar">
    <section className="course-task panel" aria-label="当前学习任务">
      <p className="eyebrow">{stageNames[state.stage]}</p><h3>{unit.title}</h3><p className="muted">{unit.summary}</p>
      <ol className="course-stages" aria-label="学习阶段">{(['demo', 'practice', 'challenge'] as const).map((stage, index) => <li key={stage} aria-current={state.stage === stage || stage === 'challenge' && state.stage === 'review' ? 'step' : undefined}>{index + 1} · {['看演示', '自己练', '换局面'][index]}</li>)}</ol>
      <p className="course-prompt"><strong>{reference ? reference.title : task.prompt}</strong></p>
      <p className="course-turn">当前棋盘：{state.game.turn === 'red' ? '红' : '黑'}方行棋{task.noCapturePlies !== undefined ? <> · <span>连续未吃子：{state.game.noCapturePlies} 着</span></> : null}</p>
      {task.kind === 'choice' ? <div className="course-choices" aria-label="选择答案">{task.options.map(option => <button key={option.id} type="button" disabled={state.stage === 'demo' || state.answered} onClick={() => choose(option.id)}>{option.label}</button>)}</div> : null}
      {assisted && state.stage !== 'demo' ? <p className="course-help-note">本题只记练习，掌握需要另一个未曝光变式。</p> : null}
      {state.stage === 'demo' && unit.relatedExamples ? <div className="course-references"><p>同一规则的另一个示范</p>{unit.relatedExamples.map((example, index) => <button key={example.id} type="button" onClick={() => showReference(index)}>{example.title}</button>)}{reference ? <button type="button" onClick={() => setState(initialState(state.chapter, state.unit))}>返回本课演示</button> : null}</div> : null}
    </section>
    <aside className="course-directory panel" aria-label="课程目录"><p className="eyebrow">学习路线</p><h3>随时跳章，逐个掌握</h3>
      <div className="lesson-list">{curriculum.map((option, index) => <div key={option.id} className="course-chapter"><button type="button" className={state.chapter === index ? 'active' : ''} onClick={() => setState(initialState(index))}><span>{option.title}</span><small>已练习 {option.units.filter(value => progress.practicedUnits.includes(value.id)).length}/{option.units.length} · 掌握 {option.units.filter(value => progress.masteredUnits.includes(value.id)).length}/{option.units.length}</small></button>{progress.completedLessons.includes(option.id) ? <p className="legacy-completion">旧版已完成</p> : null}{state.chapter === index ? <div className="course-units">{option.units.map((value, unitIndex) => <button type="button" key={value.id} className={state.unit === unitIndex ? 'active' : ''} onClick={() => setState(initialState(index, unitIndex))}><span>{value.title}</span><small>{progress.masteredUnits.includes(value.id) ? '已掌握' : progress.practicedUnits.includes(value.id) ? '已练习' : '未练习'}</small></button>)}</div> : null}</div>)}</div>
      <p className="muted">演示不记进度。原局面与使用帮助的变式记为练习；无提示完成未见变式才记为掌握。走错不会改变局面。</p>
      {state.chapter === curriculum.length - 1 ? <div className="course-first-match"><h4>把学到的用在第一盘</h4><button type="button" onClick={() => onPracticeAi(true)}>带提示下第一盘</button><button type="button" onClick={() => onPracticeAi(false)}>自己下第一盘</button></div> : null}
    </aside>
    </div>
  </div>
}
