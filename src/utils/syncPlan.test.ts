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
})
