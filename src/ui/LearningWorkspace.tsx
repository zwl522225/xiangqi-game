import { useEffect, useRef, useState } from 'react'
import type { LearningOverview as Overview, OverviewDestination } from '../core/learning-overview'
import type { Progress } from '../core/storage'
import { LessonCourse } from './LessonCourse'
import { LearningOverview, type OverviewPersistence } from './LearningOverview'

export function LearningWorkspace({ progress, onProgress, onTerm, onPracticeAi, initialUnitId, entrySequence, overview, persistence, onNavigate }: {
  progress: Progress; onProgress: (update: (previous: Progress) => Progress) => void
  onTerm: (id: string) => void; onPracticeAi: (coachEnabled: boolean) => void
  initialUnitId?: string; entrySequence: number; overview: Overview; persistence: OverviewPersistence
  onNavigate: (destination: OverviewDestination) => void
}) {
  const [mode, setMode] = useState<'course' | 'overview'>('course')
  const [navigationRequest, setNavigationRequest] = useState<{ unitId: string; sequence: number }>()
  const courseHeading = useRef<HTMLHeadingElement>(null)
  const overviewHeading = useRef<HTMLHeadingElement>(null)
  // Main navigation explicitly returns to ordinary chapter learning.
  useEffect(() => { setMode('course') }, [entrySequence])
  useEffect(() => { (mode === 'course' ? courseHeading : overviewHeading).current?.focus() }, [mode, navigationRequest, entrySequence])
  function navigate(destination: OverviewDestination) {
    if (destination.kind !== 'lesson') { onNavigate(destination); return }
    setNavigationRequest(previous => ({ unitId: destination.unitId, sequence: (previous?.sequence ?? 0) + 1 }))
    setMode('course')
  }
  return <div className="learning-workspace">
    <div className="learning-actions learning-workspace-modes" aria-label="课堂视图">
      <button type="button" aria-pressed={mode === 'course'} onClick={() => setMode('course')}>章节学习</button>
      <button type="button" aria-pressed={mode === 'overview'} onClick={() => setMode('overview')}>学习总览</button>
    </div>
    <div data-learning-panel="course" hidden={mode !== 'course'}>
      <h2 className="workspace-heading" ref={courseHeading} tabIndex={-1}>章节学习</h2>
      <LessonCourse progress={progress} onProgress={onProgress} onTerm={onTerm} onPracticeAi={onPracticeAi} initialUnitId={initialUnitId} navigationRequest={navigationRequest} />
    </div>
    {mode === 'overview' ? <LearningOverview overview={overview} persistence={persistence} onNavigate={navigate} headingRef={overviewHeading} /> : null}
  </div>
}
