import { useState } from 'react'
import { BedDouble, ChevronRight, Moon } from 'lucide-react'
import type { SleepRecord } from '../domain/types'
import { formatSleepDuration, parseSleepTimestamp } from '../utils/sleep'

function durationMinutes(record: SleepRecord) {
  return Math.round((parseSleepTimestamp(record.wokeAt) - parseSleepTimestamp(record.sleptAt)) / 60000)
}

function shortDate(value: string) {
  const [, month, day] = value.split('-')
  return `${Number(month)}月${Number(day)}日`
}

export function SleepHistory({ records, selectedDate, onSelect }: { records: SleepRecord[]; selectedDate: string; onSelect: (date: string) => void }) {
  const [page, setPage] = useState(1)
  const pageSize = 10
  const ordered = [...records].sort((left, right) => right.date.localeCompare(left.date))
  const pageCount = Math.max(1, Math.ceil(ordered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const recent = ordered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  return <section className="card sleep-history-card">
    <div className="card-head"><h2>近期睡眠</h2><span className="card-caption">按起床日期</span></div>
    {!ordered.length ? <div className="sleep-history-empty"><Moon/><p>保存第一晚睡眠后，这里会形成可以快速回看的时间刻度。</p></div> : <><div className="sleep-history-list">{recent.map(record => <button key={record.id} className={record.date === selectedDate ? 'selected' : ''} onClick={() => onSelect(record.date)}>
      <span><BedDouble/><b>{shortDate(record.date)}</b></span>
      <div><strong>{record.sleptAt.slice(11, 16)} → {record.wokeAt.slice(11, 16)}</strong><small>{formatSleepDuration(durationMinutes(record))}</small></div>
      <em aria-label={`睡眠评分 ${record.score} 分`}>{record.score} / 5</em><ChevronRight/>
    </button>)}</div>{ordered.length > pageSize && <div className="review-pagination sleep-pagination" aria-label="睡眠历史分页"><button disabled={currentPage === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>上一页</button><span>第 {currentPage} / {pageCount} 页</span><button disabled={currentPage === pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>下一页</button></div>}</>}
  </section>
}
