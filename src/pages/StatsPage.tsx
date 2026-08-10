import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BedDouble, ChevronLeft, ChevronRight, Clock3, Moon, Play, Timer } from 'lucide-react'
import { useApp } from '../state/AppContext'
import {
  calculateStatistics,
  getStatisticsRange,
  selectedAverageSeconds,
  shanghaiDateKey,
  shiftStatisticsRange,
  type AverageBasis,
  type DateRange,
  type SleepStatistics,
  type StatisticsPeriod,
} from '../utils/statistics'

const periodLabels: Record<StatisticsPeriod, string> = { week: '周', month: '月', year: '年', custom: '自定义' }

function cn(...values: (string | false | undefined)[]) {
  return values.filter(Boolean).join(' ')
}

function duration(seconds: number) {
  const roundedMinutes = Math.round(seconds / 60)
  if (seconds > 0 && roundedMinutes === 0) return '< 1 分钟'
  if (roundedMinutes < 60) return `${roundedMinutes} 分钟`
  const hours = Math.floor(roundedMinutes / 60)
  const minutes = roundedMinutes % 60
  return `${hours} 小时${minutes ? ` ${minutes} 分` : ''}`
}

function shortDate(date: string) {
  const [, month, day] = date.split('-')
  return `${Number(month)}月${Number(day)}日`
}

function rangeTitle(period: StatisticsPeriod, range: DateRange) {
  if (period === 'year') return `${range.start.slice(0, 4)} 年`
  if (period === 'month') {
    const [year, month] = range.start.split('-')
    return `${year} 年 ${Number(month)} 月`
  }
  return `${shortDate(range.start)} — ${shortDate(range.end)}`
}

function Page({ action, children }: { action: ReactNode; children: ReactNode }) {
  return <div className="page stats-page"><div className="page-head"><div><p className="eyebrow">统计数据</p><h1>看见注意力去了哪里</h1></div>{action}</div>{children}</div>
}

