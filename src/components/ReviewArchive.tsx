import { useMemo, useRef, useState, type TouchEvent } from 'react'
import { addDays, eachDayOfInterval, format, parseISO, subDays } from 'date-fns'
import { BookOpenCheck, ChevronLeft, ChevronRight, Download, Pencil, Search, X } from 'lucide-react'
import { useApp } from '../state/AppContext'
import type { Review } from '../domain/types'
import { exportFile, exportFiles } from '../utils/fileExport'
import { buildPeriodReviewMarkdown, periodReviewSummary, type ReviewPeriodKind } from '../utils/reviewPeriod'
import { buildReviewMarkdown } from '../utils/reviewMarkdown'

const duration = (seconds: number) => seconds < 3600 ? `${Math.floor(seconds / 60)} 分钟` : `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分`
const sleepDuration = (minutes: number) => minutes ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分` : '暂无记录'

function ReviewPreview({ review, state, close, edit, move }: { review: Review; state: ReturnType<typeof useApp>['state']; close: () => void; edit: () => void; move: (date: string) => void }) {
  const touchStart = useRef<{ x: number; y: number } | undefined>(undefined)
  const markdown = buildReviewMarkdown(state, review)
  const title = format(parseISO(review.date), 'yyyy年M月d日')
  const text = (value: string) => value.trim() || '（未填写）'
  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    const touch = event.touches[0]
    if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY }
  }
  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = touchStart.current
    touchStart.current = undefined
    const touch = event.changedTouches[0]
    if (!start || !touch) return
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return
    const nextDate = deltaX < 0 ? addDays(parseISO(review.date), 1) : subDays(parseISO(review.date), 1)
    move(format(nextDate, 'yyyy-MM-dd'))
  }
  return <div className="review-preview-backdrop" role="presentation">
    <section className="review-preview" role="dialog" aria-modal="true" aria-labelledby="review-preview-title" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={() => { touchStart.current = undefined }}>
      <header className="review-preview-head"><button className="review-preview-nav" onClick={() => move(format(subDays(parseISO(review.date), 1), 'yyyy-MM-dd'))} aria-label="上一页"><ChevronLeft /><span>上一页</span></button><span aria-hidden="true" /><button className="review-preview-nav" onClick={() => move(format(addDays(parseISO(review.date), 1), 'yyyy-MM-dd'))} aria-label="下一页"><span>下一页</span><ChevronRight /></button><button className="review-preview-close" onClick={close} aria-label="关闭预览"><X /></button></header>
      <article className="review-markdown-preview"><h1 id="review-preview-title">{title}</h1><blockquote>{markdown.split('\n').find(line => line.startsWith('> '))?.slice(2)}</blockquote><section><h2>今日收获</h2><p>{text(review.summary)}</p></section><section><h2>可以改进</h2><p>{text(review.improvement)}</p></section><section><h2>明日计划</h2><p>{text(review.tomorrow)}</p></section></article>
      <footer className="review-preview-actions"><button className="btn quiet" onClick={edit}><Pencil /> 编辑这一天</button><button className="btn quiet" onClick={close}>返回历史复盘</button></footer>
    </section>
  </div>
}

export function ReviewArchive({ selectedDate, onSelectDate }: { selectedDate: string; onSelectDate: (date: string) => void }) {
  const { state } = useApp()
  const [kind, setKind] = useState<ReviewPeriodKind>('week')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [historyPage, setHistoryPage] = useState(1)
  const [previewDate, setPreviewDate] = useState<string>()
  const [exportOpen, setExportOpen] = useState(false)
  const [exportStart, setExportStart] = useState(selectedDate)
  const [exportEnd, setExportEnd] = useState(selectedDate)
  const [exportMode, setExportMode] = useState<'single' | 'multiple'>('single')
  const summary = useMemo(() => periodReviewSummary(state, kind, selectedDate), [state, kind, selectedDate])
  const history = useMemo(() => state.reviews.filter(review => `${review.date}${review.summary}${review.improvement}${review.tomorrow}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => b.date.localeCompare(a.date)), [state.reviews, query])
  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(history.length / pageSize))
  const currentPage = Math.min(historyPage, pageCount)
  const visibleHistory = history.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const previewReview = previewDate ? state.reviews.find(review => review.date === previewDate) ?? { id: `preview-${previewDate}`, date: previewDate, summary: '', improvement: '', tomorrow: '' } : undefined

  async function exportPeriod() {
    setNotice('')
    try {
      const result = await exportFile([buildPeriodReviewMarkdown(state, kind, selectedDate)], `刻度_${kind === 'week' ? '周复盘' : '月复盘'}_${summary.start}_${summary.end}.md`, 'text/markdown;charset=utf-8')
      setNotice(result === 'cancelled' ? '已取消导出' : result === 'shared' ? '已交给系统分享' : 'Markdown 已保存')
    } catch { setNotice('导出失败，请稍后重试') }
  }

  async function exportSelectedReviews() {
    setNotice('')
    try {
      const start = parseISO(exportStart)
      const end = parseISO(exportEnd)
      if (end < start) throw new Error('结束日期不能早于开始日期。')
      const reviews = eachDayOfInterval({ start, end }).map(day => format(day, 'yyyy-MM-dd')).map(date => state.reviews.find(review => review.date === date) ?? { id: `export-${date}`, date, summary: '', improvement: '', tomorrow: '' })
      const valid = reviews.filter(review => review.summary.trim() || review.improvement.trim() || review.tomorrow.trim())
      if (!valid.length) throw new Error('所选日期没有可导出的复盘内容。')
      if (exportMode === 'single') {
        const markdown = valid.map(review => buildReviewMarkdown(state, review)).join('\n---\n\n')
        await exportFile([markdown], `刻度_复盘_${exportStart}_${exportEnd}.md`, 'text/markdown;charset=utf-8')
      } else {
        await exportFiles(valid.map(review => ({ contents: [buildReviewMarkdown(state, review)], filename: `${review.date}-复盘.md`, type: 'text/markdown;charset=utf-8' })))
      }
      setNotice(exportMode === 'single' ? '已导出合并复盘文件。' : `已导出 ${valid.length} 个复盘文件。`)
      setExportOpen(false)
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : '导出失败，请稍后重试') }
  }

  function openPreview(date: string) { onSelectDate(date); setPreviewDate(date) }
  function editPreview() { if (!previewReview) return; onSelectDate(previewReview.date); setPreviewDate(undefined) }

  return <div className="review-archive">
    <section className="card review-history"><div className="card-head"><div><p className="eyebrow">历史复盘</p><h2>完整记录与周期复盘</h2></div><span>{history.length} 篇</span></div>
      <div className="review-period-toolbar"><div><p className="eyebrow">周期回顾</p><b>{summary.start} — {summary.end}</b></div><div className="segmented"><button className={kind === 'week' ? 'active' : ''} onClick={() => setKind('week')}>周</button><button className={kind === 'month' ? 'active' : ''} onClick={() => setKind('month')}>月</button></div></div>
      <div className="period-metrics"><div><span>完成任务</span><strong>{summary.completedTasks}</strong><small>项</small></div><div><span>专注时长</span><strong>{duration(summary.focusSeconds)}</strong></div><div><span>平均睡眠</span><strong>{sleepDuration(summary.averageSleepMinutes)}</strong></div><div><span>文字复盘</span><strong>{summary.reviews.length}</strong><small>天</small></div></div>
      <div className="period-review-actions"><span>{notice}</span><div className="data-actions"><button className="btn quiet" aria-label={`导出${kind === 'week' ? '周' : '月'}复盘`} onClick={() => void exportPeriod()}><Download /> 导出{kind === 'week' ? '周' : '月'}复盘</button><button className="btn quiet" onClick={() => setExportOpen(true)}><Download /> 按日期导出</button></div></div>
      <label className="search"><Search /><input aria-label="搜索历史复盘" value={query} onChange={event => { setQuery(event.target.value); setHistoryPage(1) }} placeholder="搜索日期、收获、改进或计划…" /></label>
      <div className="review-history-list">{history.length ? visibleHistory.map(review => <button key={review.id} onClick={() => openPreview(review.date)}><BookOpenCheck /><span><b>{review.date}</b><small>{review.summary || review.improvement || review.tomorrow || '空白复盘'}</small></span><ChevronRight /></button>) : <p className="muted">没有找到符合条件的复盘。</p>}</div>
      {history.length > pageSize && <nav className="review-pagination" aria-label="历史复盘分页"><button className="review-page-button" type="button" disabled={currentPage === 1} onClick={() => setHistoryPage(page => Math.max(1, page - 1))}><span>上一页</span></button><span className="review-page-status">第 {currentPage} / {pageCount} 页</span><button className="review-page-button" type="button" disabled={currentPage === pageCount} onClick={() => setHistoryPage(page => Math.min(pageCount, page + 1))}><span>下一页</span></button></nav>}
    </section>
    {exportOpen && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setExportOpen(false)}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="review-export-title"><div className="dialog-head"><h2 id="review-export-title">按日期导出复盘</h2><button onClick={() => setExportOpen(false)} aria-label="关闭"><X /></button></div><div className="form-grid"><label>开始日期<input type="date" value={exportStart} onChange={event => setExportStart(event.target.value)} /></label><label>结束日期<input type="date" value={exportEnd} onChange={event => setExportEnd(event.target.value)} /></label></div><div className="segmented export-mode"><button className={exportMode === 'single' ? 'active' : ''} onClick={() => setExportMode('single')}>合并为单个文件</button><button className={exportMode === 'multiple' ? 'active' : ''} onClick={() => setExportMode('multiple')}>每一天一个文件</button></div><div className="dialog-actions"><button className="btn quiet" onClick={() => setExportOpen(false)}>取消</button><button className="btn primary" onClick={() => void exportSelectedReviews()}><Download /> 开始导出</button></div></section></div>}
    {previewReview && <ReviewPreview review={previewReview} state={state} close={() => setPreviewDate(undefined)} edit={editPreview} move={date => { onSelectDate(date); setPreviewDate(date) }} />}
  </div>
}
