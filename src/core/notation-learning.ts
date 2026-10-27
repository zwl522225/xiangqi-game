import type { Progress } from './storage'
import type { Side } from './types'
import { notationUnits } from '../content/notation-lessons'

export const notationUnitIds: readonly string[] = notationUnits.map(unit => unit.id)

export function isNotationLearningUnit(id: string): boolean {
  return notationUnitIds.includes(id)
}

export function notationFileRows(orientation: Side): { red: string[]; black: string[] } {
  const red = [...'九八七六五四三二一']
  const black = [...'123456789']
  return orientation === 'red' ? { red, black } : { red: red.reverse(), black: black.reverse() }
}

export function notationLearningSummary(progress: Pick<Progress, 'practicedUnits' | 'masteredUnits'>) {
  const units = notationUnits.map(({ id, title }) => ({
    id, title,
    status: (progress.masteredUnits.includes(id) ? 'mastered' : progress.practicedUnits.includes(id) ? 'practiced' : 'unrecorded') as 'mastered' | 'practiced' | 'unrecorded',
  }))
  return {
    total: units.length,
    mastered: units.filter(unit => unit.status === 'mastered').length,
    practiced: units.filter(unit => unit.status === 'practiced').length,
    unrecorded: units.filter(unit => unit.status === 'unrecorded').length,
    units,
    entryUnitId: units.find(unit => unit.status !== 'mastered')?.id ?? units[0].id,
  }
}
