import type { FocusSession, Task } from '../domain/types'
import { shanghaiDateKey } from './statistics'

export function availableTimerTasks(tasks: Task[], date = shanghaiDateKey()) {
  return tasks.filter(task => !task.completedAt && !task.deletedAt && task.plannedDate <= date)
}

export function sessionsForShanghaiDate(sessions: FocusSession[], date = shanghaiDateKey()) {
  return sessions
    .filter(session => !session.deletedAt && shanghaiDateKey(new Date(session.startedAt)) === date)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function focusRoundLabel(completedToday: number, longBreakEvery: number) {
  const interval = Math.max(1, longBreakEvery)
  return `今日第 ${completedToday + 1} 次 · 本组第 ${completedToday % interval + 1}/${interval} 轮`
}

export function shanghaiDateTimeInput(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}:${value.second}`
}

export function sessionTimeRange(startInput: string, endInput: string, now = Date.now()) {
  const withShanghaiOffset = (value: string) => `${value}${value.length === 16 ? ':00' : ''}+08:00`
  const startedAt = Date.parse(withShanghaiOffset(startInput))
  const endedAt = Date.parse(withShanghaiOffset(endInput))
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) throw new Error('请输入有效的开始和结束时间。')
  if (endedAt <= startedAt) throw new Error('结束时间必须晚于开始时间。')
  if (endedAt > now) throw new Error('结束时间不能晚于当前时间。')
  const seconds = Math.floor((endedAt - startedAt) / 1000)
  return {
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    seconds,
    minutes: Math.max(1, Math.ceil(seconds / 60)),
  }
}
