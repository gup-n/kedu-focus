import { describe, expect, it } from 'vitest'
import { demoState } from '../test/fixtures'
import { compactRecurringTaskHistory, groupTaskCompletions, RECURRING_COMPACTION_DAYS, suppressCompactedTasks } from './taskArchive'

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

  it('groups repeated completions by recurrence source while preserving every item', () => {
    const items = [
      { id: 'a', recurrenceSourceId: 'source-1', title: '每日阅读', categoryId: 'focus', plannedDate: '2026-08-20', completedAt: '2026-08-20T08:00:00.000Z', compactedAt: '2026-08-21T00:00:00.000Z' },
      { id: 'b', recurrenceSourceId: 'source-1', title: '每日阅读', categoryId: 'focus', plannedDate: '2026-08-22', completedAt: '2026-08-22T08:00:00.000Z', compactedAt: '2026-08-23T00:00:00.000Z' },
      { id: 'c', recurrenceSourceId: 'source-2', title: '每日阅读', categoryId: 'focus', plannedDate: '2026-08-21', completedAt: '2026-08-21T08:00:00.000Z', compactedAt: '2026-08-23T00:00:00.000Z' },
    ]
    const groups = groupTaskCompletions(items)
    expect(groups).toHaveLength(2)
    expect(groups[0].items.map(item => item.id)).toEqual(['b', 'a'])
    expect(groups.flatMap(group => group.items)).toHaveLength(items.length)
  })

  it('uses title and category when a legacy completion has no source id', () => {
    const base = { id: 'a', recurrenceSourceId: '', title: '整理房间', categoryId: 'home', plannedDate: '2026-08-20', completedAt: '2026-08-20T08:00:00.000Z', compactedAt: '2026-08-21T00:00:00.000Z' }
    const groups = groupTaskCompletions([
      base,
      { ...base, id: 'b', plannedDate: '2026-08-21', completedAt: '2026-08-21T08:00:00.000Z' },
      { ...base, id: 'c', categoryId: 'focus' },
    ])
    expect(groups.map(group => group.items.length)).toEqual([2, 1])
  })
})
