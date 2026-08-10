import type { AppState, FocusSession, SleepRecord } from '../domain/types'
import { parseSleepTimestamp } from './sleep'

export type StatisticsPeriod = 'week' | 'month' | 'year' | 'custom'
export type AverageBasis = 'active' | 'calendar'

export interface DateRange {
  start: string
  end: string
}

export interface StatisticsCategory {
  categoryId: string
  name: string
  color: string
  seconds: number
  percent: number
}

export interface StatisticsPoint {
  key: string
  seconds: number
}

export interface StatisticsResult {
  range: DateRange
  totalSeconds: number
  sessionCount: number
  activeDays: number
  periodDays: number
  activeDayAverageSeconds: number
  calendarDayAverageSeconds: number
  categories: StatisticsCategory[]
  trend: StatisticsPoint[]
  trendUnit: 'day' | 'month'
  hourlySeconds: number[]
  sleep: SleepStatistics
}

export interface SleepStatisticsPoint {
  key: string
  seconds: number
  count: number
}

export interface SleepStatistics {
  recordCount: number
  averageDurationSeconds: number
  averageScore: number
  averageBedtimeMinutes: number | null
  averageWakeMinutes: number | null
  trend: SleepStatisticsPoint[]
  trendUnit: 'day' | 'month'
  hourlyCoverageSeconds: number[]
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function parts(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

export function dateKeyToShanghaiStart(date: string) {
  const { year, month, day } = parts(date)
  return Date.UTC(year, month - 1, day) - SHANGHAI_OFFSET_MS
}

export function shanghaiDateKey(value: Date | number = Date.now()) {
  const timestamp = typeof value === 'number' ? value : value.getTime()
  return new Date(timestamp + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10)
}

function validDateKey(date: string) {
  if (!DATE_PATTERN.test(date)) return false
  const { year, month, day } = parts(date)
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === date
}

export function addShanghaiDays(date: string, amount: number) {
  return shanghaiDateKey(dateKeyToShanghaiStart(date) + amount * DAY_MS)
}

function addMonths(date: string, amount: number) {
  const { year, month } = parts(date)
  const target = new Date(Date.UTC(year, month - 1 + amount, 1))
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export function countRangeDays(range: DateRange) {
  return Math.round((dateKeyToShanghaiStart(range.end) - dateKeyToShanghaiStart(range.start)) / DAY_MS) + 1
}

export function getStatisticsRange(period: StatisticsPeriod, anchor: string, custom?: DateRange): DateRange {
  if (!validDateKey(anchor)) throw new Error('请选择有效日期。')
  if (period === 'custom') {
    if (!custom || !validDateKey(custom.start) || !validDateKey(custom.end)) throw new Error('请选择有效的开始和结束日期。')
    if (custom.start > custom.end) throw new Error('开始日期不能晚于结束日期。')
    return custom
  }

  const { year, month } = parts(anchor)
  if (period === 'year') return { start: `${year}-01-01`, end: `${year}-12-31` }
  if (period === 'month') {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    return { start, end: addShanghaiDays(addMonths(start, 1), -1) }
  }

  const weekday = new Date(`${anchor}T00:00:00Z`).getUTCDay()
  const start = addShanghaiDays(anchor, -(weekday === 0 ? 6 : weekday - 1))
  return { start, end: addShanghaiDays(start, 6) }
}

export function shiftStatisticsRange(period: StatisticsPeriod, range: DateRange, direction: -1 | 1): DateRange {
  if (period === 'custom') {
    const days = countRangeDays(range)
    return { start: addShanghaiDays(range.start, direction * days), end: addShanghaiDays(range.end, direction * days) }
  }
  if (period === 'week') return { start: addShanghaiDays(range.start, direction * 7), end: addShanghaiDays(range.end, direction * 7) }
  if (period === 'month') {
    const start = addMonths(range.start, direction)
    return { start, end: addShanghaiDays(addMonths(start, 1), -1) }
  }
  const year = parts(range.start).year + direction
  return { start: `${year}-01-01`, end: `${year}-12-31` }
}

function sessionSeconds(session: FocusSession) {
  const seconds = session.seconds ?? session.minutes * 60
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0
}

function allocateSession(
  session: FocusSession,
  rangeStart: number,
  rangeEnd: number,
  receive: (start: number, seconds: number) => void,
) {
  const wallStart = Date.parse(session.startedAt)
  const wallEnd = Date.parse(session.endedAt)
  const actualSeconds = sessionSeconds(session)
  if (!Number.isFinite(wallStart) || !Number.isFinite(wallEnd) || wallEnd <= wallStart || !actualSeconds) return 0
  const clippedStart = Math.max(wallStart, rangeStart)
  const clippedEnd = Math.min(wallEnd, rangeEnd)
  if (clippedEnd <= clippedStart) return 0

  const scale = actualSeconds / ((wallEnd - wallStart) / 1000)
  let cursor = clippedStart
  let allocated = 0
  while (cursor < clippedEnd) {
    const shifted = cursor + SHANGHAI_OFFSET_MS
    const nextHour = (Math.floor(shifted / HOUR_MS) + 1) * HOUR_MS - SHANGHAI_OFFSET_MS
    const segmentEnd = Math.min(clippedEnd, nextHour)
    const seconds = ((segmentEnd - cursor) / 1000) * scale
    receive(cursor, seconds)
    allocated += seconds
    cursor = segmentEnd
  }
  return allocated
}

function monthKeys(range: DateRange) {
  const keys: string[] = []
  let cursor = range.start.slice(0, 7) + '-01'
  const end = range.end.slice(0, 7) + '-01'
  while (cursor <= end) {
    keys.push(cursor.slice(0, 7))
    cursor = addMonths(cursor, 1)
  }
  return keys
}

function dayKeys(range: DateRange) {
  return Array.from({ length: countRangeDays(range) }, (_, index) => addShanghaiDays(range.start, index))
}

function circularAverageMinutes(values: number[]) {
  if (!values.length) return null
  const angles = values.map(value => value / (24 * 60) * Math.PI * 2)
  const sine = angles.reduce((sum, angle) => sum + Math.sin(angle), 0)
  const cosine = angles.reduce((sum, angle) => sum + Math.cos(angle), 0)
  const angle = Math.atan2(sine, cosine)
  return Math.round((((angle < 0 ? angle + Math.PI * 2 : angle) / (Math.PI * 2)) * 24 * 60)) % (24 * 60)
}

function shanghaiMinuteOfDay(timestamp: number) {
  const shifted = new Date(timestamp + SHANGHAI_OFFSET_MS)
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
}

function validSleepRecord(record: SleepRecord) {
  const start = parseSleepTimestamp(record.sleptAt)
  const end = parseSleepTimestamp(record.wokeAt)
  return validDateKey(record.date) && Number.isFinite(start) && Number.isFinite(end) && end > start && end - start <= DAY_MS
    ? { start, end }
    : undefined
}

function calculateSleepStatistics(records: SleepRecord[], range: DateRange, trendUnit: 'day' | 'month', trendKeys: string[]): SleepStatistics {
  const selected = records
    .filter(record => record.date >= range.start && record.date <= range.end)
    .map(record => ({ record, window: validSleepRecord(record) }))
    .filter((item): item is { record: SleepRecord; window: { start: number; end: number } } => !!item.window)
  const trendMap = new Map(trendKeys.map(key => [key, { seconds: 0, count: 0 }]))
  const hourlyCoverageSeconds = Array.from({ length: 24 }, () => 0)
  const bedtimes: number[] = []
  const wakeTimes: number[] = []
  let durationSeconds = 0
  let scoreTotal = 0

  for (const { record, window } of selected) {
    const seconds = (window.end - window.start) / 1000
    const trendKey = trendUnit === 'month' ? record.date.slice(0, 7) : record.date
    const trendValue = trendMap.get(trendKey)
    if (trendValue) {
      trendValue.seconds += seconds
      trendValue.count += 1
    }
    durationSeconds += seconds
    scoreTotal += Number.isFinite(record.score) ? record.score : 0
    bedtimes.push(shanghaiMinuteOfDay(window.start))
    wakeTimes.push(shanghaiMinuteOfDay(window.end))

    let cursor = window.start
    while (cursor < window.end) {
      const shifted = cursor + SHANGHAI_OFFSET_MS
      const hour = new Date(shifted).getUTCHours()
      const nextHour = (Math.floor(shifted / HOUR_MS) + 1) * HOUR_MS - SHANGHAI_OFFSET_MS
      const segmentEnd = Math.min(window.end, nextHour)
      hourlyCoverageSeconds[hour] += (segmentEnd - cursor) / 1000
      cursor = segmentEnd
    }
  }

  return {
    recordCount: selected.length,
    averageDurationSeconds: selected.length ? durationSeconds / selected.length : 0,
    averageScore: selected.length ? scoreTotal / selected.length : 0,
    averageBedtimeMinutes: circularAverageMinutes(bedtimes),
    averageWakeMinutes: circularAverageMinutes(wakeTimes),
    trend: trendKeys.map(key => {
      const value = trendMap.get(key) ?? { seconds: 0, count: 0 }
      return { key, seconds: value.count ? value.seconds / value.count : 0, count: value.count }
    }),
    trendUnit,
    hourlyCoverageSeconds,
  }
}

export function calculateStatistics(
  state: Pick<AppState, 'sessions' | 'categories'> & Partial<Pick<AppState, 'sleep'>>,
  range: DateRange,
): StatisticsResult {
  if (!validDateKey(range.start) || !validDateKey(range.end) || range.start > range.end) throw new Error('统计范围无效。')
  const periodDays = countRangeDays(range)
  const trendUnit = periodDays > 62 ? 'month' : 'day'
  const trendKeys = trendUnit === 'month' ? monthKeys(range) : dayKeys(range)
  const trendMap = new Map(trendKeys.map(key => [key, 0]))
  const categoryMap = new Map<string, number>()
  const activeDays = new Set<string>()
  const hourlySeconds = Array.from({ length: 24 }, () => 0)
  const rangeStart = dateKeyToShanghaiStart(range.start)
  const rangeEnd = dateKeyToShanghaiStart(addShanghaiDays(range.end, 1))
  let totalSeconds = 0
  let sessionCount = 0

  for (const session of state.sessions) {
    if (session.deletedAt) continue
    const allocated = allocateSession(session, rangeStart, rangeEnd, (segmentStart, seconds) => {
      const shifted = new Date(segmentStart + SHANGHAI_OFFSET_MS)
      const dayKey = shifted.toISOString().slice(0, 10)
      const trendKey = trendUnit === 'month' ? dayKey.slice(0, 7) : dayKey
      trendMap.set(trendKey, (trendMap.get(trendKey) ?? 0) + seconds)
      hourlySeconds[shifted.getUTCHours()] += seconds
      activeDays.add(dayKey)
      categoryMap.set(session.categoryId, (categoryMap.get(session.categoryId) ?? 0) + seconds)
    })
    if (allocated > 0) {
      sessionCount += 1
      totalSeconds += allocated
    }
  }

  const categoryDetails = new Map(state.categories.map(category => [category.id, category]))
  const categories = [...categoryMap.entries()]
    .map(([categoryId, seconds]) => {
      const category = categoryDetails.get(categoryId)
      return {
        categoryId,
        name: category?.name ?? '已删除分类',
        color: category?.color ?? '#8b8fa8',
        seconds,
        percent: totalSeconds ? seconds / totalSeconds * 100 : 0,
      }
    })
    .sort((a, b) => b.seconds - a.seconds)

  return {
    range,
    totalSeconds,
    sessionCount,
    activeDays: activeDays.size,
    periodDays,
    activeDayAverageSeconds: activeDays.size ? totalSeconds / activeDays.size : 0,
    calendarDayAverageSeconds: totalSeconds / periodDays,
    categories,
    trend: trendKeys.map(key => ({ key, seconds: trendMap.get(key) ?? 0 })),
    trendUnit,
    hourlySeconds,
    sleep: calculateSleepStatistics(state.sleep ?? [], range, trendUnit, trendKeys),
  }
}

export function selectedAverageSeconds(result: StatisticsResult, basis: AverageBasis) {
  return basis === 'active' ? result.activeDayAverageSeconds : result.calendarDayAverageSeconds
}
