import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { defaultProgress, loadProgress, saveProgress } from '../core/storage'
import type { Progress } from '../core/storage'
import { defaultPreferences, loadPreferences, savePreferences } from '../core/preferences'
import type { Preferences } from '../core/preferences'
import { createSession } from '../core/session'
import type { Session } from '../core/session'
import type { Game } from '../core/rules'
import { Match } from './Match'
import type { HelpSection } from './Match'
import { Learn } from './Learn'
import { LessonCourse } from './LessonCourse'
import { Practice } from './Practice'
import type { PracticeAction } from './Practice'
import { defaultPractice, startPractice, submitPractice, showPracticeHint, showPracticeAnswer, retryPractice, skipPractice, nextPractice } from '../core/practice'
import { awardMatchMilestones, setCoachEnabled, startLearningMatch } from '../core/learning'
import { GlossaryLibrary, OpeningLibrary, RulesLibrary } from './Library'
import { registerGameTools } from './gameTools'
import '../styles.css'

type Section = 'match' | 'learn' | 'practice' | 'openings' | 'terms' | 'puzzles' | 'rules'

// Replay only an eligible terminal match with an award still available.
function awardPendingMatch(progress: Progress): Progress {
  const match = progress.learningMatch
  const reason = progress.session.game.result?.reason
  if (!match?.active || !match.standardStart || progress.session.mode !== 'ai' ||
    (reason !== 'checkmate' && reason !== 'stalemate' && reason !== 'natural-limit') ||
    (progress.milestones.firstMatch && (progress.milestones.independentMatch || match.coachEverUsed || match.toolMoveUsed))) return progress
  return awardMatchMilestones(progress, progress.session)
}

function updateSession(progress: Progress, session: Session): Progress {
  const next = { ...progress, session }
  return !progress.session.game.result && session.game.result ? awardPendingMatch(next) : next
}

