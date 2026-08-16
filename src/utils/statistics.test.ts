import { describe, expect, it } from 'vitest'
import type { AppState, FocusSession } from '../domain/types'
import {
  calculateStatistics,
  getStatisticsRange,
  selectedAverageSeconds,
  shanghaiDateKey,
  shanghaiIsoString,
  shiftStatisticsRange,
} from './statistics'

const categories = [
  { id: 'work', name: '工作', color: '#5b5ce2' },
  { id: 'study', name: '学习', color: '#23b8b3' },
]

function session(id: string, startedAt: string, endedAt: string, seconds: number, categoryId = 'work', deletedAt?: string): FocusSession {
  return { id, startedAt, endedAt, seconds, minutes: Math.ceil(seconds / 60), categoryId, deletedAt }
}

function state(sessions: FocusSession[]): Pick<AppState, 'sessions' | 'categories'> {
  return { sessions, categories }
}

function stateWithSleep(sleep: AppState['sleep']) {
  return { sessions: [], categories, sleep }
}

describe('statistics ranges', () => {
  it('maps UTC timestamps to the UTC+8 calendar date used by the app', () => {
    const instant = new Date('2026-08-11T16:05:06.000Z')

    expect(shanghaiDateKey(instant)).toBe('2026-08-12')
    expect(shanghaiIsoString(instant)).toBe('2026-08-12T00:05:06+08:00')
    expect(Date.parse(shanghaiIsoString(instant))).toBe(instant.getTime())
  })

  it('uses Monday-first weeks and calendar month/year ranges', () => {
    expect(getStatisticsRange('week', '2026-08-09')).toEqual({ start: '2026-08-03', end: '2026-08-09' })
    expect(getStatisticsRange('month', '2024-02-10')).toEqual({ start: '2024-02-01', end: '2024-02-29' })
    expect(getStatisticsRange('year', '2026-08-10')).toEqual({ start: '2026-01-01', end: '2026-12-31' })
  })

  it('validates inclusive custom ranges and shifts every period', () => {
    expect(getStatisticsRange('custom', '2026-08-10', { start: '2026-08-01', end: '2026-08-10' }))
      .toEqual({ start: '2026-08-01', end: '2026-08-10' })
    expect(() => getStatisticsRange('custom', '2026-08-10', { start: '2026-08-11', end: '2026-08-10' })).toThrow('开始日期')
    expect(shiftStatisticsRange('week', { start: '2026-08-03', end: '2026-08-09' }, -1)).toEqual({ start: '2026-07-27', end: '2026-08-02' })
    expect(shiftStatisticsRange('month', { start: '2026-08-01', end: '2026-08-31' }, 1)).toEqual({ start: '2026-09-01', end: '2026-09-30' })
    expect(shiftStatisticsRange('year', { start: '2026-01-01', end: '2026-12-31' }, -1)).toEqual({ start: '2025-01-01', end: '2025-12-31' })
    expect(shiftStatisticsRange('custom', { start: '2026-08-01', end: '2026-08-03' }, 1)).toEqual({ start: '2026-08-04', end: '2026-08-06' })
  })
})

