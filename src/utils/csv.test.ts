import { describe, expect, it } from 'vitest'
import { seedState } from '../data/seed'
import { createCsv, csvCell, sessionsCsv, sleepCsv, tasksCsv } from './csv'

describe('CSV export', () => {
  it('uses RFC4180 escaping for commas, quotes and newlines', () => {
    expect(csvCell('甲,乙')).toBe('"甲,乙"')
    expect(csvCell('他说"好"')).toBe('"他说""好"""')
    expect(createCsv([['标题', '内容'], ['多行', '第一行\n第二行']])).toBe('标题,内容\r\n多行,"第一行\n第二行"')
  })

  it('creates Chinese task, focus and sleep tables', () => {
    const state = structuredClone(seedState)
    state.tasks[0].note = '包含,逗号\n和"引号"'
    expect(tasksCsv(state)).toContain('任务ID,标题,说明')
    expect(tasksCsv(state)).toContain('"包含,逗号\n和""引号"""')
    expect(sessionsCsv(state)).toContain('记录ID,任务,分类,开始时间')
    expect(sleepCsv(state)).toContain('记录ID,日期,入睡时间')
  })

  it('hides tombstones from normal CSV while retaining deletion audit columns', () => {
    const state = structuredClone(seedState)
    state.tasks[0].deletedAt = '2026-08-10T10:00:00.000Z'
    state.sessions[0].deletedAt = '2026-08-10T10:00:00.000Z'
    state.sessions[0].updatedAt = '2026-08-10T10:00:00.000Z'

    const tasks = tasksCsv(state)
    const sessions = sessionsCsv(state)

    expect(tasks).toContain('删除时间,更新时间')
    expect(tasks).not.toContain(state.tasks[0].title)
    expect(sessions).toContain('备注,删除时间,更新时间')
    expect(sessions).not.toContain(state.sessions[0].id)
  })
})