function Card({ title, action, className, children }: { title?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={cn('card', className)}>{(title || action) && <div className="card-head">{title && <h2>{title}</h2>}{action}</div>}{children}</section>
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <Card className="metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></Card>
}

function StatsEmpty({ onStart }: { onStart: () => void }) {
  return <Card className="stats-empty"><Clock3/><div><h2>这个周期还没有专注刻度</h2><p>完成一次专注后，分类投入、趋势和时段分布会在这里自动生成。</p></div><button className="btn primary" onClick={onStart}><Play/> 开始一次专注</button></Card>
}

function clock(minutes: number | null) {
  if (minutes === null) return '—'
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function SleepStats({ sleep, onRecord }: { sleep: SleepStatistics; onRecord: () => void }) {
  const trend = sleep.trend.map(point => ({
    label: sleep.trendUnit === 'month' ? `${Number(point.key.slice(5, 7))}月` : `${Number(point.key.slice(5, 7))}/${Number(point.key.slice(8, 10))}`,
    hours: Math.round(point.seconds / 360) / 10,
  }))
  const maxCoverage = Math.max(...sleep.hourlyCoverageSeconds, 1)
  return <section className="sleep-stats-section" aria-labelledby="sleep-stats-title">
    <div className="stats-section-head"><div><p className="eyebrow">睡眠恢复</p><h2 id="sleep-stats-title">让恢复也有迹可循</h2></div><button className="btn quiet" onClick={onRecord}><BedDouble/> 记录睡眠</button></div>
    {!sleep.recordCount ? <Card className="sleep-stats-empty"><Moon/><div><h3>这个周期还没有睡眠记录</h3><p>按起床日期记录一段主睡眠，就能看到平均时长、作息与睡眠覆盖时段。</p></div></Card> : <div className="stats-grid sleep-stats-grid">
      <Card title="睡眠概览" action={<span className="card-caption">{sleep.recordCount} 晚记录</span>}>
        <div className="sleep-overview-grid"><div><span>平均时长</span><strong>{duration(sleep.averageDurationSeconds)}</strong></div><div><span>平均入睡</span><strong>{clock(sleep.averageBedtimeMinutes)}</strong></div><div><span>平均起床</span><strong>{clock(sleep.averageWakeMinutes)}</strong></div><div><span>平均评分</span><strong>{sleep.averageScore.toFixed(1)}<small> / 5</small></strong></div></div>
      </Card>
      <Card title="睡眠时长趋势" action={<span className="card-caption">按起床日</span>}>
        <div className="chart" aria-label="睡眠时长趋势图"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend}><defs><linearGradient id="sleepChartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#23b8b3" stopOpacity={.4}/><stop offset="1" stopColor="#23b8b3" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="4 6" vertical={false}/><XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={20}/><YAxis hide/><Tooltip formatter={(value) => `${Number(value).toFixed(1)} 小时`}/><Area type="monotone" dataKey="hours" name="睡眠" stroke="#23b8b3" strokeWidth={3} fill="url(#sleepChartFill)"/></AreaChart></ResponsiveContainer></div>
      </Card>
      <Card title="睡眠时段" action={<span className="card-caption">0—24 点覆盖</span>} className="sleep-hours-card">
        <div className="hour-grid sleep-hour-grid" aria-label="24 小时睡眠覆盖分布">{sleep.hourlyCoverageSeconds.map((seconds, hour) => <div key={hour} title={`${String(hour).padStart(2, '0')}:00 · 覆盖 ${duration(seconds)}`}><span style={{ opacity: seconds ? .18 + seconds / maxCoverage * .82 : .06 }}/><small>{hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}</small></div>)}</div>
        <p className="muted stats-time-note"><Moon/> 色块越深，代表更多睡眠覆盖了这个小时。</p>
      </Card>
    </div>}
  </section>
}

export default function StatsPage() {
  const { state } = useApp()
  const navigate = useNavigate()
  const today = shanghaiDateKey()
  const [period, setPeriod] = useState<StatisticsPeriod>('month')
  const [range, setRange] = useState<DateRange>(() => getStatisticsRange('month', today))
  const [custom, setCustom] = useState<DateRange>(() => ({ start: getStatisticsRange('week', today).start, end: today }))
  const [customError, setCustomError] = useState('')
  const [averageBasis, setAverageBasis] = useState<AverageBasis>('active')
  const result = useMemo(() => calculateStatistics(state, range), [range, state])

  function selectPeriod(next: StatisticsPeriod) {
    setPeriod(next)
    setCustomError('')
    setRange(next === 'custom' ? custom : getStatisticsRange(next, today))
  }

  function applyCustom() {
    try {
      const next = getStatisticsRange('custom', today, custom)
      setRange(next)
      setCustomError('')
    } catch (error) {
      setCustomError(error instanceof Error ? error.message : '统计范围无效。')
    }
  }

  function move(direction: -1 | 1) {
    const next = shiftStatisticsRange(period, range, direction)
    setRange(next)
    if (period === 'custom') setCustom(next)
  }

  const average = selectedAverageSeconds(result, averageBasis)
  const trend = result.trend.map(point => ({
    label: result.trendUnit === 'month'
      ? `${Number(point.key.slice(5, 7))}月`
      : `${Number(point.key.slice(5, 7))}/${Number(point.key.slice(8, 10))}`,
    minutes: Math.round(point.seconds / 6) / 10,
  }))
  const maxHourly = Math.max(...result.hourlySeconds, 1)

  return <Page action={<div className="segmented stats-periods" aria-label="统计周期">{(Object.keys(periodLabels) as StatisticsPeriod[]).map(item => <button key={item} className={period === item ? 'active' : ''} onClick={() => selectPeriod(item)}>{periodLabels[item]}</button>)}</div>}>
    <Card className="stats-range-card">
      <div className="range-navigator">
        <button onClick={() => move(-1)} aria-label="上一周期"><ChevronLeft/></button>
        <div><span>{periodLabels[period]}统计范围</span><strong>{rangeTitle(period, range)}</strong></div>
        <button onClick={() => move(1)} aria-label="下一周期"><ChevronRight/></button>
      </div>
      <div className="average-control"><span>日均口径</span><div className="segmented"><button className={averageBasis === 'active' ? 'active' : ''} onClick={() => setAverageBasis('active')}>有记录日</button><button className={averageBasis === 'calendar' ? 'active' : ''} onClick={() => setAverageBasis('calendar')}>周期自然日</button></div></div>
      {period === 'custom' && <div className="custom-range"><label>开始日期<input type="date" value={custom.start} onChange={event => setCustom({ ...custom, start: event.target.value })}/></label><span>至</span><label>结束日期<input type="date" value={custom.end} onChange={event => setCustom({ ...custom, end: event.target.value })}/></label><button className="btn quiet" onClick={applyCustom}>应用范围</button>{customError && <p role="alert">{customError}</p>}</div>}
    </Card>

    <div className="metrics stats-metrics">
      <Metric label="累计专注" value={duration(result.totalSeconds)} note={`${result.sessionCount} 次完成`}/>
      <Metric label="有记录天数" value={`${result.activeDays} 天`} note={`周期共 ${result.periodDays} 天`}/>
      <Metric label={averageBasis === 'active' ? '有记录日均' : '周期日均'} value={duration(average)} note={averageBasis === 'active' ? '只除以有专注记录的日期' : '除以范围内全部自然日'}/>
    </div>

    {!result.totalSeconds ? <StatsEmpty onStart={() => navigate('/timer')}/> : <div className="stats-grid">
      <Card title="分类投入" action={<span className="card-caption">按实际专注时长</span>}>
        <div className="bar-list">{result.categories.map(category => <div key={category.categoryId}><div><span><i style={{ background: category.color }}/>{category.name}</span><b>{duration(category.seconds)} · {category.percent.toFixed(1)}%</b></div><span><i style={{ width: `${category.percent}%`, background: category.color }}/></span></div>)}</div>
      </Card>
      <Card title={result.trendUnit === 'day' ? '每日趋势' : '每月趋势'} action={<span className="card-caption">北京时间</span>}>
        <div className="chart" aria-label="专注时长趋势图"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend}><defs><linearGradient id="statsChartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5b5ce2" stopOpacity={.38}/><stop offset="1" stopColor="#5b5ce2" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="4 6" vertical={false}/><XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={20}/><YAxis hide/><Tooltip formatter={(value) => duration(Number(value) * 60)} labelFormatter={(label) => `${label}`}/><Area type="monotone" dataKey="minutes" name="专注" stroke="#5b5ce2" strokeWidth={3} fill="url(#statsChartFill)"/></AreaChart></ResponsiveContainer></div>
      </Card>
      <Card title="专注时段" action={<span className="card-caption">0—24 点</span>}>
        <div className="hour-grid" aria-label="24 小时专注分布">{result.hourlySeconds.map((seconds, hour) => <div key={hour} title={`${String(hour).padStart(2, '0')}:00 · ${duration(seconds)}`}><span style={{ opacity: seconds ? .22 + seconds / maxHourly * .78 : .07 }}/><small>{hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}</small></div>)}</div>
        <p className="muted stats-time-note"><Timer/> 色块越深，代表这个小时投入的专注时间越多。</p>
      </Card>
    </div>}
    <SleepStats sleep={result.sleep} onRecord={() => navigate('/sleep')}/>
  </Page>
}
