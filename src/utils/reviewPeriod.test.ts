import { describe, expect, it } from 'vitest'
import { demoState } from '../test/fixtures'
import { buildPeriodReviewMarkdown, periodReviewSummary, reviewPeriod } from './reviewPeriod'

describe('period reviews', () => {
  it('uses Monday-to-Sunday weeks and calendar months', () => {
    expect(reviewPeriod('week', '2026-08-11')).toEqual({ start: '2026-08-10', end: '2026-08-16' })
    expect(reviewPeriod('month', '2026-08-11')).toEqual({ start: '2026-08-01', end: '2026-08-31' })
  })

  it('summarizes tasks, exact focus time, sleep, and daily reviews', () => {
    const state = structuredClone(demoState)
    state.tasks = [{ ...state.tasks[0], completedAt: '2026-08-11T10:00:00.000Z' }]
    state.sessions = [{ ...state.sessions[0], startedAt: '2026-08-11T09:00:00.000Z', seconds: 1510, minutes: 26 }]
    state.reviews = [{ id: 'review', date: '2026-08-11', summary: '完成重点', improvement: '', tomorrow: '' }]
    state.sleep = [{ id: 'sleep', date: '2026-08-11', sleptAt: '2026-08-10T23:00:00+08:00', wokeAt: '2026-08-11T07:00:00+08:00', score: 4 }]

    const summary = periodReviewSummary(state, 'week', '2026-08-11')
    expect(summary).toMatchObject({ completedTasks: 1, focusSeconds: 1510, averageSleepMinutes: 480 })
    expect(buildPeriodReviewMarkdown(state, 'week', '2026-08-11')).toContain('## 2026-08-11')
  })
})
