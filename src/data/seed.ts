import type { AppState } from '../domain/types'

/**
 * Production starts with an empty workspace. The four categories are product
 * defaults rather than sample records and can be edited or archived by users.
 */
export const seedState: AppState = {
  categories: [
    { id: 'work', name: '深度工作', color: '#5b5ce2' },
    { id: 'study', name: '学习', color: '#23b8b3' },
    { id: 'life', name: '生活', color: '#ff8b70' },
    { id: 'review', name: '复盘', color: '#a46ee5' },
  ],
  tasks: [],
  completions: [],
  sessions: [],
  reviews: [],
  sleep: [],
  settings: {
    theme: 'light',
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    longBreakEvery: 4,
  },
  timer: {
    phase: 'focus',
    status: 'idle',
    remainingSeconds: 1500,
    durationSeconds: 1500,
    elapsedSeconds: 0,
    rounds: 0,
  },
}
