import { format, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { AppState, Review } from '../domain/types'
import { exportFile } from './fileExport'

export function buildReviewMarkdown(state: AppState, review: Review) {
  const completed = state.tasks.filter(task => !task.deletedAt && task.completedAt?.slice(0, 10) === review.date).length
  const focusSeconds = state.sessions
    .filter(session => session.startedAt.slice(0, 10) === review.date)
    .reduce((total, session) => total + (session.seconds ?? session.minutes * 60), 0)
  const focusText = focusSeconds % 60 ? `${Math.floor(focusSeconds / 60)} 分 ${focusSeconds % 60} 秒` : `${focusSeconds / 60} 分钟`
  const dateTitle = format(parseISO(review.date), 'yyyy年M月d日 EEEE', { locale: zhCN })
  const text = (value: string) => value.trim() || '（未填写）'

  return `# ${dateTitle}\n\n> 完成任务：${completed} 项 · 专注时长：${focusText}\n\n## 今日收获\n\n${text(review.summary)}\n\n## 可以改进\n\n${text(review.improvement)}\n\n## 明日计划\n\n${text(review.tomorrow)}\n`
}

export function downloadReviewMarkdown(state: AppState, review: Review) {
  return exportFile([buildReviewMarkdown(state, review)], `${review.date}-复盘.md`, 'text/markdown;charset=utf-8')
}
