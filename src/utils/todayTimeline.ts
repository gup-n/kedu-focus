import type { FocusSession } from '../domain/types'

const RANGE_START_MINUTES = 7 * 60
const RANGE_MINUTES = 15 * 60
const MIN_BLOCK_WIDTH = 4
const LANE_TOPS = [33, 5, 61] as const

const secondsOf = (session: FocusSession) => Math.max(0, Math.round(session.seconds ?? session.minutes * 60))
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))
const clock = (value: string) => {
  const date = new Date(value)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function compactTimelineDuration(seconds: number) {
  const whole = Math.max(0, Math.round(seconds))
  if (whole < 60) return `${whole}秒`
  const minutes = Math.max(1, Math.round(whole / 60))
  if (minutes < 60) return `${minutes}分`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}时${remainder}分` : `${hours}时`
}

export interface TimelinePlacement {
  session: FocusSession
  left: number
  width: number
  lane: number
  top: number
  label: string
  range: string
}

export function buildTodayTimeline(sessions: FocusSession[]): TimelinePlacement[] {
  const laneEnds = [-Infinity, -Infinity, -Infinity]
  return [...sessions]
    .sort((first, second) => Date.parse(first.startedAt) - Date.parse(second.startedAt) || first.id.localeCompare(second.id))
    .map(session => {
      const started = new Date(session.startedAt)
      const startMinutes = started.getHours() * 60 + started.getMinutes() + started.getSeconds() / 60
      const left = clamp((startMinutes - RANGE_START_MINUTES) / RANGE_MINUTES * 100, 0, 96)
      const width = Math.min(100 - left, Math.max(MIN_BLOCK_WIDTH, secondsOf(session) / (RANGE_MINUTES * 60) * 100))
      let lane = laneEnds.findIndex(end => left >= end + 0.6)
      if (lane < 0) lane = laneEnds.indexOf(Math.min(...laneEnds))
      laneEnds[lane] = Math.max(laneEnds[lane], left + width)
      return {
        session,
        left,
        width,
        lane,
        top: LANE_TOPS[lane],
        label: compactTimelineDuration(secondsOf(session)),
        range: `${clock(session.startedAt)}–${clock(session.endedAt)}`,
      }
    })
}

export function timelineNowPosition(now: Date) {
  const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
  return clamp((minutes - RANGE_START_MINUTES) / RANGE_MINUTES * 100, 2, 98)
}
