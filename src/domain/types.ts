export type Priority = 'high' | 'medium' | 'low'
export interface Category { id: string; name: string; color: string; archived?: boolean; updatedAt?: string }
export interface Task { id: string; title: string; note: string; plannedDate: string; dueDate: string; priority: Priority; categoryId: string; estimatedPomodoros: number; createdAt?: string; completedAt?: string; updatedAt?: string; deletedAt?: string }
export interface FocusSession { id: string; taskId?: string; categoryId: string; startedAt: string; endedAt: string; minutes: number; seconds?: number; note?: string; updatedAt?: string; deletedAt?: string }
export interface Review { id: string; date: string; summary: string; improvement: string; tomorrow: string }
export interface SleepRecord { id: string; date: string; sleptAt: string; wokeAt: string; score: number }
export interface TimerState {
  phase: 'focus'|'shortBreak'|'longBreak'
  status: 'idle'|'running'|'paused'|'finished'
  remainingSeconds: number
  durationSeconds: number
  elapsedSeconds: number
  startedAt?: string
  runStartedAt?: string
  taskId?: string
  rounds: number
}
export interface AppSettings { theme: 'light'|'dark'|'system'; focusMinutes: number; shortBreakMinutes: number; longBreakMinutes: number; longBreakEvery: number }
export interface AppState { tasks: Task[]; categories: Category[]; sessions: FocusSession[]; reviews: Review[]; sleep: SleepRecord[]; settings: AppSettings; timer: TimerState }
