import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoState as seedState } from '../test/fixtures'
import { applyConflictChoices, buildMergePlan, createBackupEnvelope, downloadBlob, getBackupPreview, parseBackupJson } from './backup'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('backup envelope', () => {
  it('round-trips a versioned complete state and produces a preview', () => {
    const envelope = createBackupEnvelope(seedState, '2026-08-09T12:00:00.000Z')
    const parsed = parseBackupJson(JSON.stringify(envelope))

    expect(parsed).toEqual(envelope)
    expect(getBackupPreview(parsed)).toMatchObject({ exportedAt: '2026-08-09T12:00:00.000Z', tasks: 4, categories: 4, sessions: 5, reviews: 1, sleep: 1 })
  })

  it('rejects malformed files, unsupported versions, and invalid core fields with Chinese errors', () => {
    expect(() => parseBackupJson('{')).toThrow('无法解析此文件')
    expect(() => parseBackupJson(JSON.stringify({ ...createBackupEnvelope(seedState), schemaVersion: 9 }))).toThrow('不支持此备份版本')
    const invalid = createBackupEnvelope(seedState)
    ;(invalid.data.tasks[0] as unknown as { plannedDate: number }).plannedDate = 9
    expect(() => parseBackupJson(JSON.stringify(invalid))).toThrow('日期格式不正确')
  })

  it.each(['tasks', 'categories', 'sessions', 'reviews', 'sleep'] as const)('rejects duplicate IDs in %s', collection => {
    const duplicate = createBackupEnvelope(seedState)
    duplicate.data[collection].push(structuredClone(duplicate.data[collection][0]) as never)
    expect(() => parseBackupJson(JSON.stringify(duplicate))).toThrow(`“${collection}”包含重复 id`)
  })

  it('mounts the download anchor for the click, removes it, and revokes the URL later', () => {
    vi.useFakeTimers()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    let mountedWhileClicking = false
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      mountedWhileClicking = document.body.contains(this)
    })

    downloadBlob(['内容'], '测试.json', 'application/json')

    expect(mountedWhileClicking).toBe(true)
    expect(document.querySelector('a[download="测试.json"]')).toBeNull()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(999)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
})

describe('backup merge', () => {
  it('keeps one-sided records and requires an explicit choice for differing matching IDs', () => {
    const local = structuredClone(seedState)
    const imported = structuredClone(seedState)
    imported.tasks[0].title = '导入版本标题'
    imported.tasks.push({ ...imported.tasks[1], id: 'import-only', title: '仅导入存在' })
    local.settings.theme = 'dark'
    imported.settings.theme = 'light'
    imported.timer.status = 'running'

    const plan = buildMergePlan(local, imported)
    expect(plan.state.tasks.some(task => task.id === 'import-only')).toBe(true)
    expect(plan.conflicts.map(conflict => conflict.key)).toContain('tasks:t1')
    expect(plan.state.settings.theme).toBe('dark')
    expect(plan.state.timer.status).toBe(local.timer.status)
    expect(() => applyConflictChoices(plan, {})).toThrow('尚未选择')

    const merged = applyConflictChoices(plan, Object.fromEntries(plan.conflicts.map(conflict => [conflict.key, conflict.key === 'tasks:t1' ? 'imported' : 'local'])))
    expect(merged.tasks.find(task => task.id === 't1')?.title).toBe('导入版本标题')
  })

  it('treats a deletion tombstone as a full-record conflict so imports cannot revive it silently', () => {
    const local = structuredClone(seedState)
    local.tasks[0].deletedAt = '2026-08-09T12:00:00.000Z'
    const imported = structuredClone(seedState)
    const plan = buildMergePlan(local, imported)
    const conflict = plan.conflicts.find(item => item.key === 'tasks:t1')

    expect(conflict).toBeDefined()
    const kept = applyConflictChoices(plan, Object.fromEntries(plan.conflicts.map(item => [item.key, 'local'])))
    expect(kept.tasks[0].deletedAt).toBeTruthy()
  })

  it('validates, previews, and conflicts focus-session tombstones', () => {
    const local = structuredClone(seedState)
    local.sessions[0].deletedAt = '2026-08-10T10:00:00.000Z'
    local.sessions[0].updatedAt = '2026-08-10T10:00:00.000Z'
    const parsed = parseBackupJson(JSON.stringify(createBackupEnvelope(local)))

    expect(parsed.data.sessions[0].deletedAt).toBe('2026-08-10T10:00:00.000Z')
    expect(getBackupPreview(parsed)).toMatchObject({ sessions: seedState.sessions.length - 1, deletedSessions: 1 })

    const plan = buildMergePlan(local, structuredClone(seedState))
    expect(plan.conflicts.map(conflict => conflict.key)).toContain('sessions:s1')
    const kept = applyConflictChoices(plan, Object.fromEntries(plan.conflicts.map(conflict => [conflict.key, 'local'])))
    expect(kept.sessions.find(session => session.id === 's1')?.deletedAt).toBeTruthy()
  })

  it('rejects malformed focus-session tombstones', () => {
    const backup = createBackupEnvelope(seedState)
    backup.data.sessions[0].deletedAt = 'not-a-date'
    expect(() => parseBackupJson(JSON.stringify(backup))).toThrow('专注记录 #1 的删除时间不正确')
  })
})
