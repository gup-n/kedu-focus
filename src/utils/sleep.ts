import { addDays, format, parseISO } from 'date-fns'

export interface SleepWindow {
  sleptAt: string
  wokeAt: string
  durationMinutes: number
}

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const datePattern = /^\d{4}-\d{2}-\d{2}$/

function validDate(date: string) {
  if (!datePattern.test(date)) return false
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === date
}

/** Parses both new fixed-UTC+8 values and legacy local values as Shanghai time. */
export function parseSleepTimestamp(value: string) {
  const explicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  const legacy = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+08:00` : `${value}+08:00`
  return Date.parse(explicitZone ? value : legacy)
}

export function defaultSleepDate(wakeDate: string) {
  if (!validDate(wakeDate)) return wakeDate
  const [year, month, day] = wakeDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10)
}

export function createSleepWindow(sleepDate: string, sleptTime: string, wakeDate: string, wokeTime: string): SleepWindow {
  if (!validDate(sleepDate)) throw new Error('请选择有效的入睡日期。')
  if (!validDate(wakeDate)) throw new Error('请选择有效的起床日期。')
  if (!timePattern.test(sleptTime) || !timePattern.test(wokeTime)) throw new Error('请输入有效的入睡和起床时间。')
  const sleptAt = `${sleepDate}T${sleptTime}:00+08:00`
  const wokeAt = `${wakeDate}T${wokeTime}:00+08:00`
  const durationMinutes = Math.round((parseSleepTimestamp(wokeAt) - parseSleepTimestamp(sleptAt)) / 60000)
  if (durationMinutes <= 0) throw new Error('起床时间必须晚于入睡时间。')
  if (durationMinutes > 24 * 60) throw new Error('单次睡眠时长不能超过 24 小时。')
  return { sleptAt, wokeAt, durationMinutes }
}

export function inferSleepWindow(wakeDate: string, sleptTime: string, wokeTime: string): SleepWindow {
  const parsedWakeDate = parseISO(wakeDate)
  if (!datePattern.test(wakeDate) || Number.isNaN(parsedWakeDate.getTime()) || format(parsedWakeDate, 'yyyy-MM-dd') !== wakeDate) throw new Error('请选择有效的起床日期。')
  if (!timePattern.test(sleptTime) || !timePattern.test(wokeTime)) throw new Error('请输入有效的入睡和起床时间。')
  const sleepDate = sleptTime <= wokeTime ? wakeDate : format(addDays(parsedWakeDate, -1), 'yyyy-MM-dd')
  const sleptAt = `${sleepDate}T${sleptTime}`
  const wokeAt = `${wakeDate}T${wokeTime}`
  const durationMinutes = Math.round((new Date(wokeAt).getTime() - new Date(sleptAt).getTime()) / 60000)
  if (durationMinutes <= 0) throw new Error('睡眠时长必须大于 0。')
  if (durationMinutes > 24 * 60) throw new Error('单次睡眠时长不能超过 24 小时。')
  return { sleptAt, wokeAt, durationMinutes }
}

export function formatSleepDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours ? `${hours} 小时` : ''}${hours && rest ? ' ' : ''}${rest ? `${rest} 分钟` : ''}`
}
