import type { LearningBackupController } from './useLearningBackup'
import { useEffect, useRef, useState } from 'react'
import type { LearningOverview as Overview, OverviewDestination } from '../core/learning-overview'
import type { Progress } from '../core/storage'
import { LessonCourse } from './LessonCourse'
import { LearningOverview, type OverviewPersistence } from './LearningOverview'
import { LearningBackup } from './LearningBackup'

export function LearningWorkspace({ progress, onProgress, onTerm, onPracticeAi, initialUnitId, entrySequence, overview, persistence, onNavigate, backupController }: {
  backupController?: LearningBackupController
  progress: Progress; onProgress: (update: (previous: Progress) => Progress) => void
  onTerm: (id: string) => void; onPracticeAi: (coachEnabled: boolean) => void
  initialUnitId?: string; entrySequence: number; overview: Overview; persistence: OverviewPersistence
  onNavigate: (destination: OverviewDestination) => void
}) {
  const [mode, setMode] = useState<'course' | 'overview' | 'backup'>('course')
  const [backupOpened, setBackupOpened] = useState(false)
  const [courseEpoch, setCourseEpoch] = useState(0)
  const [courseResult, setCourseResult] = useState('')
  const [navigationRequest, setNavigationRequest] = useState<{ unitId: string; sequence: number }>()
  const courseHeading = useRef<HTMLHeadingElement>(null)
  const overviewHeading = useRef<HTMLHeadingElement>(null)
  // Main navigation explicitly returns to ordinary chapter learning.
  useEffect(() => { setMode('course') }, [entrySequence])
  useEffect(() => { if (mode !== 'backup') (mode === 'course' ? courseHeading : overviewHeading).current?.focus() }, [mode, navigationRequest, entrySequence])
  function navigate(destination: OverviewDestination) {
    if (destination.kind !== 'lesson') { onNavigate(destination); return }
    setNavigationRequest(previous => ({ unitId: destination.unitId, sequence: (previous?.sequence ?? 0) + 1 }))
    setMode('course')
  }
  return <div className="learning-workspace">
    <div className="learning-actions learning-workspace-modes" aria-label="课堂视图">
      <button type="button" aria-pressed={mode === 'course'} onClick={() => setMode('course')}>章节学习</button>
      <button type="button" aria-pressed={mode === 'overview'} onClick={() => setMode('overview')}>学习总览</button>
      <button type="button" onClick={() => navigate({ kind: 'lesson', unitId: overview.notation.entryUnitId })}>棋谱识读专项</button>
    </div>
    <div data-learning-panel="course" hidden={mode !== 'course'}>
      <h2 className="workspace-heading" ref={courseHeading} tabIndex={-1}>章节学习</h2>
      <LessonCourse key={courseEpoch} progress={progress} onProgress={onProgress} onTerm={onTerm} onPracticeAi={onPracticeAi} initialUnitId={initialUnitId} navigationRequest={navigationRequest} />
    </div>
    {mode === 'overview' ? <><LearningOverview overview={overview} persistence={persistence} onNavigate={navigate} headingRef={overviewHeading} onBackup={backupController ? () => { setBackupOpened(true); setMode('backup') } : undefined} />{courseResult ? <p role="status" aria-label="课堂恢复结果">{courseResult}</p> : null}</> : null}
    {backupOpened && backupController ? <div data-learning-panel="backup" hidden={mode !== 'backup'}><LearningBackup controller={backupController} active={mode === 'backup'} onBack={() => setMode('overview')} onCourseRestored={message => { setCourseResult(message); setNavigationRequest(undefined); setCourseEpoch(previous => previous + 1); setMode('overview') }} /></div> : null}
  </div>
}
