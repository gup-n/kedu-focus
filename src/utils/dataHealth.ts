import type { AppState } from '../domain/types'

export const BACKUP_ACTIVITY_KEY = 'kedu-focus-backup-activity-v1'
export const BACKUP_ACTIVITY_EVENT = 'kedu-focus-backup-saved'
export const TOMBSTONE_GRACE_DAYS = 90

export interface BackupActivity {
  savedAt: string
  filename: string
}

export interface DataHealthSnapshot {
  activeTasks: number
  activeSessions: number
  reviews: number
  sleep: number
  categories: number
  deletedTasks: number
  deletedSessions: number
  tombstones: number
  matureTombstones: number
  recentTombstones: number
  oldestDeletedAt?: string
  estimatedBytes: number
  activeRecords: number
  totalRecords: number
  tombstoneRatio: number
  level: 'healthy' | 'watch'
}

const storage = () => {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage } catch { return undefined }
}

export function calculateDataHealth(state: AppState, now = Date.now()): DataHealthSnapshot {
  const taskTombstones = state.tasks.filter(task => task.deletedAt)
  const sessionTombstones = state.sessions.filter(session => session.deletedAt)
  const deletions = [...taskTombstones, ...sessionTombstones]
    .map(item => item.deletedAt)
    .filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value!)))
    .sort()
  const cutoff = now - TOMBSTONE_GRACE_DAYS * 24 * 60 * 60 * 1000
  const matureTombstones = deletions.filter(value => Date.parse(value) <= cutoff).length
  const activeTasks = state.tasks.length - taskTombstones.length
  const activeSessions = state.sessions.length - sessionTombstones.length
  const activeRecords = activeTasks + activeSessions + state.reviews.length + state.sleep.length + state.categories.length
  const tombstones = deletions.length
  const totalRecords = activeRecords + tombstones
  const tombstoneRatio = totalRecords ? tombstones / totalRecords : 0
  const estimatedBytes = new TextEncoder().encode(JSON.stringify(state)).byteLength
  return {
    activeTasks,
    activeSessions,
    reviews: state.reviews.length,
    sleep: state.sleep.length,
    categories: state.categories.length,
    deletedTasks: taskTombstones.length,
    deletedSessions: sessionTombstones.length,
    tombstones,
    matureTombstones,
    recentTombstones: tombstones - matureTombstones,
    oldestDeletedAt: deletions[0],
    estimatedBytes,
    activeRecords,
    totalRecords,
    tombstoneRatio,
    level: tombstones >= 100 || tombstoneRatio >= .25 ? 'watch' : 'healthy',
  }
}

export function formatDataSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function readBackupActivity(): BackupActivity | undefined {
  try {
    const value = JSON.parse(storage()?.getItem(BACKUP_ACTIVITY_KEY) ?? 'null') as Partial<BackupActivity> | null
    return value && typeof value.savedAt === 'string' && typeof value.filename === 'string'
      ? { savedAt: value.savedAt, filename: value.filename }
      : undefined
  } catch { return undefined }
}

export function recordBackupActivity(activity: BackupActivity) {
  storage()?.setItem(BACKUP_ACTIVITY_KEY, JSON.stringify(activity))
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(BACKUP_ACTIVITY_EVENT, { detail: activity }))
}
