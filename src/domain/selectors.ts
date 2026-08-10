import type { AppState, FocusSession, Task } from './types'

export const isActiveTask = (task: Task) => !task.deletedAt

export const activeTasks = (state: Pick<AppState, 'tasks'>) => state.tasks.filter(isActiveTask)

export const isActiveSession = (session: FocusSession) => !session.deletedAt

export const activeSessions = (state: Pick<AppState, 'sessions'>) => state.sessions.filter(isActiveSession)

export function visibleAppState(state: AppState): AppState {
  return { ...state, tasks: activeTasks(state), sessions: activeSessions(state) }
}
