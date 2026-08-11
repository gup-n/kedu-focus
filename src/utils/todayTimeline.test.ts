import { describe, expect, it } from 'vitest'
import type { FocusSession } from '../domain/types'
import { buildTodayTimeline, compactTimelineDuration, timelineNowPosition } from './todayTimeline'

function session(id: string, startedAt: string, seconds: number): FocusSession {
  return {
    id,
    categoryId: 'study',
    startedAt,
    endedAt: new Date(Date.parse(startedAt) + seconds * 1000).toISOString(),
    seconds,
    minutes: Math.max(1, Math.ceil(seconds / 60)),
  }
}

const localTime = (hour: number, minute = 0) => new Date(2026, 7, 11, hour, minute).toISOString()

describe('today timeline', () => {
  it('sorts records by their real start time and labels their duration', () => {
    const placements = buildTodayTimeline([
      session('later', localTime(15, 20), 1201),
      session('earlier', localTime(13), 421),
    ])

    expect(placements.map(item => item.session.id)).toEqual(['earlier', 'later'])
    expect(placements.map(item => item.label)).toEqual(['7分', '20分'])
    expect(placements.map(item => item.range)).toEqual(['13:00–13:07', '15:20–15:40'])
  })

  it('places visually overlapping short records on separate lanes', () => {
    const placements = buildTodayTimeline([
      session('first', localTime(10), 120),
      session('second', localTime(10, 5), 300),
      session('third', localTime(10, 10), 480),
    ])

    expect(placements.map(item => item.lane)).toEqual([0, 1, 2])
    expect(new Set(placements.map(item => item.top)).size).toBe(3)
  })

  it('formats seconds, minutes and hours without record sequence numbers', () => {
    expect(compactTimelineDuration(42)).toBe('42秒')
    expect(compactTimelineDuration(1201)).toBe('20分')
    expect(compactTimelineDuration(3900)).toBe('1时5分')
  })

  it('positions the current-time marker using minutes and keeps it on the rail', () => {
    expect(timelineNowPosition(new Date(2026, 7, 11, 14, 30))).toBe(50)
    expect(timelineNowPosition(new Date(2026, 7, 11, 3, 0))).toBe(2)
    expect(timelineNowPosition(new Date(2026, 7, 11, 23, 0))).toBe(98)
  })
})