export function App() {
  const [progress, setProgress] = useState(() => typeof window === 'undefined' ? defaultProgress() : awardPendingMatch(loadProgress(window.localStorage)))
  const [preferences, setPreferences] = useState(() => {
    try { return typeof window === 'undefined' ? defaultPreferences() : loadPreferences(window.localStorage) }
    catch { return defaultPreferences() }
  })
  const [section, setSection] = useState<Section>('match')
  const [matchHelp, setMatchHelp] = useState<HelpSection>(null)
  const [termId, setTermId] = useState('intersection')
  const [courseUnitId, setCourseUnitId] = useState<string | undefined>()
  const [persisted, setPersisted] = useState<{ progress: Progress; ok: boolean } | null>(null)
  const sessionRef = useRef(progress.session)
  sessionRef.current = progress.session
  const changeSession = useCallback((session: Session) => setProgress(previous => updateSession(previous, session)), [])
  const changePreferences = useCallback((changes: Partial<Preferences>) => setPreferences(previous => ({ ...previous, ...changes })), [])
  const startSession = useCallback((session: Session) => setProgress(previous => startLearningMatch(previous, session)), [])
  const changeCoach = useCallback((enabled: boolean) => setProgress(previous => setCoachEnabled(previous, enabled)), [])
  const checkpointSeen = useCallback(() => setProgress(previous => previous.learningMatch ? {
    ...previous, learningMatch: { ...previous.learningMatch, checkpointSeen: true },
  } : previous), [])
  const solvePuzzle = useCallback((id: string) => setProgress(previous => ({ ...previous, solvedPuzzles: [...new Set([...previous.solvedPuzzles, id])] })), [])
  const practiceAction = useCallback((action: PracticeAction) => setProgress(previous => {
    const data = previous.practice ?? defaultPractice()
    const next = action.type === 'start' ? startPractice(data, action.request, previous) :
      action.type === 'submit' ? submitPractice(data, action.submission) :
      action.type === 'hint' ? showPracticeHint(data) : action.type === 'answer' ? showPracticeAnswer(data) :
      action.type === 'retry' ? retryPractice(data) : action.type === 'skip' ? skipPractice(data) :
      action.type === 'next' ? nextPractice(data) : defaultPractice()
    return next === data ? previous : { ...previous, practice: next }
  }), [])
  const practice = useCallback((game: Game) => {
    if (!progress.session.game.result && progress.session.records.length > 0 && !window.confirm('当前对局尚未结束。要用所选棋路局面开始新对局吗？')) return
    const session = createSession('local')
    const fromPosition = { ...session, game, snapshots: [game] }
    setProgress(previous => startLearningMatch(previous, fromPosition))
    setSection('match')
    setMatchHelp(null)
  }, [progress.session.records.length, progress.session.game.result])
  const practiceAi = useCallback((coachEnabled: boolean) => {
    if (!progress.session.game.result && progress.session.records.length > 0 && !window.confirm('当前对局尚未结束。要开始新的人机练习吗？')) return
    setProgress(previous => setCoachEnabled(startLearningMatch(previous, createSession('ai', 'red')), coachEnabled))
    setSection('match')
    setMatchHelp(null)
  }, [progress.session.records.length, progress.session.game.result])
  const openTerm = (id: string) => {
    setTermId(id)
    if (section === 'match') setMatchHelp('terms')
    else setSection('terms')
  }
  const openLesson = (unitId?: string) => {
    setCourseUnitId(unitId)
    setSection('learn')
    setMatchHelp(null)
  }
  const navigate = (next: Section) => {
    if (next === 'learn') setCourseUnitId(undefined)
    if (section === 'match' && (next === 'openings' || next === 'terms' || next === 'rules')) setMatchHelp(next)
    else { setSection(next); setMatchHelp(null) }
  }

  useEffect(() => {
    let ok = false
    try { ok = saveProgress(window.localStorage, progress) } catch { /* Access to localStorage can also fail. */ }
    setPersisted({ progress, ok })
  }, [progress])
  useEffect(() => {
    try { savePreferences(window.localStorage, preferences) } catch { /* Storage access can be blocked by the browser. */ }
  }, [preferences])
  useEffect(() => registerGameTools(() => sessionRef.current, session => {
    flushSync(() => {
      setProgress(previous => {
        const match = previous.learningMatch
        // This callback runs only after play_move succeeds. Record its human AI move before awarding.
        const toolPlayedHuman = match?.active && session.mode === 'ai' && session.records.at(-1)?.side === session.playerSide
        const fromTool = toolPlayedHuman ? { ...previous, learningMatch: { ...match, toolMoveUsed: true } } : previous
        return updateSession(fromTool, session)
      })
      setSection('match')
      setMatchHelp(null)
    })
  }), [])

  const navigation: { id: Section; label: string }[] = [
    { id: 'match', label: '开始对弈' }, { id: 'learn', label: '新手课堂' }, { id: 'practice', label: '主题练习' },
    { id: 'openings', label: '棋路馆' }, { id: 'terms', label: '术语词典' },
    { id: 'puzzles', label: '残局练习' }, { id: 'rules', label: '规则手册' },
  ]

  return <div className="app-shell">
    <header className="site-header">
      <div className="header-inner">
        <div className="brand" aria-label="弈象，中国象棋入门">
          <span className="brand-seal" aria-hidden="true">象</span>
          <div><h1>弈象</h1><span>中国象棋入门</span></div>
        </div>
        <nav className="main-nav" aria-label="主导航">
          {navigation.map(item => <button key={item.id} type="button" className={(matchHelp ?? section) === item.id ? 'active' : ''} aria-current={(matchHelp ?? section) === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>{item.label}</button>)}
        </nav>
      </div>
    </header>
    <main className="page-content">
      {section === 'match' ? <Match session={progress.session} preferences={preferences} onPreferencesChange={changePreferences} onChange={changeSession} onStart={startSession} learningMatch={progress.learningMatch} milestones={progress.milestones} onCoachChange={changeCoach} onCheckpointSeen={checkpointSeen} onLearn={openLesson} help={matchHelp} onHelpChange={setMatchHelp} onOpeningPractice={practice} termId={termId} onTerm={openTerm} persistenceStatus={persisted?.progress !== progress ? 'pending' : persisted.ok ? 'saved' : 'failed'} /> : null}
      {section === 'learn' ? <LessonCourse key={courseUnitId ?? 'overview'} initialUnitId={courseUnitId} progress={progress} onProgress={setProgress} onPracticeAi={practiceAi} onTerm={openTerm} /> : null}
      {section === 'practice' ? <Practice data={progress.practice ?? defaultPractice()} onAction={practiceAction} onLearn={openLesson} persistenceStatus={persisted?.progress !== progress ? 'pending' : persisted.ok ? 'saved' : 'failed'} /> : null}
      {section === 'openings' ? <OpeningLibrary onPractice={practice} /> : null}
      {section === 'terms' ? <GlossaryLibrary initialId={termId} /> : null}
      {section === 'puzzles' ? <Learn kind="puzzle" completed={progress.solvedPuzzles} onComplete={solvePuzzle} onTerm={openTerm} /> : null}
      {section === 'rules' ? <RulesLibrary /> : null}
    </main>
    <footer className="site-footer">弈象 · 从第一着开始，慢慢看懂每一步。</footer>
  </div>
}
