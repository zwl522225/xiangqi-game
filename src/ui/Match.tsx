import { useEffect, useMemo, useState } from 'react'
import { difficultyProfiles, normalizeDifficulty } from '../ai/difficulty'
import { isInCheck, legalMoves } from '../core/rules'
import type { Game } from '../core/rules'
import { createSession, play, setView, undo, viewGame, offerDraw, acceptDraw, resign } from '../core/session'
import type { Session } from '../core/session'
import type { LearningMatch, Progress } from '../core/storage'
import type { Preferences } from '../core/preferences'
import type { Position, Side } from '../core/types'
import { samePosition } from '../core/types'
import { Board } from './Board'
import { curriculum } from '../content/curriculum'
import { GlossaryLibrary, OpeningLibrary, RulesLibrary } from './Library'
import { useComputerTurn } from './useComputerTurn'
import { MoveReview } from './MoveReview'
import { CapturedPieces } from './CapturedPieces'
import type { PersistenceStatus } from './MoveReview'

export type HelpSection = 'openings' | 'terms' | 'rules' | null
type Props = {
  session: Session
  onChange: (session: Session) => void
  onStart: (session: Session) => void
  learningMatch: LearningMatch | null
  milestones: Progress['milestones']
  onCoachChange: (enabled: boolean) => void
  onCheckpointSeen: () => void
  onLearn: (unitId?: string) => void
  help: HelpSection
  onHelpChange: (help: HelpSection) => void
  onOpeningPractice: (game: Game) => void
  termId: string
  onTerm: (id: string) => void
  preferences: Preferences
  onPreferencesChange: (preferences: Partial<Preferences>) => void
  persistenceStatus?: PersistenceStatus
  onCollect?: () => void
  onExport?: () => void
  collectionNotice?: string
}
const sideName = (side: Side) => side === 'red' ? '红方' : '黑方'
const reasonName = { checkmate: '将死', stalemate: '困毙', 'natural-limit': '自然限着', resignation: '认输', agreement: '双方议和' }
const lessonUnits = curriculum.flatMap(chapter => chapter.units)

function relatedLessons(session: Session) {
  const reason = session.game.result?.reason
  if (!reason) return []
  const byReason = {
    checkmate: { unitId: 'checkmate', basis: '本局以将死结束。' },
    stalemate: { unitId: 'stalemate', basis: '本局以困毙结束。' },
    'natural-limit': { unitId: 'draws', basis: '本局达到自然限着。' },
    agreement: { unitId: 'draws', basis: '本局由双方议和结束。' },
    resignation: { unitId: 'read-notation', basis: '本局以认输结束，可以学习用棋谱回看着法。' },
  }
  const references = [byReason[reason]]
  const checks = session.records.filter(record => record.check).length
  const captures = session.records.filter(record => record.captured).length
  if (checks) references.push({ unitId: 'give-check', basis: `棋谱记录了 ${checks} 次将军。` })
  if (captures) references.push({ unitId: 'capture-target', basis: `棋谱记录了 ${captures} 次吃子。` })
  return references.flatMap(reference => {
    const unit = lessonUnits.find(value => value.id === reference.unitId)
    return unit ? [{ ...reference, title: unit.title }] : []
  })
}

