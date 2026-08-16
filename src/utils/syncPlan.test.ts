import { describe, expect, it } from 'vitest'
import { demoState } from '../test/fixtures'
import { applySyncChoices, buildSyncPlan, syncDifferenceCounts } from './syncPlan'

describe('sync plan', () => {
  it('lists one-sided and changed records before merging', () => {
    const local = structuredClone(demoState)
    const remote = structuredClone(demoState)
    local.tasks.push({ ...local.tasks[0], id: 'local-only', title: '仅本机' })
    remote.sessions.push({ ...remote.sessions[0], id: 'remote-only' })
    remote.tasks[0].title = '云端标题'

    const plan = buildSyncPlan(local, remote)

    expect(syncDifferenceCounts(plan)).toEqual({ 'local-only': 1, 'remote-only': 1, changed: 1 })
    expect(plan.differences.map(item => item.label)).toContain('仅本机')
    expect(plan.differences.find(item => item.kind === 'changed')?.remote).toMatchObject({ title: '云端标题' })
  })

  it('matches reviews by date even when devices generated different ids', () => {
    const local = structuredClone(demoState)
    const remote = structuredClone(demoState)
    remote.reviews[0] = { ...remote.reviews[0], id: 'another-id', summary: '云端日记' }

    const plan = buildSyncPlan(local, remote)
    const conflict = plan.differences.find(item => item.collection === 'reviews')!

    expect(conflict.kind).toBe('changed')
    expect(() => applySyncChoices(plan, {})).toThrow('尚未选择')
    const merged = applySyncChoices(plan, { [conflict.key]: 'imported' })
    expect(merged.reviews).toHaveLength(local.reviews.length)
    expect(merged.reviews[0]).toMatchObject({ id: 'another-id', summary: '云端日记' })
  })

  it('unions one-sided records and keeps device settings during safe merge', () => {
    const local = structuredClone(demoState)
    const remote = structuredClone(demoState)
    local.settings.theme = 'dark'
    remote.tasks.push({ ...remote.tasks[0], id: 'remote-only', title: '云端新增' })

    const merged = applySyncChoices(buildSyncPlan(local, remote), {})

    expect(merged.tasks.some(task => task.id === 'remote-only')).toBe(true)
    expect(merged.settings.theme).toBe('dark')
    expect(merged.timer).toEqual(local.timer)
  })

  it('does not mistake JSON-omitted optional fields for task conflicts', () => {
    const local = structuredClone(demoState)
    local.tasks = local.tasks.map(task => ({
      ...task,
      recurrence: undefined,
      recurrenceSourceId: undefined,
      updatedAt: undefined,
      deletedAt: undefined,
    }))
    const remote = JSON.parse(JSON.stringify(local)) as typeof local

    expect(buildSyncPlan(local, remote).differences).toEqual([])
  })

  it('treats default category state and record ids as semantic metadata', () => {
    const local = structuredClone(demoState)
    const remote = structuredClone(demoState)
    local.categories[0].archived = false
    remote.reviews[0].id = 'same-date-from-another-device'
    remote.sleep[0].id = 'same-date-from-another-device'

    expect(buildSyncPlan(local, remote).differences).toEqual([])
  })

  it('shows only the review when that is the only business content changed', () => {
    const remote = JSON.parse(JSON.stringify(demoState)) as typeof demoState
    const local = structuredClone(demoState)
    local.tasks = local.tasks.map(task => ({ ...task, recurrence: undefined, completedAt: task.completedAt }))
    local.categories = local.categories.map(category => ({ ...category, archived: false }))
    local.reviews[0].summary = '电脑上新写的复盘内容'

    const plan = buildSyncPlan(local, remote)

    expect(syncDifferenceCounts(plan)).toEqual({ 'local-only': 0, 'remote-only': 0, changed: 1 })
    expect(plan.differences).toHaveLength(1)
    expect(plan.differences[0]).toMatchObject({ collection: 'reviews', kind: 'changed' })
  })

  it('still reports real task content changes after semantic normalization', () => {
    const local = structuredClone(demoState)
    const remote = JSON.parse(JSON.stringify(local)) as typeof local
    remote.tasks[0].note = '云端确实修改了任务说明'

    const plan = buildSyncPlan(local, remote)

    expect(plan.differences).toHaveLength(1)
    expect(plan.differences[0]).toMatchObject({ collection: 'tasks', entityKey: local.tasks[0].id, kind: 'changed' })
  })

  it('syncs a compacted completion without reviving the stale full task', () => {
    const local = structuredClone(demoState)
    const stale = { ...local.tasks[0], recurrence: { kind: 'daily' as const }, completedAt: '2026-01-01T08:00:00.000Z' }
    local.tasks = local.tasks.filter(task => task.id !== stale.id)
    local.completions = [{ id: stale.id, recurrenceSourceId: stale.id, title: stale.title, categoryId: stale.categoryId, plannedDate: stale.plannedDate, completedAt: stale.completedAt, compactedAt: '2026-08-16T08:00:00.000Z' }]
    const remote = structuredClone(demoState)
    remote.tasks[0] = stale
    remote.completions = []

    const plan = buildSyncPlan(local, remote)
    const merged = applySyncChoices(plan, {})

    expect(plan.differences).toEqual([expect.objectContaining({ collection: 'completions', kind: 'local-only' })])
    expect(merged.tasks.some(task => task.id === stale.id)).toBe(false)
    expect(merged.completions?.some(completion => completion.id === stale.id)).toBe(true)
  })
})
