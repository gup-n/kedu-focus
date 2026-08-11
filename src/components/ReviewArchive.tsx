import { useMemo, useState } from 'react'
import { BookOpenCheck, ChevronRight, Download, Search } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { exportFile } from '../utils/fileExport'
import { buildPeriodReviewMarkdown, periodReviewSummary, type ReviewPeriodKind } from '../utils/reviewPeriod'

const duration = (seconds: number) => seconds < 3600 ? `${Math.floor(seconds / 60)} 分钟` : `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分`
const sleepDuration = (minutes: number) => minutes ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分` : '暂无记录'

export function ReviewArchive({ selectedDate, onSelectDate }: { selectedDate: string; onSelectDate: (date: string) => void }) {
  const { state } = useApp()
  const [kind, setKind] = useState<ReviewPeriodKind>('week')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const summary = useMemo(() => periodReviewSummary(state, kind, selectedDate), [state, kind, selectedDate])
  const history = useMemo(() => state.reviews.filter(review => `${review.date}${review.summary}${review.improvement}${review.tomorrow}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => b.date.localeCompare(a.date)), [state.reviews, query])

  async function exportPeriod() {
    setNotice('')
    try {
      const result = await exportFile([buildPeriodReviewMarkdown(state, kind, selectedDate)], `刻度_${kind === 'week' ? '周复盘' : '月复盘'}_${summary.start}_${summary.end}.md`, 'text/markdown;charset=utf-8')
      setNotice(result === 'cancelled' ? '已取消导出' : result === 'shared' ? '已交给系统分享' : 'Markdown 已保存')
    } catch {
      setNotice('导出失败，请稍后重试')
    }
  }

  return <div className="review-archive">
    <section className="card period-review">
      <div className="card-head"><div><p className="eyebrow">周期回顾</p><h2>{summary.start} — {summary.end}</h2></div><div className="segmented"><button className={kind === 'week' ? 'active' : ''} onClick={() => setKind('week')}>周</button><button className={kind === 'month' ? 'active' : ''} onClick={() => setKind('month')}>月</button></div></div>
      <div className="period-metrics"><div><span>完成任务</span><strong>{summary.completedTasks}</strong><small>项</small></div><div><span>专注时长</span><strong>{duration(summary.focusSeconds)}</strong></div><div><span>平均睡眠</span><strong>{sleepDuration(summary.averageSleepMinutes)}</strong></div><div><span>文字复盘</span><strong>{summary.reviews.length}</strong><small>天</small></div></div>
      <div className="period-review-list">{summary.reviews.length ? summary.reviews.map(review => <button key={review.id} onClick={() => onSelectDate(review.date)}><BookOpenCheck/><span><b>{review.date}</b><small>{review.summary || review.improvement || review.tomorrow || '已记录空白复盘'}</small></span><ChevronRight/></button>) : <p>这个周期还没有文字复盘，先记录今天即可形成回顾。</p>}</div>
      <div className="save-row"><span>{notice}</span><button className="btn quiet" onClick={() => void exportPeriod()}><Download/> 导出{kind === 'week' ? '周' : '月'}复盘</button></div>
    </section>
    <section className="card review-history"><div className="card-head"><h2>历史复盘</h2><span>{history.length} 篇</span></div><label className="search"><Search/><input aria-label="搜索历史复盘" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索日期、收获、改进或计划…"/></label><div>{history.length ? history.map(review => <button key={review.id} onClick={() => onSelectDate(review.date)}><span><b>{review.date}</b><small>{review.summary || review.improvement || review.tomorrow || '空白复盘'}</small></span><ChevronRight/></button>) : <p className="muted">没有找到符合条件的复盘。</p>}</div></section>
  </div>
}
