import { beforeEach, describe, expect, it } from 'vitest'
import { demoState } from '../test/fixtures'
import { calculateDataHealth, formatDataSize, readBackupActivity, recordBackupActivity, TOMBSTONE_GRACE_DAYS } from './dataHealth'

describe('data health', () => {
  beforeEach(() => localStorage.clear())

  it('separates active records from recent and mature tombstones', () => {
    const now = Date.parse('2026-08-16T08:00:00.000Z')
    const state = structuredClone(demoState)
    state.tasks[0].deletedAt = new Date(now - (TOMBSTONE_GRACE_DAYS + 2) * 86400000).toISOString()
    state.sessions[0].deletedAt = new Date(now - 4 * 86400000).toISOString()

    const result = calculateDataHealth(state, now)

    expect(result).toMatchObject({ deletedTasks: 1, deletedSessions: 1, tombstones: 2, matureTombstones: 1, recentTombstones: 1 })
    expect(result.activeTasks).toBe(state.tasks.length - 1)
    expect(result.estimatedBytes).toBeGreaterThan(0)
  })

  it('records the latest successful backup and formats compact sizes', () => {
    recordBackupActivity({ savedAt: '2026-08-16T08:00:00.000Z', filename: '刻度备份.json' })

    expect(readBackupActivity()).toEqual({ savedAt: '2026-08-16T08:00:00.000Z', filename: '刻度备份.json' })
    expect(formatDataSize(1536)).toBe('1.5 KB')
    expect(formatDataSize(2 * 1024 * 1024)).toBe('2.0 MB')
  })
})
