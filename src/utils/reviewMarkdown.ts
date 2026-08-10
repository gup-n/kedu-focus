import { format, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { AppState, Review } from '../domain/types'

export function buildReviewMarkdown(state: AppState, review: Review) {
  const completed = state.tasks.filter(task => !task.deletedAt && task.completedAt?.slice(0, 10) === review.date).length
  const focusMinutes = state.sessions
    .filter(session => session.startedAt.slice(0, 10) === review.date)
    .reduce((total, session) => total + session.minutes, 0)
  const dateTitle = format(parseISO(review.date), 'yyyy年M月d日 EEEE', { locale: zhCN })
  const text = (value: string) => value.trim() || '（未填写）'

  return `# ${dateTitle}\n\n> 完成任务：${completed} 项 · 专注时长：${focusMinutes} 分钟\n\n## 今日收获\n\n${text(review.summary)}\n\n## 可以改进\n\n${text(review.improvement)}\n\n## 明日计划\n\n${text(review.tomorrow)}\n`
}

export function downloadReviewMarkdown(state: AppState, review: Review) {
  const blob = new Blob([buildReviewMarkdown(state, review)], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${review.date}-复盘.md`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
