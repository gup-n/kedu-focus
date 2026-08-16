export type Priority = 'high' | 'medium' | 'low'
export type RecurrenceKind = 'daily' | 'weekly' | 'weekdays'
export interface TaskRecurrence { kind: RecurrenceKind; weekdays?: number[] }
export interface Category { id: string; name: string; color: string; archived?: boolean; updatedAt?: string }
export interface Task { id: string; title: string; note: string; plannedDate: string; dueDate: string; priority: Priority; categoryId: string; estimatedPomodoros: number; recurrence?: TaskRecurrence; recurrenceSourceId?: string; createdAt?: string; completedAt?: string; updatedAt?: string; deletedAt?: string }
export interface TaskCompletion { id: string; recurrenceSourceId: string; title: string; categoryId: string; plannedDate: string; completedAt: string; compactedAt: string }
export interface FocusSession { id: string; taskId?: string; categoryId: string; startedAt: string; endedAt: string; minutes: number; seconds?: number; note?: string; updatedAt?: string; deletedAt?: string }
export interface Review { id: string; date: string; summary: string; improvement: string; tomorrow: string }
export interface SleepRecord { id: string; date: string; sleptAt: string; wokeAt: string; score: number }
export interface TimerState {
  phase: 'focus'|'shortBreak'|'longBreak'
  status: 'idle'|'running'|'paused'|'finished'
  remainingSeconds: number
  durationSeconds: number
  elapsedSeconds: number
  liveElapsedSeconds?: number
  startedAt?: string
  runStartedAt?: string
  taskId?: string
  rounds: number
}
export interface AppSettings { theme: 'light'|'dark'|'system'; focusMinutes: number; shortBreakMinutes: number; longBreakMinutes: number; longBreakEvery: number }
export interface AppState { tasks: Task[]; completions?: TaskCompletion[]; categories: Category[]; sessions: FocusSession[]; reviews: Review[]; sleep: SleepRecord[]; settings: AppSettings; timer: TimerState }
