import { endgames } from '../content/endgames'
import { defaultEndgameLessons, endgameFinished, type EndgameData } from './endgame-lessons'
import { curriculum } from '../content/curriculum'
import { lessons } from '../content/lessons'
import { openings } from '../content/openings'
import { practiceExercises } from '../content/practice'
import { puzzles } from '../content/puzzles'
import { tactics } from '../content/tactics'
import type { OpeningTrainingData } from './opening-training'
import type { PracticeItem } from './practice'
import type { Progress } from './storage'
import type { TacticsData, TacticsItem } from './tactics'
import type { Side } from './types'

export type OverviewDestination = { kind: 'lesson'; unitId: string } | { kind: 'single' | 'opening' | 'tactics' | 'endgame' | 'match' }
export type LearningOverviewInput = {
  progress: Progress
  endgame?: EndgameData
  endgameBlocked?: boolean
  opening: OpeningTrainingData
  tactics: TacticsData
  openingBlocked: boolean
  tacticsBlocked: boolean
}
export type OverviewSuggestion = { destination: OverviewDestination; title: string; reason: string }
export type OverviewChapter = {
  id: string; title: string; total: number; mastered: number
  /** Practiced units that have not been mastered. */
  practiced: number
  unrecorded: number; legacyCompleted: boolean; destination: OverviewDestination
}
export type OverviewCourse = {
  total: number; mastered: number; practiced: number; unrecorded: number
  legacyCompleted: number; chapters: OverviewChapter[]
}
export type OverviewSingleRound = {
  index: number; total: number; completed: number; independent: number; assisted: number; skipped: number
  currentTitle: string | null; waitingNext: boolean; finished: boolean
}
export type OverviewTacticsRound = OverviewSingleRound & { revealed: number; temporary: boolean }
export type OverviewOpeningRound = {
  openingId: string; title: string; side: Side; ply: number; total: number; finished: boolean; temporary: boolean
}
export type OverviewEndgameRound = Omit<OverviewOpeningRound, 'openingId'> & { id: string }
export type OverviewPendingRound = OverviewSuggestion & {
  completed: number; total: number; waitingNext: boolean; temporary: boolean
}
export type OverviewOpeningHistory = { completed: number; unassisted: number }
export type OverviewTacticsHistory = { completed: number; independent: number; pendingReview: number }
export type LearningOverview = {
  course: OverviewCourse
  single: { total: number; attempted: number; pendingReview: number; round: OverviewSingleRound | null }
  /** total is the known catalog size; null history means unavailable historical records. */
  opening: { total: number; history: OverviewOpeningHistory | null; round: OverviewOpeningRound | null }
  tactics: { total: number; history: OverviewTacticsHistory | null; round: OverviewTacticsRound | null }
  endgame: { total: number; history: { completed: number; independent: number } | null; round: OverviewEndgameRound | null }
  puzzles: { total: number; solved: number }
  milestones: { firstMatch: boolean; independentMatch: boolean }
  pendingRounds: OverviewPendingRound[]
  suggestion: OverviewSuggestion
}

type CatalogItem = { id: string; version: number; title: string }
type RoundItem = Pick<PracticeItem | TacticsItem, 'id' | 'version' | 'result'>

/** Keep the original cursor relationship while omitting unknown, stale and duplicate references. */
function roundSummary(round: { index: number; items: RoundItem[] } | null, catalog: CatalogItem[]) {
  if (!round || !Number.isInteger(round.index) || round.index < 0 || round.index > round.items.length) return null
  const seen = new Set<string>()
  const valid = round.items.flatMap((item, sourceIndex) => {
    const entry = catalog.find(entry => entry.id === item.id && entry.version === item.version)
    if (!entry || seen.has(item.id)) return []
    seen.add(item.id)
    return [{ item, sourceIndex, title: entry.title }]
  })
  if (!valid.length) return null
  const finished = round.index === round.items.length
  const index = finished ? valid.length : valid.findIndex(entry => entry.sourceIndex === round.index)
  if (index < 0) return null
  const count = (result: RoundItem['result']) => valid.filter(entry => entry.item.result === result).length
  const independent = count('independent'), assisted = count('assisted'), skipped = count('skipped'), revealed = count('revealed')
  return {
    index, total: valid.length, completed: independent + assisted + skipped + revealed,
    independent, assisted, skipped, revealed,
    currentTitle: finished ? null : valid[index].title,
    waitingNext: !finished && valid[index].item.result !== null, finished,
  }
}

