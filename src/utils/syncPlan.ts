import type { AppState, Category, FocusSession, Review, SleepRecord, Task } from '../domain/types'
import type { ConflictChoice, EntityCollection, ImportEntity } from './backup'

export type SyncDifferenceKind = 'local-only' | 'remote-only' | 'changed'

export interface SyncDifference {
  key: string
  collection: EntityCollection
  entityKey: string
  label: string
  kind: SyncDifferenceKind
  local?: ImportEntity
  remote?: ImportEntity
}

export interface SyncPlan {
  local: AppState
  remote: AppState
  differences: SyncDifference[]
  settingsDiffer: boolean
}

const collections: EntityCollection[] = ['tasks', 'categories', 'sessions', 'reviews', 'sleep']
export const syncCollectionLabels: Record<EntityCollection, string> = { tasks: '任务', categories: '分类', sessions: '专注', reviews: '复盘', sleep: '睡眠' }

function normalizedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(item => item === undefined ? 'null' : normalizedJson(item)).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${normalizedJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function comparableEntity(collection: EntityCollection, entity: ImportEntity): Record<string, unknown> {
  const comparable = structuredClone(entity) as unknown as Record<string, unknown>
  if (collection === 'categories') comparable.archived = comparable.archived === true
  if (collection === 'reviews' || collection === 'sleep') delete comparable.id
  if (collection === 'tasks' && comparable.recurrence && typeof comparable.recurrence === 'object') {
    const recurrence = comparable.recurrence as Record<string, unknown>
    if (Array.isArray(recurrence.weekdays)) recurrence.weekdays = [...recurrence.weekdays].sort((a, b) => Number(a) - Number(b))
  }
  return comparable
}

export function syncEntitiesEqual(collection: EntityCollection, left: ImportEntity, right: ImportEntity) {
  return normalizedJson(comparableEntity(collection, left)) === normalizedJson(comparableEntity(collection, right))
}

function entityKey(collection: EntityCollection, entity: ImportEntity) {
  if (collection === 'reviews') return (entity as Review).date
  if (collection === 'sleep') return (entity as SleepRecord).date
  return entity.id
}

export function syncEntityLabel(collection: EntityCollection, entity: ImportEntity) {
  if (collection === 'tasks') return (entity as Task).title || '未命名任务'
  if (collection === 'categories') return (entity as Category).name || '未命名分类'
  if (collection === 'reviews') return `${(entity as Review).date} 复盘`
  if (collection === 'sleep') return `${(entity as SleepRecord).date} 睡眠`
  const session = entity as FocusSession
  return `${session.startedAt.slice(0, 10)} ${session.startedAt.slice(11, 16)} 专注`
}

function compareCollection(collection: EntityCollection, local: ImportEntity[], remote: ImportEntity[]) {
  const localMap = new Map(local.map(entity => [entityKey(collection, entity), entity]))
  const remoteMap = new Map(remote.map(entity => [entityKey(collection, entity), entity]))
  const keys = new Set([...localMap.keys(), ...remoteMap.keys()])
  const differences: SyncDifference[] = []
  for (const key of keys) {
    const localEntity = localMap.get(key)
    const remoteEntity = remoteMap.get(key)
    if (localEntity && remoteEntity && syncEntitiesEqual(collection, localEntity, remoteEntity)) continue
    const kind: SyncDifferenceKind = localEntity && remoteEntity ? 'changed' : localEntity ? 'local-only' : 'remote-only'
    const entity = localEntity ?? remoteEntity!
    differences.push({
      key: `${collection}:${key}`,
      collection,
      entityKey: key,
      label: syncEntityLabel(collection, entity),
      kind,
      local: localEntity,
      remote: remoteEntity,
    })
  }
  return differences
}

export function buildSyncPlan(local: AppState, remote: AppState): SyncPlan {
  const differences = collections.flatMap(collection => compareCollection(
    collection,
    local[collection] as ImportEntity[],
    remote[collection] as ImportEntity[],
  ))
  return {
    local,
    remote,
    differences,
    settingsDiffer: normalizedJson(local.settings) !== normalizedJson(remote.settings),
  }
}

function mergedCollection(collection: EntityCollection, local: ImportEntity[], remote: ImportEntity[], choices: Record<string, ConflictChoice>) {
  const result = new Map<string, ImportEntity>()
  for (const entity of local) result.set(entityKey(collection, entity), structuredClone(entity))
  for (const entity of remote) {
    const key = entityKey(collection, entity)
    const localEntity = result.get(key)
    if (!localEntity) {
      result.set(key, structuredClone(entity))
      continue
    }
    if (syncEntitiesEqual(collection, localEntity, entity)) continue
    const choice = choices[`${collection}:${key}`]
    if (!choice) throw new Error('还有内容不同的记录尚未选择。')
    if (choice === 'imported') result.set(key, structuredClone(entity))
  }
  return [...result.values()]
}

export function applySyncChoices(plan: SyncPlan, choices: Record<string, ConflictChoice>): AppState {
  const unresolved = plan.differences.filter(item => item.kind === 'changed' && !choices[item.key])
  if (unresolved.length) throw new Error(`还有 ${unresolved.length} 条内容不同的记录尚未选择。`)
  return {
    ...structuredClone(plan.local),
    tasks: mergedCollection('tasks', plan.local.tasks, plan.remote.tasks, choices) as Task[],
    categories: mergedCollection('categories', plan.local.categories, plan.remote.categories, choices) as Category[],
    sessions: mergedCollection('sessions', plan.local.sessions, plan.remote.sessions, choices) as FocusSession[],
    reviews: mergedCollection('reviews', plan.local.reviews, plan.remote.reviews, choices) as Review[],
    sleep: mergedCollection('sleep', plan.local.sleep, plan.remote.sleep, choices) as SleepRecord[],
  }
}

export function syncDifferenceCounts(plan: SyncPlan) {
  return plan.differences.reduce((counts, item) => {
    counts[item.kind] += 1
    return counts
  }, { 'local-only': 0, 'remote-only': 0, changed: 0 })
}