export function Match({ session, onChange, onStart, learningMatch, milestones, onCoachChange, onCheckpointSeen, onLearn, help, onHelpChange, onOpeningPractice, termId, onTerm, preferences, onPreferencesChange, persistenceStatus, onCollect, onExport, collectionNotice }: Props) {
  const [selected, setSelected] = useState<Position | null>(null)
  const [notice, setNotice] = useState('点击一枚己方棋子，查看可以走到哪里。')
  const thinking = useComputerTurn(session, preferences.aiDifficulty, onChange, setNotice)
  const [checkpointVisible, setCheckpointVisible] = useState(false)
  const outcome = session.game.result
  const showing = viewGame(session)
  const reviewing = session.viewIndex !== session.records.length
  const humanTurn = session.mode === 'local' || session.game.turn === session.playerSide
  const legal = useMemo(() => legalMoves(showing.board, showing.turn), [showing.board, showing.turn])
  const targets = selected ? legal.filter(move => samePosition(move.from, selected)).map(move => move.to) : []
  const lastMove = session.viewIndex > 0 ? session.records[session.viewIndex - 1]?.move : null
  const orientation = preferences.boardView === 'auto' ? session.mode === 'ai' ? session.playerSide : 'red' : preferences.boardView

  useEffect(() => {
    if (!learningMatch?.active || !learningMatch.standardStart || outcome || session.records.length < 20) {
      setCheckpointVisible(false)
      return
    }
    if (help) return
    if (!learningMatch.checkpointSeen) {
      setCheckpointVisible(true)
      onCheckpointSeen()
    }
  }, [learningMatch?.active, learningMatch?.standardStart, learningMatch?.checkpointSeen, outcome, session.records.length, onCheckpointSeen, help])

  function handleCell(position: Position) {
    if (reviewing) { setNotice('请先返回当前局面，再继续走棋。'); return }
    if (!humanTurn || thinking || session.game.result) return
    const piece = session.game.board[position.y][position.x]
    if (selected) {
      if (samePosition(selected, position)) { setSelected(null); return }
      if (piece?.side === session.game.turn) {
        setSelected(position)
        setNotice('已标出这枚棋子的合法落点。')
        return
      }
      const result = play(session, { from: selected, to: position })
      if (result.ok) {
        onChange(result.session)
        setNotice(result.session.game.result ? '对局结束，可以回看棋谱。' : result.session.game.repetitionWarning ? '局面再次重复；复杂循环需按棋例判断。' : result.session.records.at(-1)!.notation)
        setSelected(null)
      } else setNotice(result.error)
      return
    }
    if (piece?.side === session.game.turn) {
      setSelected(position)
      setNotice('已标出这枚棋子的合法落点。')
    } else {
      setNotice('请先选择己方棋子。')
    }
  }

  function start(mode: 'local' | 'ai', playerSide: Side = 'red') {
    if (!session.game.result && session.records.length && !window.confirm('开始新局会替换当前棋局，确定继续吗？')) return
    onStart(createSession(mode, playerSide))
    setSelected(null)
    setNotice(mode === 'ai' ? '与电脑练习开始。' : '本机双人对局开始。')
  }

  async function copyRecord() {
    const text = session.records.map((record, index) => `${index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ''}${record.notation} ${record.coordinate}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setNotice('棋谱已复制。')
    } catch {
      setNotice('浏览器未允许复制，请从右侧棋谱中手动复制。')
    }
  }

  const showingOutcome = showing.result
  const checked = !showingOutcome && isInCheck(showing.board, showing.turn) ? showing.turn : null
  const positionStatus = showingOutcome ? showingOutcome.winner ? `${sideName(showingOutcome.winner)}获胜 · ${reasonName[showingOutcome.reason]}` : `和棋 · ${reasonName[showingOutcome.reason]}` : checked ? `${sideName(checked)}被将军 · 必须应将` : `${sideName(showing.turn)}行棋`
  const status = reviewing ? `${session.viewIndex === 0 ? '回看开局' : `回看第 ${session.viewIndex} 着`} · ${positionStatus}` : positionStatus
  const coachCheck = isInCheck(session.game.board, session.game.turn)
  const redMoves = session.records.filter(record => record.side === 'red').length
  const blackMoves = session.records.filter(record => record.side === 'black').length
  const reviewLessons = relatedLessons(session)
  const resultExplanation = outcome?.reason === 'checkmate' ? `${sideName(session.game.turn)}被将军且没有合法应将着法，${sideName(outcome.winner!)}获胜（将死）。` :
    outcome?.reason === 'stalemate' ? `${sideName(session.game.turn)}虽未被将军，但没有任何合法着法，判负；${sideName(outcome.winner!)}获胜（困毙）。` :
    outcome?.reason === 'natural-limit' ? '连续 120 着没有吃子，达到自然限着，本局和棋。' :
    outcome?.reason === 'resignation' ? `${sideName(outcome.winner === 'red' ? 'black' : 'red')}认输，${sideName(outcome.winner!)}获胜。` :
    outcome?.reason === 'agreement' ? '双方同意议和，本局和棋。' : ''

  return <div className="workspace">
    <section className="board-column" aria-label="对弈">
      <div className="board-heading">
        <div><p className="eyebrow">棋局</p><h2>{session.mode === 'ai' ? '人机练习' : '本机双人'}</h2></div>
        <span className={`turn-badge ${showing.turn}`} aria-live="polite">{status}</span>
      </div>
      <Board board={showing.board} orientation={orientation} selected={selected} legalTargets={targets} lastMove={lastMove} checkedSide={checked} onCell={handleCell} onCancel={() => setSelected(null)} />
      <p className="status-line" role="status">{thinking ? '电脑正在思考…' : notice}</p>
      <div className="board-controls">
        <span className="board-view-label" aria-live="polite">当前视角：{sideName(orientation)}在下 · {preferences.boardView === 'auto' ? '跟随执棋方' : '手动选择'}</span>
        <button type="button" onClick={() => onPreferencesChange({ boardView: orientation === 'red' ? 'black' : 'red' })}>翻转棋盘</button>
        <button type="button" onClick={() => onPreferencesChange({ boardView: 'auto' })} disabled={preferences.boardView === 'auto'}>跟随执棋方</button>
        <button type="button" onClick={() => { onChange(undo(session)); setSelected(null) }} disabled={!session.records.length || thinking}>悔棋</button>
        <button type="button" onClick={() => start(session.mode, session.playerSide)}>重新开局</button>
        <button type="button" onClick={copyRecord} disabled={!session.records.length}>复制棋谱</button>
        {onCollect ? <button type="button" className="collection-action" onClick={onCollect}>收藏本局</button> : null}
        {onExport ? <button type="button" className="collection-action" onClick={onExport}>导出本局</button> : null}
        <button type="button" onClick={() => onTerm('notation')}>看懂棋谱</button>
        <button type="button" onClick={() => onHelpChange('rules')}>查规则</button>
      </div>
      {collectionNotice ? <p className="collection-notice" aria-live="polite">{collectionNotice}</p> : null}
      {learningMatch && !learningMatch.standardStart ? <p className="coach-history">局面练习，不参与首盘记录。</p> : null}
    </section>
    <aside className={`side-column${help ? ' side-column--help' : ''}`}>
      {help ? <>
        <div className="help-toolbar panel"><button type="button" onClick={() => onHelpChange(null)}>返回棋局工具</button><span>资料显示在棋盘旁，当前棋局仍可操作。</span></div>
        {help === 'terms' ? <GlossaryLibrary initialId={termId} /> : null}
        {help === 'rules' ? <RulesLibrary /> : null}
        {help === 'openings' ? <OpeningLibrary onPractice={onOpeningPractice} /> : null}
      </> : <>
      {outcome ? <section className="panel match-summary" aria-label="本局小结">
        <p className="eyebrow">本局已结束</p><h3>本局小结</h3>
        <p className="summary-outcome">{resultExplanation}</p>
        <p className="muted">共 {session.records.length} 着 · {Math.floor(session.records.length / 2)} 个完整回合{session.records.length % 2 ? '，另有 1 着' : ''}。</p>
        <p className="muted">红方 {redMoves} 着 · 黑方 {blackMoves} 着。</p>
        {learningMatch?.toolMoveUsed ? <p className="coach-history">本局曾使用工具代走，本局不计独立首盘。</p> : null}
        {reviewing ? <p className="summary-review-note">棋盘正在回看第 {session.viewIndex} 着；小结仍说明本局最终结果。</p> : null}
        {(milestones.firstMatch || milestones.independentMatch) ? <div className="match-milestones" aria-label="学习里程碑">
          {milestones.firstMatch ? <span>已完成首盘</span> : null}
          {milestones.independentMatch ? <span>已完成独立首盘</span> : null}
        </div> : null}
        <div className="review-controls">
          <button type="button" onClick={() => { onChange(setView(session, 0)); setSelected(null) }}>从头回看棋谱</button>
          <button type="button" onClick={() => onLearn()}>返回课堂复习</button>
          <button type="button" onClick={() => outcome.reason === 'resignation' ? onHelpChange('rules') : onTerm(outcome.reason === 'agreement' ? 'draw' : outcome.reason)}>查看结束规则</button>
        </div>
        <section className="summary-related-lessons" aria-label="本局相关课程">
          <h4>从本局回课堂</h4>
          <p className="muted">依据本局的结束原因和棋谱记录，选择知识点复习。</p>
          {reviewLessons.map(lesson => <div className="summary-lesson" key={lesson.unitId}>
            <p>{lesson.basis}</p>
            <div className="review-controls"><button type="button" onClick={() => onLearn(lesson.unitId)}>复习：{lesson.title}</button></div>
          </div>)}
        </section>
      </section> : null}
      {checkpointVisible && !outcome ? <section className="panel match-checkpoint" aria-label="十回合提醒">
        <p className="eyebrow">第一段实战</p><h3>已经下满十回合</h3>
        <p aria-live="polite">已走 {session.records.length} 着，完成 {Math.floor(session.records.length / 2)} 个完整回合{session.records.length % 2 ? '，另有 1 着' : ''}。先看将帅安全，再检查双方威胁，按自己的观察继续下棋。</p>
        <p className="muted">可以继续下棋，刷新后可恢复本局。</p>
        <div className="review-controls"><button type="button" onClick={() => setCheckpointVisible(false)}>继续下棋</button><button type="button" onClick={() => onLearn()}>回课堂复习</button></div>
      </section> : null}
      {session.mode === 'ai' && learningMatch?.active && !outcome ? <section className="panel match-coach" aria-label="实战教练">
        <div className="panel-title"><div><p className="eyebrow">观察顺序</p><h3>实战教练</h3></div><span>{learningMatch.coachEnabled ? '已开启' : '已关闭'}</span></div>
        <button type="button" className="coach-toggle" aria-pressed={learningMatch.coachEnabled} onClick={() => onCoachChange(!learningMatch.coachEnabled)}>{learningMatch.coachEnabled ? '关闭实战教练' : '开启实战教练'}</button>
        {learningMatch.coachEnabled ? <>
          <p className="coach-position" aria-live="polite">当前实战：{sideName(session.game.turn)}行棋{coachCheck ? '，正被将军，必须先应将。' : '，将帅暂未被将军。'}{reviewing ? '棋盘正在回看，下面的观察仍针对实战最新局面。' : ''}</p>
          <ol className="coach-observations">
            <li><strong>先看将帅安全。</strong>{coachCheck ? '观察移动将帅、吃掉攻击子或挡住攻击线，哪些方式能解除将军。' : '检查双方将帅的攻击线，移动中路棋子前留意照面。'}</li>
            <li><strong>再看双方威胁。</strong>{session.records.at(-1)?.captured ? '刚发生了吃子，重新检查留下的攻击线和互相保护。' : '留意对方刚走的棋子攻击了哪里，再检查自己的棋子是否有人保护。'}</li>
            <li><strong>最后检查走法。</strong>观察车路是否通畅、马腿是否被挡、炮吃子时是否恰有一个炮架。</li>
          </ol>
          <button type="button" className="coach-term" onClick={() => onTerm(coachCheck ? 'respond' : 'defended')}>{coachCheck ? '复习应将' : '复习有根子'}</button>
        </> : <p className="muted">开启后，按顺序观察将帅、威胁和走法，再自己决定下一着。</p>}
        {!learningMatch.standardStart ? <p className="coach-history">可使用教练观察本局；此次局面练习不授予首盘或独立首盘里程碑。</p> : learningMatch.toolMoveUsed ? <p className="coach-history">本局曾使用工具代走{learningMatch.coachEverUsed ? '，也已使用教练' : '，尚未使用教练'}。可完成首盘；独立首盘需从新局开始自行走棋并全程关闭教练。</p> : learningMatch.coachEverUsed ? <p className="coach-history">本局已使用教练，可完成首盘；独立首盘需从新局开始全程关闭教练。</p> : <p className="coach-history">本局尚未使用教练；完成标准开局的正式终局，可记录独立首盘。</p>}
      </section> : null}
      <section className="panel mode-panel">
        <p className="eyebrow">对弈方式</p><h3>选一场棋</h3>
        <div className="mode-options">
          <button type="button" className={session.mode === 'local' ? 'active' : ''} onClick={() => start('local')}>本机双人</button>
          <button type="button" className={session.mode === 'ai' && session.playerSide === 'red' ? 'active' : ''} onClick={() => start('ai', 'red')}>执红对电脑</button>
          <button type="button" className={session.mode === 'ai' && session.playerSide === 'black' ? 'active' : ''} onClick={() => start('ai', 'black')}>执黑对电脑</button>
        </div>
        <p className="muted">红先行。点选棋子会显示合法落点；电脑仅供入门练习。</p>
        <label className="difficulty-control">电脑难度
          <select value={preferences.aiDifficulty} disabled={thinking} aria-describedby="difficulty-help" onChange={event => onPreferencesChange({ aiDifficulty: normalizeDifficulty(event.target.value) })}>
            {(['easy', 'normal', 'challenge'] as const).map(value => <option key={value} value={value}>{difficultyProfiles[value].label}</option>)}
          </select>
        </label>
        <p id="difficulty-help" className="muted">{difficultyProfiles[preferences.aiDifficulty].help}</p>
      </section>
      <CapturedPieces session={session} />
      <MoveReview session={session} onChange={onChange} onSeek={() => setSelected(null)} thinking={thinking} persistenceStatus={persistenceStatus} />
      <section className="panel fair-play">
        <p className="eyebrow">结束与和棋</p>
        {session.mode === 'local' && !outcome && <div className="review-controls">
          {!session.drawOfferedBy ? <button type="button" onClick={() => onChange(offerDraw(session, session.game.turn))}>提和</button> : <>
            <button type="button" onClick={() => onChange(acceptDraw(session, session.drawOfferedBy === 'red' ? 'black' : 'red'))}>接受提和</button>
            <button type="button" onClick={() => onChange({ ...session, drawOfferedBy: null })}>拒绝</button>
          </>}
        </div>}
        <button type="button" className="text-danger" disabled={Boolean(outcome)} onClick={() => { if (window.confirm('确定认输并结束本局吗？')) onChange(resign(session, session.mode === 'ai' ? session.playerSide : session.game.turn)) }}>认输</button>
      </section>
      </>}
    </aside>
  </div>
}
