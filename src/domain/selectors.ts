import type { AppState, FocusSession, Task } from './types'

export const isActiveTask = (task: Task) => !task.deletedAt

export const activeTasks = (state: Pick<AppState, 'tasks'>) => state.tasks.filter(isActiveTask)

const priorityOrder = { high: 0, medium: 1, low: 2 } as const

export function taskCreatedAt(task: Task): string {
  return task.createdAt ?? task.updatedAt ?? `${task.plannedDate}T00:00:00+08:00`
}

export function compareTasks(a: Task, b: Task): number {
  return priorityOrder[a.priority] - priorityOrder[b.priority]
    || taskCreatedAt(a).localeCompare(taskCreatedAt(b))
    || a.id.localeCompare(b.id)
}

export const sortedTasks = (tasks: Task[]) => [...tasks].sort(compareTasks)

export const isActiveSession = (session: FocusSession) => !session.deletedAt

export const activeSessions = (state: Pick<AppState, 'sessions'>) => state.sessions.filter(isActiveSession)

export function visibleAppState(state: AppState): AppState {
  return { ...state, tasks: activeTasks(state), sessions: activeSessions(state) }
}