describe('calculateStatistics', () => {
  it('splits a session across the UTC+8 midnight boundary', () => {
    const result = calculateStatistics(state([
      session('midnight', '2026-08-09T15:50:00.000Z', '2026-08-09T16:10:00.000Z', 1200),
    ]), { start: '2026-08-09', end: '2026-08-10' })

    expect(result.totalSeconds).toBe(1200)
    expect(result.trend.map(point => point.seconds)).toEqual([600, 600])
    expect(result.hourlySeconds[23]).toBe(600)
    expect(result.hourlySeconds[0]).toBe(600)
    expect(result.activeDays).toBe(2)
  })

  it('filters sleep by wake date and calculates duration trend and hourly coverage', () => {
    const result = calculateStatistics(stateWithSleep([
      { id: 'night-1', date: '2026-08-09', sleptAt: '2026-08-08T23:30:00+08:00', wokeAt: '2026-08-09T07:00:00+08:00', score: 4 },
      { id: 'night-2', date: '2026-08-10', sleptAt: '2026-08-10T00:30:00+08:00', wokeAt: '2026-08-10T08:00:00+08:00', score: 5 },
      { id: 'outside', date: '2026-08-11', sleptAt: '2026-08-10T23:00', wokeAt: '2026-08-11T07:00', score: 3 },
      { id: 'invalid', date: '2026-08-10', sleptAt: '2026-08-10T09:00', wokeAt: '2026-08-10T08:00', score: 2 },
    ]), { start: '2026-08-09', end: '2026-08-10' })

    expect(result.sleep.recordCount).toBe(2)
    expect(result.sleep.averageDurationSeconds).toBe(7.5 * 3600)
    expect(result.sleep.averageScore).toBe(4.5)
    expect(result.sleep.shortestDurationSeconds).toBe(7.5 * 3600)
    expect(result.sleep.longestDurationSeconds).toBe(7.5 * 3600)
    expect(result.sleep.recommendedNightCount).toBe(2)
    expect(result.sleep.recentNights.map(night => night.date)).toEqual(['2026-08-10', '2026-08-09'])
    expect(result.sleep.trend.map(point => point.seconds)).toEqual([7.5 * 3600, 7.5 * 3600])
    expect(result.sleep.hourlyCoverageSeconds[1]).toBe(2 * 3600)
    expect(result.sleep.hourlyCoverageSeconds[23]).toBe(1800)
  })

  it('uses a circular average for bedtimes around midnight', () => {
    const result = calculateStatistics(stateWithSleep([
      { id: 'before', date: '2026-08-09', sleptAt: '2026-08-08T23:30:00+08:00', wokeAt: '2026-08-09T07:00:00+08:00', score: 4 },
      { id: 'after', date: '2026-08-10', sleptAt: '2026-08-10T00:30:00+08:00', wokeAt: '2026-08-10T08:00:00+08:00', score: 4 },
    ]), { start: '2026-08-09', end: '2026-08-10' })

    expect(result.sleep.averageBedtimeMinutes === 0 || result.sleep.averageBedtimeMinutes === 1440).toBe(true)
    expect(result.sleep.averageWakeMinutes).toBe(450)
  })

  it('scales actual seconds over wall-clock time so pauses are not counted', () => {
    const result = calculateStatistics(state([
      session('paused', '2026-08-10T00:00:00.000Z', '2026-08-10T02:00:00.000Z', 3600),
    ]), { start: '2026-08-10', end: '2026-08-10' })

    expect(result.totalSeconds).toBe(3600)
    expect(result.hourlySeconds[8]).toBe(1800)
    expect(result.hourlySeconds[9]).toBe(1800)
  })

  it('calculates active/calendar averages, categories, hours, and filters tombstones', () => {
    const result = calculateStatistics(state([
      session('one', '2026-08-03T01:00:00.000Z', '2026-08-03T01:30:00.000Z', 1800, 'work'),
      session('two', '2026-08-05T06:00:00.000Z', '2026-08-05T06:30:00.000Z', 1800, 'study'),
      session('deleted', '2026-08-06T01:00:00.000Z', '2026-08-06T02:00:00.000Z', 3600, 'work', '2026-08-07T00:00:00Z'),
    ]), { start: '2026-08-03', end: '2026-08-09' })

    expect(result.totalSeconds).toBe(3600)
    expect(result.sessionCount).toBe(2)
    expect(result.activeDays).toBe(2)
    expect(result.periodDays).toBe(7)
    expect(selectedAverageSeconds(result, 'active')).toBe(1800)
    expect(selectedAverageSeconds(result, 'calendar')).toBeCloseTo(3600 / 7)
    expect(result.categories.map(item => [item.name, item.percent])).toEqual([['工作', 50], ['学习', 50]])
    expect(result.hourlySeconds[9]).toBe(1800)
    expect(result.hourlySeconds[14]).toBe(1800)
  })

  it('returns a complete empty daily series and switches long ranges to monthly trends', () => {
    const empty = calculateStatistics(state([]), { start: '2026-08-03', end: '2026-08-09' })
    expect(empty.totalSeconds).toBe(0)
    expect(empty.trend).toHaveLength(7)
    expect(empty.categories).toEqual([])
    expect(empty.hourlySeconds.every(value => value === 0)).toBe(true)

    const year = calculateStatistics(state([
      session('jan', '2026-01-15T01:00:00.000Z', '2026-01-15T02:00:00.000Z', 3600),
      session('dec', '2026-12-15T01:00:00.000Z', '2026-12-15T02:00:00.000Z', 3600),
    ]), { start: '2026-01-01', end: '2026-12-31' })
    expect(year.trendUnit).toBe('month')
    expect(year.trend).toHaveLength(12)
    expect(year.trend[0].seconds).toBe(3600)
    expect(year.trend[11].seconds).toBe(3600)
  })
})
