import { defaultEndgameLessons, type EndgameData } from './endgame-lessons'
import { parseEndgameLessons } from './endgame-lessons-storage'
import { curriculum } from '../content/curriculum'
import { lessons } from '../content/lessons'
import { puzzles } from '../content/puzzles'
import { learningOverview } from './learning-overview'
import { checkLearningBytes, dataArray, dataBoolean, dataObject, rejectLearningData } from './learning-data-codec'
import { defaultOpeningTraining, type OpeningTrainingData } from './opening-training'
import { parseOpeningTraining } from './opening-training-storage'
import { defaultPractice, type PracticeData } from './practice'
import { parsePracticeStrict } from './practice-codec'
import { defaultProgress, type Progress } from './storage'
import { defaultTactics, type TacticsData } from './tactics'
import { parseTactics } from './tactics-storage'

export const MAX_LEARNING_BACKUP_BYTES = 256 * 1024
export type BackupModule = 'coursePractice' | 'opening' | 'tactics' | 'endgame'
export const BACKUP_MODULE_LABELS: Record<BackupModule, string> = {
  coursePractice: '课堂与单步练习', opening: '开局跟练', tactics: '多步战术', endgame: '残局分步教学',
}
export type CoursePracticeData = Pick<Progress, 'completedLessons' | 'solvedPuzzles' | 'practicedUnits' | 'masteredUnits' | 'assistedVariants' | 'milestones'> & { practice: PracticeData }
export type BackupModuleData = { coursePractice: CoursePracticeData; opening: OpeningTrainingData; tactics: TacticsData; endgame: EndgameData }
export type LearningBackup = {
  format: 'yixiang-learning-backup'; version: 1 | 2; exportedAt: string
  modules: { coursePractice?: CoursePracticeData; opening?: OpeningTrainingData; tactics?: TacticsData; endgame?: EndgameData }
}
export type RestoreResult = { ok: true; changed: boolean } | { ok: false; error: string }

const courseFields = ['completedLessons', 'solvedPuzzles', 'practicedUnits', 'masteredUnits', 'assistedVariants', 'milestones', 'practice']
const units = curriculum.flatMap(chapter => chapter.units)
function ids(value: unknown, known: readonly string[]): string[] {
  const result = dataArray(value, known.length, value => {
    if (typeof value !== 'string' || !known.includes(value)) rejectLearningData('学习记录包含未知内容 ID')
    return value as string
  })
  if (new Set(result).size !== result.length) rejectLearningData('学习记录包含重复内容 ID')
  return result
}

export function parseCoursePractice(value: unknown): CoursePracticeData {
  const raw = dataObject(value, courseFields)
  const milestones = dataObject(raw.milestones, ['firstMatch', 'independentMatch'])
  const firstMatch = dataBoolean(milestones.firstMatch), independentMatch = dataBoolean(milestones.independentMatch)
  if (independentMatch && !firstMatch) rejectLearningData('独立首盘记录需要已有首盘记录')
  const practicedUnits = ids(raw.practicedUnits, units.map(unit => unit.id)), masteredUnits = ids(raw.masteredUnits, units.map(unit => unit.id))
  if (masteredUnits.some(id => !practicedUnits.includes(id))) rejectLearningData('已掌握知识点必须已有练习记录')
  const result: CoursePracticeData = {
    completedLessons: ids(raw.completedLessons, [...new Set([...lessons.map(lesson => lesson.id), ...curriculum.map(chapter => chapter.id)])]),
    solvedPuzzles: ids(raw.solvedPuzzles, puzzles.map(puzzle => puzzle.id)), practicedUnits, masteredUnits,
    assistedVariants: ids(raw.assistedVariants, units.flatMap(unit => unit.variants.map(variant => variant.id))),
    milestones: { firstMatch, independentMatch }, practice: parsePracticeStrict(raw.practice),
  }
  checkLearningBytes(JSON.stringify(result), 128 * 1024)
  return result
}

/** Only these seven learning fields leave Progress; live game data is never traversed. */
export function extractCoursePractice(progress: Progress): CoursePracticeData {
  return parseCoursePractice({ completedLessons: progress.completedLessons, solvedPuzzles: progress.solvedPuzzles,
    practicedUnits: progress.practicedUnits, masteredUnits: progress.masteredUnits, assistedVariants: progress.assistedVariants,
    milestones: progress.milestones, practice: progress.practice ?? defaultPractice() })
}

export function applyCoursePractice(progress: Progress, data: CoursePracticeData): Progress {
  return { ...progress, ...parseCoursePractice(data) }
}

