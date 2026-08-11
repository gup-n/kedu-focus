import { describe, expect, it } from 'vitest'
import type { AppState, Task } from './types'
import { sortedTasks, taskCreatedAt, visibleAppState } from './selectors'
import { demoState } from '../test/fixtures'

const task = (id: string, priority: Task['priority'], createdAt?: string): Task => ({
  id,
  title: id,
  note: '',
  plannedDate: '2026-08-10',
  dueDate: '2026-08-10',
  priority,
  categoryId: 'work',
  estimatedPomodoros: 1,
  createdAt,
})

describe('task ordering', () => {
  it('sorts by priority and then oldest creation time first', () => {
    const tasks = [
      task('low', 'low', '2026-08-10T08:00:00.000Z'),
      task('medium-new', 'medium', '2026-08-10T10:00:00.000Z'),
      task('high', 'high', '2026-08-10T12:00:00.000Z'),
      task('medium-old', 'medium', '2026-08-10T09:00:00.000Z'),
    ]

    expect(sortedTasks(tasks).map(item => item.id)).toEqual(['high', 'medium-old', 'medium-new', 'low'])
    expect(tasks.map(item => item.id)).toEqual(['low', 'medium-new', 'high', 'medium-old'])
  })

  it('uses updated time, planned date, and id as stable legacy fallbacks', () => {
    const updated = { ...task('updated', 'medium'), updatedAt: '2026-08-09T12:00:00.000Z' }
    const planned = task('planned', 'medium')
    expect(taskCreatedAt(updated)).toBe(updated.updatedAt)
    expect(taskCreatedAt(planned)).toBe('2026-08-10T00:00:00+08:00')
    expect(sortedTasks([task('b', 'medium'), task('a', 'medium')]).map(item => item.id)).toEqual(['a', 'b'])
  })
})

describe('visible app dates', () => {
  it('shows stored UTC activity under its UTC+8 calendar date without mutating raw data', () => {
    const raw = structuredClone(demoState) as AppState
    raw.sessions[0].startedAt = '2026-08-11T16:05:00.000Z'
    raw.sessions[0].endedAt = '2026-08-11T16:25:00.000Z'
    raw.tasks[0].completedAt = '2026-08-11T16:30:00.000Z'

    const visible = visibleAppState(raw)

    expect(visible.sessions[0]).toMatchObject({
      startedAt: '2026-08-12T00:05:00+08:00',
      endedAt: '2026-08-12T00:25:00+08:00',
    })
    expect(visible.tasks[0].completedAt).toBe('2026-08-12T00:30:00+08:00')
    expect(raw.sessions[0].startedAt).toBe('2026-08-11T16:05:00.000Z')
  })
})
