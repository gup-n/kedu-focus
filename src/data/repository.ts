import type { AppState } from '../domain/types'

const DB_NAME = 'focus-planner'
const DB_VERSION = 1
const ENTITY_STORES = ['tasks', 'categories', 'sessions', 'reviews', 'sleep'] as const
const ALL_STORES = [...ENTITY_STORES, 'kv'] as const

type EntityStore = (typeof ENTITY_STORES)[number]
type StoredValue<T> = { key: string; value: T }

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      for (const name of ENTITY_STORES) {
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('kv')) database.createObjectStore('kv', { keyPath: 'key' })
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
  })
}

export interface Repository {
  load(): Promise<AppState | null>
  save(state: AppState): Promise<void>
}

export class MemoryRepository implements Repository {
  private state: AppState
  constructor(seed: AppState) { this.state = structuredClone(seed) }
  async load() { return structuredClone(this.state) }
  async save(state: AppState) { this.state = structuredClone(state) }
}

export class IndexedDbRepository implements Repository {
  async load(): Promise<AppState | null> {
    const database = await openDatabase()
    try {
      const transaction = database.transaction([...ALL_STORES], 'readonly')
      const completed = transactionDone(transaction)
      const entityRequests = Object.fromEntries(
        ENTITY_STORES.map(name => [name, requestResult(transaction.objectStore(name).getAll())]),
      ) as Record<EntityStore, Promise<unknown[]>>
      const settings = requestResult<StoredValue<AppState['settings']> | undefined>(transaction.objectStore('kv').get('settings'))
      const timer = requestResult<StoredValue<AppState['timer']> | undefined>(transaction.objectStore('kv').get('timer'))
      const [tasks, categories, sessions, reviews, sleep, storedSettings, storedTimer] = await Promise.all([
        entityRequests.tasks,
        entityRequests.categories,
        entityRequests.sessions,
        entityRequests.reviews,
        entityRequests.sleep,
        settings,
        timer,
      ])
      await completed
      if (!storedSettings || !storedTimer) return null
      return {
        tasks: tasks as AppState['tasks'],
        categories: categories as AppState['categories'],
        sessions: sessions as AppState['sessions'],
        reviews: reviews as AppState['reviews'],
        sleep: sleep as AppState['sleep'],
        settings: storedSettings.value,
        timer: storedTimer.value,
      }
    } finally {
      database.close()
    }
  }

  async save(state: AppState): Promise<void> {
    const database = await openDatabase()
    try {
      const transaction = database.transaction([...ALL_STORES], 'readwrite')
      for (const name of ENTITY_STORES) transaction.objectStore(name).clear()
      for (const task of state.tasks) transaction.objectStore('tasks').put(task)
      for (const category of state.categories) transaction.objectStore('categories').put(category)
      for (const session of state.sessions) transaction.objectStore('sessions').put(session)
      for (const review of state.reviews) transaction.objectStore('reviews').put(review)
      for (const record of state.sleep) transaction.objectStore('sleep').put(record)
      transaction.objectStore('kv').put({ key: 'settings', value: state.settings })
      transaction.objectStore('kv').put({ key: 'timer', value: state.timer })
      transaction.objectStore('kv').put({ key: 'schemaVersion', value: DB_VERSION })
      await transactionDone(transaction)
    } finally {
      database.close()
    }
  }
}

export function createRepository(seed: AppState): Repository {
  return typeof indexedDB === 'undefined' ? new MemoryRepository(seed) : new IndexedDbRepository()
}