function parseBackup(value: unknown): LearningBackup {
  const raw = dataObject(value, ['format', 'version', 'exportedAt', 'modules'])
  if (raw.format !== 'yixiang-learning-backup') rejectLearningData('文件不是弈象学习备份')
  if (raw.version !== 1 && raw.version !== 2) rejectLearningData('学习备份版本不受支持')
  if (typeof raw.exportedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw.exportedAt)) rejectLearningData('备份时间必须是有效 UTC ISO 时间')
  const date = new Date(raw.exportedAt as string)
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== raw.exportedAt) rejectLearningData('备份时间无效')
  const source = dataObject(raw.modules), keys = Object.keys(source)
  if (!keys.length || keys.some(key => !Object.hasOwn(BACKUP_MODULE_LABELS, key))) rejectLearningData('学习备份模块为空或未知')
  if (raw.version === 1 && Object.hasOwn(source, 'endgame')) rejectLearningData('版本 1 不支持残局分步教学模块')
  const modules: LearningBackup['modules'] = {}
  if (Object.hasOwn(source, 'coursePractice')) modules.coursePractice = parseCoursePractice(source.coursePractice)
  if (Object.hasOwn(source, 'opening')) modules.opening = parseOpeningTraining(source.opening)
  if (Object.hasOwn(source, 'tactics')) modules.tactics = parseTactics(source.tactics)
  if (Object.hasOwn(source, 'endgame')) modules.endgame = parseEndgameLessons(source.endgame)
  return { format: 'yixiang-learning-backup', version: raw.version as 1 | 2, exportedAt: raw.exportedAt as string, modules }
}

export function decodeLearningBackup(raw: string): LearningBackup {
  checkLearningBytes(raw, MAX_LEARNING_BACKUP_BYTES)
  let value: unknown
  try { value = JSON.parse(raw) } catch { rejectLearningData('学习备份 JSON 无法解析') }
  return parseBackup(value)
}

export function encodeLearningBackup(backup: LearningBackup): string {
  const raw = JSON.stringify(parseBackup(backup))
  checkLearningBytes(raw, MAX_LEARNING_BACKUP_BYTES)
  return raw
}

/** Summary counts come from the overview selector, including its historical semantics. */
export function backupModuleSummary<K extends BackupModule>(module: K, data: BackupModuleData[K]): string[] {
  const progress = defaultProgress()
  const input = { progress, opening: defaultOpeningTraining(), tactics: defaultTactics(), openingBlocked: false, tacticsBlocked: false, endgame: defaultEndgameLessons(), endgameBlocked: false }
  if (module === 'coursePractice') input.progress = applyCoursePractice(progress, data as CoursePracticeData)
  else if (module === 'opening') input.opening = parseOpeningTraining(data)
  else if (module === 'tactics') input.tactics = parseTactics(data)
  else input.endgame = parseEndgameLessons(data)
  const overview = learningOverview(input)
  if (module === 'coursePractice') {
    const round = overview.single.round
    return [`知识点掌握 ${overview.course.mastered}/${overview.course.total}，已练习未掌握 ${overview.course.practiced}`,
      `旧章节完成 ${overview.course.legacyCompleted}，旧残局完成 ${overview.puzzles.solved}/${overview.puzzles.total}`,
      `单步尝试 ${overview.single.attempted}/${overview.single.total}，待复习 ${overview.single.pendingReview}`,
      round ? `单步当前轮 ${round.index}/${round.total}，独立 ${round.independent}，辅助 ${round.assisted}，跳过 ${round.skipped}${round.finished ? '（已结束）' : ''}` : '单步暂无当前轮',
      `首盘${overview.milestones.firstMatch ? '已有' : '暂无'}记录，独立首盘${overview.milestones.independentMatch ? '已有' : '暂无'}记录`]
  }
  if (module === 'opening') {
    const { history, round, total } = overview.opening
    return [`开局完成 ${history!.completed}/${total}，无辅助 ${history!.unassisted}/${total}`,
      round ? `当前跟练：${round.title}，执${round.side === 'red' ? '红' : '黑'}，${round.ply}/${round.total} 着${round.finished ? '（已结束）' : ''}` : '暂无当前跟练']
  }
  if (module === 'endgame') {
    const { history, round, total } = overview.endgame
    return [`残局曾完成 ${history!.completed}/${total}，曾本轮无提示且无错误完成 ${history!.independent}/${total}`,
      round ? `当前残局：${round.title}，执${round.side === 'red' ? '红' : '黑'}，已走 ${round.ply}/${round.total} 着${round.finished ? '（已结束）' : ''}` : '暂无当前残局练习']
  }
  const { history, round, total } = overview.tactics
  return [`战术完成 ${history!.completed}/${total}，独立 ${history!.independent}/${total}，待复习 ${history!.pendingReview}`,
    round ? `战术当前轮 ${round.index}/${round.total}，独立 ${round.independent}，辅助 ${round.assisted}，揭晓 ${round.revealed}，跳过 ${round.skipped}${round.finished ? '（已结束）' : ''}` : '战术暂无当前轮']
}
