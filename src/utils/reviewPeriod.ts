import { endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import type { AppState } from '../domain/types'

export type ReviewPeriodKind = 'week' | 'month'

export function reviewPeriod(kind: ReviewPeriodKind, anchor: string) {
  const date = parseISO(anchor)
  const start = kind === 'week' ? startOfWeek(date, { weekStartsOn: 1 }) : startOfMonth(date)
  const end = kind === 'week' ? endOfWeek(date, { weekStartsOn: 1 }) : endOfMonth(date)
  return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') }
}

export function periodReviewSummary(state: AppState, kind: ReviewPeriodKind, anchor: string) {
  const range = reviewPeriod(kind, anchor)
  const inside = (date: string) => date >= range.start && date <= range.end
  const reviews = state.reviews.filter(review => inside(review.date)).sort((a, b) => a.date.localeCompare(b.date))
  const completedTasks = state.tasks.filter(task => !task.deletedAt && task.completedAt && inside(task.completedAt.slice(0, 10))).length
  const focusSeconds = state.sessions.filter(session => !session.deletedAt && inside(session.startedAt.slice(0, 10))).reduce((sum, session) => sum + (session.seconds ?? session.minutes * 60), 0)
  const sleep = state.sleep.filter(record => inside(record.date))
  const averageSleepMinutes = sleep.length ? Math.round(sleep.reduce((sum, record) => sum + (Date.parse(record.wokeAt) - Date.parse(record.sleptAt)) / 60000, 0) / sleep.length) : 0
  return { ...range, reviews, completedTasks, focusSeconds, averageSleepMinutes }
}

const duration = (seconds: number) => `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分钟`
const sleepDuration = (minutes: number) => minutes ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟` : '无记录'
const text = (value: string) => value.trim() || '（未填写）'

export function buildPeriodReviewMarkdown(state: AppState, kind: ReviewPeriodKind, anchor: string) {
  const summary = periodReviewSummary(state, kind, anchor)
  const title = kind === 'week' ? '周复盘' : '月复盘'
  const entries = summary.reviews.length ? summary.reviews.map(review => `## ${review.date}\n\n### 今日收获\n\n${text(review.summary)}\n\n### 可以改进\n\n${text(review.improvement)}\n\n### 明日计划\n\n${text(review.tomorrow)}`).join('\n\n') : '## 每日复盘\n\n本周期暂无文字复盘。'
  return `# ${title}｜${summary.start} 至 ${summary.end}\n\n> 完成任务：${summary.completedTasks} 项 · 专注：${duration(summary.focusSeconds)} · 平均睡眠：${sleepDuration(summary.averageSleepMinutes)}\n\n${entries}\n`
}
