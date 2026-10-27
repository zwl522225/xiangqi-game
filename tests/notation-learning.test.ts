import { describe, expect, it } from 'vitest'
import { isNotationLearningUnit, notationFileRows, notationLearningSummary, notationUnitIds } from '../src/core/notation-learning'

describe('notation learning derived state', () => {
  it('recognizes only the four stable new unit IDs', () => {
    expect(notationUnitIds).toEqual(['notation-files', 'notation-straight', 'notation-target-file', 'notation-front-back'])
    for (const id of notationUnitIds) expect(isNotationLearningUnit(id)).toBe(true)
    for (const id of ['read-notation', 'notation', 'notation-files-demo', '', 'unknown']) expect(isNotationLearningUnit(id)).toBe(false)
  })

  it('projects each side’s file numbers from screen left to right without sharing mutable arrays', () => {
    expect(notationFileRows('red')).toEqual({ red: [...'九八七六五四三二一'], black: [...'123456789'] })
    expect(notationFileRows('black')).toEqual({ red: [...'一二三四五六七八九'], black: [...'987654321'] })
    const rows = notationFileRows('red')
    rows.red.reverse()
    rows.black[0] = 'changed'
    expect(notationFileRows('red')).toEqual({ red: [...'九八七六五四三二一'], black: [...'123456789'] })
  })

  it('counts only unique specialist records and gives mastery precedence', () => {
    const progress = { practicedUnits: ['notation-files', 'notation-files', 'notation-straight', 'rook', 'unknown'], masteredUnits: ['notation-files', 'notation-files', 'read-notation'] }
    const before = structuredClone(progress)
    const summary = notationLearningSummary(progress)
    expect(summary).toMatchObject({ total: 4, mastered: 1, practiced: 1, unrecorded: 2, entryUnitId: 'notation-straight' })
    expect(summary.units.map(unit => [unit.id, unit.status])).toEqual([
      ['notation-files', 'mastered'], ['notation-straight', 'practiced'], ['notation-target-file', 'unrecorded'], ['notation-front-back', 'unrecorded'],
    ])
    expect(summary.units.every(unit => unit.title.length > 2)).toBe(true)
    expect(progress).toEqual(before)
  })

  it('enters the first unmastered unit, or the first for review when all are mastered', () => {
    expect(notationLearningSummary({ practicedUnits: [], masteredUnits: [] })).toMatchObject({ total: 4, mastered: 0, practiced: 0, unrecorded: 4, entryUnitId: 'notation-files' })
    const all = [...notationUnitIds]
    expect(notationLearningSummary({ practicedUnits: all, masteredUnits: all })).toMatchObject({ mastered: 4, practiced: 0, unrecorded: 0, entryUnitId: 'notation-files' })
    expect(notationLearningSummary({ practicedUnits: [], masteredUnits: ['notation-files', 'notation-target-file'] }).entryUnitId).toBe('notation-straight')
  })
})
