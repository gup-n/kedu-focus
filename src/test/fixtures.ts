import type { AppState } from '../domain/types'
import { addShanghaiDays, dateKeyToShanghaiStart, shanghaiDateKey } from '../utils/statistics'

const today = shanghaiDateKey()
const iso = (dayOffset: number, hour: number, minute = 0) => {
  const date = addShanghaiDays(today, dayOffset)
  return new Date(dateKeyToShanghaiStart(date) + (hour * 60 + minute) * 60_000).toISOString()
}

/** Rich data used only by tests. Production imports the empty state in data/seed.ts. */
export const demoState: AppState = {
  categories: [
    { id: 'work', name: '深度工作', color: '#5b5ce2' },
    { id: 'study', name: '学习', color: '#23b8b3' },
    { id: 'life', name: '生活', color: '#ff8b70' },
    { id: 'review', name: '复盘', color: '#a46ee5' },
  ],
  tasks: [
    { id: 't1', title: '完成产品原型的交互梳理', note: '整理主流程与异常状态', plannedDate: today, dueDate: today, priority: 'high', categoryId: 'work', estimatedPomodoros: 3, createdAt: iso(-4, 9) },
    { id: 't2', title: '阅读 TypeScript 章节', note: '记录三个可复用技巧', plannedDate: today, dueDate: today, priority: 'medium', categoryId: 'study', estimatedPomodoros: 2, createdAt: iso(-3, 9) },
    { id: 't3', title: '晚间散步 30 分钟', note: '不带耳机', plannedDate: today, dueDate: today, priority: 'low', categoryId: 'life', estimatedPomodoros: 1, createdAt: iso(-2, 9) },
    { id: 't4', title: '整理上周项目笔记', note: '归档到知识库', plannedDate: addShanghaiDays(today, -1), dueDate: addShanghaiDays(today, -1), priority: 'medium', categoryId: 'review', estimatedPomodoros: 1, createdAt: iso(-1, 9), completedAt: iso(-1, 18, 15) },
  ],
  sessions: [
    { id: 's1', taskId: 't1', categoryId: 'work', startedAt: iso(0, 9), endedAt: iso(0, 9, 25), minutes: 25 },
    { id: 's2', taskId: 't2', categoryId: 'study', startedAt: iso(0, 10), endedAt: iso(0, 10, 25), minutes: 25 },
    { id: 's3', categoryId: 'review', startedAt: iso(-1, 20), endedAt: iso(-1, 20, 25), minutes: 25 },
    { id: 's4', categoryId: 'work', startedAt: iso(-2, 14), endedAt: iso(-2, 14, 50), minutes: 50 },
    { id: 's5', categoryId: 'life', startedAt: iso(-3, 19), endedAt: iso(-3, 19, 25), minutes: 25 },
  ],
  reviews: [{ id: 'r1', date: addShanghaiDays(today, -1), summary: '完成了最重要的梳理工作。', improvement: '上午减少消息干扰。', tomorrow: '先处理高优先级原型任务。' }],
  sleep: [{ id: 'sl1', date: today, sleptAt: `${addShanghaiDays(today, -1)}T23:20`, wokeAt: `${today}T07:10`, score: 4 }],
  settings: { theme: 'light', focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
  timer: { phase: 'focus', status: 'idle', remainingSeconds: 1500, durationSeconds: 1500, elapsedSeconds: 0, rounds: 0, taskId: 't1' },
}
