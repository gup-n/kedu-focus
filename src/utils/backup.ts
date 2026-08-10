import type { AppState, Category, FocusSession, Review, SleepRecord, Task } from '../domain/types'

export const BACKUP_FORMAT = 'focus-planner-backup'
export const BACKUP_SCHEMA_VERSION = 1 as const

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT
  schemaVersion: typeof BACKUP_SCHEMA_VERSION
  exportedAt: string
  data: AppState
}

export interface BackupPreview {
  exportedAt: string
  tasks: number
  categories: number
  sessions: number
  reviews: number
  sleep: number
  deletedTasks: number
  deletedSessions: number
}

export type EntityCollection = 'tasks' | 'categories' | 'sessions' | 'reviews' | 'sleep'
export type ImportEntity = Task | Category | FocusSession | Review | SleepRecord

export interface MergeConflict {
  key: string
  collection: EntityCollection
  id: string
  label: string
  local: ImportEntity
  imported: ImportEntity
}

export interface MergePlan {
  state: AppState
  conflicts: MergeConflict[]
}

export type ConflictChoice = 'local' | 'imported'

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupValidationError'
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isIsoDate = (value: unknown) => isString(value) && !Number.isNaN(Date.parse(value))
const isDateKey = (value: unknown) => isString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value)

function fail(message: string): never {
  throw new BackupValidationError(message)
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`备份中的“${label}”必须是数组。`)
  return value
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isObject(value)) fail(`备份中的“${label}”格式不正确。`)
  return value
}

function requireId(record: Record<string, unknown>, label: string) {
  if (!isString(record.id) || !record.id.trim()) fail(`${label}缺少有效的 id。`)
}

function validateTask(value: unknown, index: number) {
  const task = requireRecord(value, `任务 #${index + 1}`)
  requireId(task, `任务 #${index + 1}`)
  if (!isString(task.title) || !isString(task.note)) fail(`任务 #${index + 1} 的标题或说明格式不正确。`)
  if (!isDateKey(task.plannedDate) || !isDateKey(task.dueDate)) fail(`任务 #${index + 1} 的日期格式不正确。`)
  if (!['high', 'medium', 'low'].includes(String(task.priority)) || !isString(task.categoryId) || !isNumber(task.estimatedPomodoros)) fail(`任务 #${index + 1} 的核心字段不正确。`)
  if (task.deletedAt !== undefined && !isIsoDate(task.deletedAt)) fail(`任务 #${index + 1} 的删除时间不正确。`)
}

function validateCategory(value: unknown, index: number) {
  const category = requireRecord(value, `分类 #${index + 1}`)
  requireId(category, `分类 #${index + 1}`)
  if (!isString(category.name) || !isString(category.color)) fail(`分类 #${index + 1} 的名称或颜色格式不正确。`)
}

function validateSession(value: unknown, index: number) {
  const session = requireRecord(value, `专注记录 #${index + 1}`)
  requireId(session, `专注记录 #${index + 1}`)
  if (!isString(session.categoryId) || !isIsoDate(session.startedAt) || !isIsoDate(session.endedAt) || !isNumber(session.minutes)) fail(`专注记录 #${index + 1} 的核心字段不正确。`)
  if (session.deletedAt !== undefined && !isIsoDate(session.deletedAt)) fail(`专注记录 #${index + 1} 的删除时间不正确。`)
  if (session.updatedAt !== undefined && !isIsoDate(session.updatedAt)) fail(`专注记录 #${index + 1} 的更新时间不正确。`)
}

function validateReview(value: unknown, index: number) {
  const review = requireRecord(value, `复盘 #${index + 1}`)
  requireId(review, `复盘 #${index + 1}`)
  if (!isDateKey(review.date) || !isString(review.summary) || !isString(review.improvement) || !isString(review.tomorrow)) fail(`复盘 #${index + 1} 的核心字段不正确。`)
}

function validateSleep(value: unknown, index: number) {
  const record = requireRecord(value, `睡眠记录 #${index + 1}`)
  requireId(record, `睡眠记录 #${index + 1}`)
  if (!isDateKey(record.date) || !isIsoDate(record.sleptAt) || !isIsoDate(record.wokeAt) || !isNumber(record.score)) fail(`睡眠记录 #${index + 1} 的核心字段不正确。`)
}

function assertUniqueIds(items: unknown[], label: string) {
  const seen = new Set<string>()
  for (const value of items) {
    const id = (value as { id: string }).id
    if (seen.has(id)) fail(`备份中的“${label}”包含重复 id：${id}。`)
    seen.add(id)
  }
}

function validateState(value: unknown): AppState {
  const data = requireRecord(value, 'data')
  const tasks = requireArray(data.tasks, 'tasks')
  const categories = requireArray(data.categories, 'categories')
  const sessions = requireArray(data.sessions, 'sessions')
  const reviews = requireArray(data.reviews, 'reviews')
  const sleep = requireArray(data.sleep, 'sleep')
  tasks.forEach(validateTask)
  categories.forEach(validateCategory)
  sessions.forEach(validateSession)
  reviews.forEach(validateReview)
  sleep.forEach(validateSleep)
  assertUniqueIds(tasks, 'tasks')
  assertUniqueIds(categories, 'categories')
  assertUniqueIds(sessions, 'sessions')
  assertUniqueIds(reviews, 'reviews')
  assertUniqueIds(sleep, 'sleep')

  const settings = requireRecord(data.settings, 'settings')
  if (!['light', 'dark', 'system'].includes(String(settings.theme)) || !['focusMinutes', 'shortBreakMinutes', 'longBreakMinutes', 'longBreakEvery'].every(key => isNumber(settings[key]))) fail('备份中的计时设置格式不正确。')
  const timer = requireRecord(data.timer, 'timer')
  if (!['focus', 'shortBreak', 'longBreak'].includes(String(timer.phase)) || !['idle', 'running', 'paused', 'finished'].includes(String(timer.status)) || !['remainingSeconds', 'durationSeconds', 'elapsedSeconds', 'rounds'].every(key => isNumber(timer[key]))) fail('备份中的计时器状态格式不正确。')
  return data as unknown as AppState
}

