import { describe, expect, it } from 'vitest'
import { demoState } from '../test/fixtures'
import { compactRecurringTaskHistory, RECURRING_COMPACTION_DAYS, suppressCompactedTasks } from './taskArchive'

describe('recurring task history compaction', () => {
  it('turns only old recurring completions into lightweight records', () => {
    const now = Date.parse('2026-08-16T08:00:00.000Z')
    const state = structuredClone(demoState)
    state.tasks[0] = {
      ...state.tasks[0],
      recurrence: { kind: 'daily' },
      completedAt: new Date(now - (RECURRING_COMPACTION_DAYS + 1) * 86400000).toISOString(),
    }
    state.tasks[1].completedAt = new Date(now - (RECURRING_COMPACTION_DAYS + 1) * 86400000).toISOString()

    const compacted = compactRecurringTaskHistory(state, now)

    expect(compacted.tasks.some(task => task.id === state.tasks[0].id)).toBe(false)
    expect(compacted.tasks.some(task => task.id === state.tasks[1].id)).toBe(true)
    expect(compacted.completions).toContainEqual(expect.objectContaining({ id: state.tasks[0].id, title: state.tasks[0].title }))
  })

  it('lets the lightweight completion marker suppress a stale full task', () => {
    const task = demoState.tasks[0]
    const completion = { id: task.id, recurrenceSourceId: task.id, title: task.title, categoryId: task.categoryId, plannedDate: task.plannedDate, completedAt: '2026-01-01T08:00:00.000Z', compactedAt: '2026-08-16T08:00:00.000Z' }
    expect(suppressCompactedTasks([task], [completion])).toEqual([])
  })
})
