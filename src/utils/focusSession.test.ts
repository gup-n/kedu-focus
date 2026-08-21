import { describe, expect, it } from 'vitest'
import type { FocusSession, Task } from '../domain/types'
import { availableTimerTasks, focusRoundLabel, sessionTimeRange, sessionsForShanghaiDate } from './focusSession'

const task = (id: string, plannedDate: string, extra: Partial<Task> = {}): Task => ({
  id, title: id, note: '', plannedDate, dueDate: plannedDate, priority: 'medium',
  categoryId: 'work', estimatedPomodoros: 1, ...extra,
})

describe('focus session rules', () => {
  it('offers only today and overdue active tasks', () => {
    const tasks = [
      task('overdue', '2026-08-20'), task('today', '2026-08-21'), task('future', '2026-08-22'),
      task('done', '2026-08-20', { completedAt: '2026-08-20T10:00:00Z' }),
      task('deleted', '2026-08-20', { deletedAt: '2026-08-20T10:00:00Z' }),
    ]
    expect(availableTimerTasks(tasks, '2026-08-21').map(item => item.id)).toEqual(['overdue', 'today'])
  })

  it('cycles the visible round within each daily group', () => {
    expect(focusRoundLabel(0, 4)).toBe('今日第 1 次 · 本组第 1/4 轮')
    expect(focusRoundLabel(3, 4)).toBe('今日第 4 次 · 本组第 4/4 轮')
    expect(focusRoundLabel(4, 4)).toBe('今日第 5 次 · 本组第 1/4 轮')
  })

  it('accepts overnight edits and calculates exact duration', () => {
    expect(sessionTimeRange('2026-08-20T23:50', '2026-08-21T00:10', Date.parse('2026-08-21T01:00:00+08:00'))).toMatchObject({ seconds: 1200, minutes: 20 })
  })

  it('rejects reversed and future end times', () => {
    expect(() => sessionTimeRange('2026-08-21T10:00', '2026-08-21T09:59')).toThrow('结束时间必须晚于开始时间')
    expect(() => sessionTimeRange('2026-08-21T10:00', '2026-08-21T11:00', Date.parse('2026-08-21T10:30:00+08:00'))).toThrow('结束时间不能晚于当前时间')
  })

  it('uses Shanghai dates and ignores deleted sessions', () => {
    const sessions: FocusSession[] = [
      { id: 'today', categoryId: 'work', startedAt: '2026-08-20T16:10:00.000Z', endedAt: '2026-08-20T16:20:00.000Z', minutes: 10 },
      { id: 'deleted', categoryId: 'work', startedAt: '2026-08-20T17:00:00.000Z', endedAt: '2026-08-20T17:10:00.000Z', minutes: 10, deletedAt: '2026-08-21T01:00:00Z' },
    ]
    expect(sessionsForShanghaiDate(sessions, '2026-08-21').map(item => item.id)).toEqual(['today'])
  })
})