export function learningOverview(input: LearningOverviewInput): LearningOverview {
  const { progress, opening, tactics: tacticData } = input
  const units = curriculum.flatMap(chapter => chapter.units)
  const mastered = new Set(progress.masteredUnits)
  const practiced = new Set(progress.practicedUnits)
  const legacy = new Set(progress.completedLessons.filter(id => lessons.some(lesson => lesson.id === id)))
  const chapters: OverviewChapter[] = curriculum.map(chapter => {
    const masteredCount = chapter.units.filter(unit => mastered.has(unit.id)).length
    const practicedCount = chapter.units.filter(unit => !mastered.has(unit.id) && practiced.has(unit.id)).length
    const target = chapter.units.find(unit => !mastered.has(unit.id)) ?? chapter.units[0]
    return {
      id: chapter.id, title: chapter.title, total: chapter.units.length,
      mastered: masteredCount, practiced: practicedCount, unrecorded: chapter.units.length - masteredCount - practicedCount,
      legacyCompleted: legacy.has(chapter.id), destination: { kind: 'lesson', unitId: target.id },
    }
  })
  const course: OverviewCourse = {
    total: units.length, mastered: chapters.reduce((n, chapter) => n + chapter.mastered, 0),
    practiced: chapters.reduce((n, chapter) => n + chapter.practiced, 0),
    unrecorded: chapters.reduce((n, chapter) => n + chapter.unrecorded, 0),
    legacyCompleted: chapters.filter(chapter => chapter.legacyCompleted).length, chapters,
  }
  const practice = progress.practice?.version === 1 ? progress.practice : null
  const singleRecords = practiceExercises.flatMap(exercise => {
    const record = practice?.records[exercise.id]
    return record?.version === exercise.version ? [record] : []
  })
  const singleSummary = roundSummary(practice?.round ?? null, practiceExercises)
  const singleRound: OverviewSingleRound | null = singleSummary && {
    index: singleSummary.index, total: singleSummary.total, completed: singleSummary.completed,
    independent: singleSummary.independent, assisted: singleSummary.assisted, skipped: singleSummary.skipped,
    currentTitle: singleSummary.currentTitle, waitingNext: singleSummary.waitingNext, finished: singleSummary.finished,
  }
  const single: LearningOverview['single'] = {
    total: practiceExercises.length, attempted: singleRecords.filter(record => record.attempts > 0).length,
    pendingReview: singleRecords.filter(record => record.review === 'pending').length, round: singleRound,
  }

  const openingAvailable = !input.openingBlocked && opening.version === 1
  const openingGroups = openings.flatMap(route => (['red', 'black'] as const).map(side => {
    const records = openingAvailable ? opening.groups.filter(group => group.openingId === route.id && group.openingVersion === route.version && group.side === side) : []
    return {
      route, side, completed: records.some(record => record.completed),
      unassisted: records.some(record => record.completed && record.unassisted),
    }
  }))
  const active = opening.version === 1 ? opening.active : null
  const route = active && openings.find(route => route.id === active.openingId && route.version === active.openingVersion)
  const openingRound: OverviewOpeningRound | null = active && route &&
    (active.side === 'red' || active.side === 'black') && Number.isInteger(active.ply) && active.ply >= 0 && active.ply <= route.steps.length
    ? { openingId: route.id, title: route.title, side: active.side, ply: active.ply, total: route.steps.length,
        finished: active.ply === route.steps.length, temporary: input.openingBlocked }
    : null
  const openingOverview: LearningOverview['opening'] = {
    total: openingGroups.length,
    history: openingAvailable ? { completed: openingGroups.filter(group => group.completed).length, unassisted: openingGroups.filter(group => group.unassisted).length } : null,
    round: openingRound,
  }

  const tacticsAvailable = !input.tacticsBlocked && tacticData.version === 1
  const tacticRecords = tactics.map(tactic => {
    const records = tacticsAvailable ? tacticData.records.filter(record => record.id === tactic.id && record.version === tactic.version) : []
    return {
      tactic, completed: records.some(record => record.everCompleted),
      independent: records.some(record => record.everCompleted && record.everIndependent),
      pendingReview: records.some(record => record.review === 'pending'),
    }
  })
  const tacticSummary = roundSummary(tacticData.version === 1 ? tacticData.round : null, tactics)
  const tacticsRound: OverviewTacticsRound | null = tacticSummary && { ...tacticSummary, temporary: input.tacticsBlocked }
  const tacticsOverview: LearningOverview['tactics'] = {
    total: tactics.length,
    history: tacticsAvailable ? {
      completed: tacticRecords.filter(record => record.completed).length,
      independent: tacticRecords.filter(record => record.independent).length,
      pendingReview: tacticRecords.filter(record => record.pendingReview).length,
    } : null,
    round: tacticsRound,
  }

  const endgame = input.endgame ?? defaultEndgameLessons()
  const endgameAvailable = !input.endgameBlocked && endgame.version === 1
  const endgameActive = endgame.round
  const endgameLesson = endgames.find(lesson => lesson.id === endgameActive?.id && lesson.version === endgameActive.version)
  const endgameRound: OverviewEndgameRound | null = endgameActive && endgameLesson ? {
    id: endgameLesson.id, title: endgameLesson.title, side: endgameLesson.side,
    ply: endgameActive.ply, total: endgameLesson.line.length, finished: endgameFinished(endgame), temporary: Boolean(input.endgameBlocked),
  } : null
  const endgameOverview: LearningOverview['endgame'] = {
    total: endgames.length,
    history: endgameAvailable ? {
      completed: endgames.filter(lesson => endgame.records[lesson.id]?.version === lesson.version && endgame.records[lesson.id].completed).length,
      independent: endgames.filter(lesson => endgame.records[lesson.id]?.version === lesson.version && endgame.records[lesson.id].completed && endgame.records[lesson.id].independent).length,
    } : null,
    round: endgameRound,
  }

  const pendingRounds: OverviewPendingRound[] = []
  const questionReason = (waitingNext: boolean) => waitingNext
    ? '本题已结束，尚未进入下一题/小结。' : '这一轮尚有题目或结果待继续查看。'
  if (singleRound && !singleRound.finished) pendingRounds.push({
    destination: { kind: 'single' }, title: '前往单步练习', reason: questionReason(singleRound.waitingNext),
    completed: singleRound.completed, total: singleRound.total, waitingNext: singleRound.waitingNext, temporary: false,
  })
  if (openingRound && !openingRound.finished) pendingRounds.push({
    destination: { kind: 'opening' }, title: '前往开局跟练',
    reason: `${openingRound.title}，执${openingRound.side === 'red' ? '红' : '黑'}，已走 ${openingRound.ply}/${openingRound.total} 着。${openingRound.temporary ? '临时练习，原记录受保护。' : ''}`,
    completed: openingRound.ply, total: openingRound.total, waitingNext: false, temporary: openingRound.temporary,
  })
  if (tacticsRound && !tacticsRound.finished) pendingRounds.push({
    destination: { kind: 'tactics' }, title: '前往多步战术',
    reason: `${questionReason(tacticsRound.waitingNext)}${tacticsRound.temporary ? '临时练习，原记录受保护。' : ''}`,
    completed: tacticsRound.completed, total: tacticsRound.total, waitingNext: tacticsRound.waitingNext, temporary: tacticsRound.temporary,
  })

  let suggestion: OverviewSuggestion
  if (pendingRounds.length) {
    const { destination, title, reason } = pendingRounds[0]
    suggestion = { destination, title, reason }
  } else if (single.pendingReview) {
    suggestion = { destination: { kind: 'single' }, title: '前往单步练习', reason: `有 ${single.pendingReview} 道单步错题待复习。` }
  } else if (tacticsOverview.history?.pendingReview) {
    suggestion = { destination: { kind: 'tactics' }, title: '前往多步战术', reason: `有 ${tacticsOverview.history.pendingReview} 道多步错题待复习。` }
  } else {
    const unit = units.find(unit => !mastered.has(unit.id))
    const incompleteOpening = openingAvailable && openingGroups.find(group => !group.completed)
    const incompleteTactic = tacticsAvailable && tacticRecords.find(record => !record.completed)
    if (unit) {
      const exhausted = unit.variants.length > 0 && unit.variants.every(variant => progress.assistedVariants.includes(variant.id))
      const review = practiced.has(unit.id) || exhausted
      suggestion = {
        destination: { kind: 'lesson', unitId: unit.id }, title: `${review ? '复习' : '学习'}：${unit.title}`,
        reason: exhausted ? '可复习，当前未见变式已用完；重复旧题不会新增掌握。'
          : review ? '这个知识点已有练习记录，尚未记录掌握。' : '这个知识点暂无知识点记录，可以从演示开始学习。',
      }
    } else if (incompleteOpening) {
      suggestion = { destination: { kind: 'opening' }, title: '前往开局跟练', reason: `${incompleteOpening.route.title}，执${incompleteOpening.side === 'red' ? '红' : '黑'}，尚无本组完成记录。` }
    } else if (incompleteTactic) {
      suggestion = { destination: { kind: 'tactics' }, title: '前往多步战术', reason: `${incompleteTactic.tactic.title}尚无完成记录。` }
    } else {
      suggestion = { destination: { kind: 'match' }, title: '返回正式对局',
        reason: `可以自由复习，或返回当前对局。${progress.milestones.firstMatch ? '' : '首盘里程碑尚无记录，可到对弈页开始或继续完整对局。'}` }
    }
  }
  // Keep the original recommendation priority; the extra resumable round is informational.
  if (endgameRound && !endgameRound.finished) pendingRounds.push({
    destination: { kind: 'endgame' }, title: '前往残局分步教学',
    reason: `${endgameRound.title}，执${endgameRound.side === 'red' ? '红' : '黑'}，请进入目录后主动继续。`,
    completed: endgameRound.ply, total: endgameRound.total, waitingNext: false, temporary: endgameRound.temporary,
  })

  return {
    course, single, opening: openingOverview, tactics: tacticsOverview, endgame: endgameOverview,
    puzzles: { total: puzzles.length, solved: puzzles.filter(puzzle => progress.solvedPuzzles.includes(puzzle.id)).length },
    milestones: { firstMatch: progress.milestones.firstMatch, independentMatch: progress.milestones.independentMatch },
    pendingRounds, suggestion,
  }
}
