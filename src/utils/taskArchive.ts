import type { AppState, Task, TaskCompletion } from '../domain/types'

export const COMPLETION_RECENT_DAYS = 30
export const RECURRING_COMPACTION_DAYS = 90

const dayMs = 24 * 60 * 60 * 1000

export function isRecurringTask(task: Task) {
  return Boolean(task.recurrence || task.recurrenceSourceId)
}

export function isRecentTaskCompletion(completedAt: string, now = Date.now(), days = COMPLETION_RECENT_DAYS) {
  const timestamp = Date.parse(completedAt)
  return Number.isFinite(timestamp) && timestamp > now - days * dayMs
}

export function completionFromTask(task: Task, compactedAt: string): TaskCompletion {
  if (!task.completedAt) throw new Error('只有已完成的重复任务才能压缩。')
  return {
    id: task.id,
    recurrenceSourceId: task.recurrenceSourceId ?? task.id,
    title: task.title,
    categoryId: task.categoryId,
    plannedDate: task.plannedDate,
    completedAt: task.completedAt,
    compactedAt,
  }
}

export function compactRecurringTaskHistory(state: AppState, now = Date.now()): AppState {
  const existing = new Map((state.completions ?? []).map(completion => [completion.id, completion]))
  const cutoff = now - RECURRING_COMPACTION_DAYS * dayMs
  const tasks: Task[] = []
  for (const task of state.tasks) {
    const completed = task.completedAt ? Date.parse(task.completedAt) : Number.NaN
    if (!task.deletedAt && isRecurringTask(task) && Number.isFinite(completed) && completed <= cutoff) {
      if (!existing.has(task.id)) existing.set(task.id, completionFromTask(task, new Date(now).toISOString()))
      continue
    }
    tasks.push(task)
  }
  const completionIds = new Set(existing.keys())
  return { ...state, tasks: tasks.filter(task => !completionIds.has(task.id)), completions: [...existing.values()] }
}

export function suppressCompactedTasks(tasks: Task[], completions: TaskCompletion[] = []) {
  const ids = new Set(completions.map(completion => completion.id))
  return tasks.filter(task => !ids.has(task.id))
}
