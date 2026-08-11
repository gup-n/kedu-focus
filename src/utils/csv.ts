import type { AppState } from '../domain/types'
import { exportFile } from './fileExport'

export function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function createCsv(rows: unknown[][]): string {
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n')
}

const categoryName = (state: AppState, id: string) => state.categories.find(category => category.id === id)?.name ?? '未分类'
const taskName = (state: AppState, id?: string) => !id ? '未关联任务' : state.tasks.find(task => task.id === id)?.title ?? '已删除任务'

export function tasksCsv(state: AppState) {
  return createCsv([
    ['任务ID', '标题', '说明', '计划日期', '截止日期', '优先级', '分类', '预计番茄数', '创建时间', '完成时间', '删除时间', '更新时间'],
    ...state.tasks.filter(task => !task.deletedAt).map(task => [task.id, task.title, task.note, task.plannedDate, task.dueDate, task.priority, categoryName(state, task.categoryId), task.estimatedPomodoros, task.createdAt, task.completedAt, task.deletedAt, task.updatedAt]),
  ])
}

export function sessionsCsv(state: AppState) {
  return createCsv([
    ['记录ID', '任务', '分类', '开始时间', '结束时间', '分钟', '精确秒数', '备注', '删除时间', '更新时间'],
    ...state.sessions.filter(session => !session.deletedAt).map(session => [session.id, taskName(state, session.taskId), categoryName(state, session.categoryId), session.startedAt, session.endedAt, session.minutes, session.seconds, session.note, session.deletedAt, session.updatedAt]),
  ])
}

export function sleepCsv(state: AppState) {
  return createCsv([
    ['记录ID', '日期', '入睡时间', '起床时间', '主观评分'],
    ...state.sleep.map(record => [record.id, record.date, record.sleptAt, record.wokeAt, record.score]),
  ])
}

export type CsvKind = 'tasks' | 'sessions' | 'sleep'

export function downloadCsv(state: AppState, kind: CsvKind) {
  const config = {
    tasks: ['任务', tasksCsv],
    sessions: ['专注记录', sessionsCsv],
    sleep: ['睡眠记录', sleepCsv],
  } as const
  const [name, factory] = config[kind]
  const date = new Date().toISOString().slice(0, 10)
  return exportFile(['\ufeff', factory(state)], `刻度_${name}_${date}.csv`, 'text/csv;charset=utf-8')
}