export function createBackupEnvelope(state: AppState, exportedAt = new Date().toISOString()): BackupEnvelope {
  return { format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt, data: structuredClone(state) }
}

export function parseBackupJson(text: string): BackupEnvelope {
  let value: unknown
  try { value = JSON.parse(text) } catch { fail('无法解析此文件，请选择由“刻度”导出的 JSON 备份。') }
  const envelope = requireRecord(value, '备份文件')
  if (envelope.format !== BACKUP_FORMAT) fail('这不是“刻度”支持的备份文件。')
  if (envelope.schemaVersion !== BACKUP_SCHEMA_VERSION) fail(`不支持此备份版本（${String(envelope.schemaVersion)}），当前仅支持版本 1。`)
  if (!isIsoDate(envelope.exportedAt)) fail('备份缺少有效的导出时间。')
  return { format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: envelope.exportedAt as string, data: validateState(envelope.data) }
}

export function getBackupPreview(envelope: BackupEnvelope): BackupPreview {
  const { data } = envelope
  return {
    exportedAt: envelope.exportedAt,
    tasks: data.tasks.filter(task => !task.deletedAt).length,
    categories: data.categories.length,
    sessions: data.sessions.filter(session => !session.deletedAt).length,
    reviews: data.reviews.length,
    sleep: data.sleep.length,
    deletedTasks: data.tasks.filter(task => task.deletedAt).length,
    deletedSessions: data.sessions.filter(session => session.deletedAt).length,
  }
}

function normalizedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(normalizedJson).join(',')}]`
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${normalizedJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

const conflictLabels: Record<EntityCollection, string> = { tasks: '任务', categories: '分类', sessions: '专注记录', reviews: '复盘', sleep: '睡眠记录' }

function entityLabel(collection: EntityCollection, entity: ImportEntity) {
  if (collection === 'tasks') return (entity as Task).title || '未命名任务'
  if (collection === 'categories') return (entity as Category).name || '未命名分类'
  if (collection === 'reviews') return `${(entity as Review).date} 复盘`
  if (collection === 'sleep') return `${(entity as SleepRecord).date} 睡眠`
  const session = entity as FocusSession
  return `${session.startedAt.slice(0, 10)} ${session.startedAt.slice(11, 16)} 专注`
}

function mergeCollection<T extends ImportEntity>(collection: EntityCollection, local: T[], imported: T[]) {
  const importedById = new Map(imported.map(item => [item.id, item]))
  const output: T[] = []
  const conflicts: MergeConflict[] = []
  for (const localItem of local) {
    const importedItem = importedById.get(localItem.id)
    if (!importedItem) output.push(localItem)
    else {
      importedById.delete(localItem.id)
      output.push(localItem)
      if (normalizedJson(localItem) !== normalizedJson(importedItem)) {
        conflicts.push({ key: `${collection}:${localItem.id}`, collection, id: localItem.id, label: entityLabel(collection, localItem), local: localItem, imported: importedItem })
      }
    }
  }
  output.push(...importedById.values())
  return { output, conflicts }
}

export function buildMergePlan(local: AppState, imported: AppState): MergePlan {
  const tasks = mergeCollection('tasks', local.tasks, imported.tasks)
  const categories = mergeCollection('categories', local.categories, imported.categories)
  const sessions = mergeCollection('sessions', local.sessions, imported.sessions)
  const reviews = mergeCollection('reviews', local.reviews, imported.reviews)
  const sleep = mergeCollection('sleep', local.sleep, imported.sleep)
  return {
    state: { ...local, tasks: tasks.output, categories: categories.output, sessions: sessions.output, reviews: reviews.output, sleep: sleep.output },
    conflicts: [...tasks.conflicts, ...categories.conflicts, ...sessions.conflicts, ...reviews.conflicts, ...sleep.conflicts],
  }
}

export function applyConflictChoices(plan: MergePlan, choices: Record<string, ConflictChoice>): AppState {
  const unresolved = plan.conflicts.filter(conflict => !choices[conflict.key])
  if (unresolved.length) throw new Error(`还有 ${unresolved.length} 条冲突尚未选择。`)
  const state = structuredClone(plan.state)
  for (const conflict of plan.conflicts) {
    if (choices[conflict.key] !== 'imported') continue
    const collection = state[conflict.collection] as ImportEntity[]
    const index = collection.findIndex(item => item.id === conflict.id)
    if (index >= 0) collection[index] = structuredClone(conflict.imported)
  }
  return state
}

export function downloadBlob(contents: BlobPart[], filename: string, type: string) {
  const url = URL.createObjectURL(new Blob(contents, { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function dateStamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`
}

export function downloadBackup(state: AppState, prefix = '刻度备份', now = new Date()) {
  const envelope = createBackupEnvelope(state, now.toISOString())
  downloadBlob([JSON.stringify(envelope, null, 2)], `${prefix}_${dateStamp(now)}.json`, 'application/json;charset=utf-8')
}

export function collectionLabel(collection: EntityCollection) { return conflictLabels[collection] }
