import { describe, expect, it } from 'vitest'
import { createSleepWindow, defaultSleepDate, formatSleepDuration, inferSleepWindow, parseSleepTimestamp } from './sleep'

describe('createSleepWindow', () => {
  it('supports an explicit same-day early-morning sleep', () => {
    expect(createSleepWindow('2026-08-10', '02:00', '2026-08-10', '08:00')).toEqual({
      sleptAt: '2026-08-10T02:00:00+08:00',
      wokeAt: '2026-08-10T08:00:00+08:00',
      durationMinutes: 360,
    })
  })

  it('supports an explicit overnight sleep and defaults to the previous date', () => {
    expect(defaultSleepDate('2026-08-10')).toBe('2026-08-09')
    expect(createSleepWindow('2026-08-09', '23:30', '2026-08-10', '07:00').durationMinutes).toBe(450)
  })

  it('rejects reversed and longer-than-24-hour windows', () => {
    expect(() => createSleepWindow('2026-08-10', '09:00', '2026-08-10', '08:00')).toThrow('晚于入睡')
    expect(() => createSleepWindow('2026-08-08', '07:00', '2026-08-10', '08:00')).toThrow('不能超过 24 小时')
  })

  it('parses legacy no-offset values as fixed Shanghai time', () => {
    expect(parseSleepTimestamp('2026-08-10T08:00')).toBe(Date.parse('2026-08-10T08:00:00+08:00'))
  })
})

describe('inferSleepWindow', () => {
  it('keeps an early-morning sleep on the wake date', () => {
    expect(inferSleepWindow('2026-08-10', '02:00', '08:00')).toEqual({
      sleptAt: '2026-08-10T02:00',
      wokeAt: '2026-08-10T08:00',
      durationMinutes: 360,
    })
  })

  it('infers the previous date when bedtime is later than wake time', () => {
    const result = inferSleepWindow('2026-08-10', '23:30', '07:00')
    expect(result).toEqual({ sleptAt: '2026-08-09T23:30', wokeAt: '2026-08-10T07:00', durationMinutes: 450 })
    expect(formatSleepDuration(result.durationMinutes)).toBe('7 小时 30 分钟')
  })

  it('rejects zero-length and invalid dates', () => {
    expect(() => inferSleepWindow('2026-08-10', '08:00', '08:00')).toThrow('必须大于 0')
    expect(() => inferSleepWindow('2026-02-30', '02:00', '08:00')).toThrow('有效的起床日期')
  })
})
