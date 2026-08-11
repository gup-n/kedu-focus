import { describe, expect, it } from 'vitest'
import type { Task } from '../domain/types'
import { createNextRecurringTask, nextRecurringDate } from './recurrence'

const base: Task = { id: 'base', title: '重复任务', note: '', plannedDate: '2026-08-10', dueDate: '2026-08-12', priority: 'medium', categoryId: 'work', estimatedPomodoros: 1 }

describe('task recurrence', () => {
  it('calculates daily and weekly dates', () => {
    expect(nextRecurringDate({ ...base, recurrence: { kind: 'daily' } })).toBe('2026-08-11')
    expect(nextRecurringDate({ ...base, recurrence: { kind: 'weekly' } })).toBe('2026-08-17')
  })

  it('finds the next selected weekday', () => {
    expect(nextRecurringDate({ ...base, recurrence: { kind: 'weekdays', weekdays: [3, 5] } })).toBe('2026-08-12')
  })

  it('preserves the due-date offset and recurrence source', () => {
    const next = createNextRecurringTask({ ...base, recurrence: { kind: 'daily' } }, 'next', '2026-08-10T12:00:00.000Z')!
    expect(next).toMatchObject({ id: 'next', plannedDate: '2026-08-11', dueDate: '2026-08-13', recurrenceSourceId: 'base', completedAt: undefined })
  })
})
