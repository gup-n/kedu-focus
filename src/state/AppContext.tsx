import { createContext, useContext, useEffect, useReducer, useRef, useState, type Dispatch, type ReactNode } from 'react'
import type { AppSettings, AppState, Category, FocusSession, Review, SleepRecord, Task, TimerState } from '../domain/types'
import { createRepository, type Repository } from '../data/repository'
import { seedState } from '../data/seed'
import { visibleAppState } from '../domain/selectors'
import { createNextRecurringTask } from '../utils/recurrence'
import { compactRecurringTaskHistory } from '../utils/taskArchive'

export type StorageStatus = 'loading' | 'saved' | 'saving' | 'error'

export type Action =
  | { type: 'HYDRATE'; state: AppState }
  | { type: 'ADD_TASK'; task: Task }
  | { type: 'UPDATE_TASK'; task: Task }
  | { type: 'DELETE_TASK'; id: string }
  | { type: 'DELETE_SESSION'; id: string; now?: string }
  | { type: 'UPDATE_SESSION'; session: FocusSession }
  | { type: 'TOGGLE_TASK'; id: string }
  | { type: 'ADD_CATEGORY'; category: Category }
  | { type: 'UPDATE_CATEGORY'; category: Category }
  | { type: 'TOGGLE_CATEGORY'; id: string }
  | { type: 'SAVE_REVIEW'; review: Review }
  | { type: 'SAVE_SLEEP'; record: SleepRecord }
  | { type: 'SET_THEME'; theme: AppSettings['theme'] }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<AppSettings> }
  | { type: 'TIMER_START'; now?: string }
  | { type: 'TIMER_PAUSE'; now?: string }
  | { type: 'TIMER_RESET' }
  | { type: 'TIMER_TICK'; now?: string }
  | { type: 'TIMER_FINISH'; now?: string }
  | { type: 'TIMER_END_EARLY'; now?: string }
  | { type: 'SET_TIMER_TASK'; id?: string }
  | { type: 'SET_TIMER_PHASE'; phase: TimerState['phase'] }
  | { type: 'RESET_APP' }

const phaseSeconds = (state: AppState, phase: TimerState['phase']) =>
  (phase === 'focus' ? state.settings.focusMinutes : phase === 'shortBreak' ? state.settings.shortBreakMinutes : state.settings.longBreakMinutes) * 60

const elapsedAt = (timer: TimerState, now: number) => Math.max(
  0,
  timer.elapsedSeconds + (timer.status === 'running' && timer.runStartedAt
    ? Math.max(0, Math.floor((now - Date.parse(timer.runStartedAt)) / 1000))
    : 0),
)

function normalizedTimer(state: AppState, now: number): TimerState {
  const durationSeconds = state.timer.durationSeconds ?? phaseSeconds(state, state.timer.phase)
  const elapsedSeconds = state.timer.elapsedSeconds ?? Math.max(0, durationSeconds - state.timer.remainingSeconds)
  const timer: TimerState = {
    ...state.timer,
    durationSeconds,
    elapsedSeconds,
    runStartedAt: state.timer.status === 'running' ? (state.timer.runStartedAt ?? new Date(now).toISOString()) : undefined,
  }
  const currentElapsed = elapsedAt(timer, now)
  return { ...timer, liveElapsedSeconds: currentElapsed, remainingSeconds: Math.max(0, durationSeconds - currentElapsed) }
}

function normalizeState(state: AppState, now = Date.now()): AppState {
  const timerTask = state.tasks.find(task => task.id === state.timer.taskId)
  const normalized = {
    ...state,
    tasks: state.tasks.map(task => ({ ...task, plannedDate: task.plannedDate ?? task.dueDate, createdAt: task.createdAt ?? task.updatedAt ?? `${task.plannedDate ?? task.dueDate}T00:00:00+08:00` })),
    categories: state.categories.map(category => ({ ...category, archived: category.archived ?? false })),
    timer: normalizedTimer({ ...state, timer: timerTask?.deletedAt ? { ...state.timer, taskId: undefined } : state.timer }, now),
  }
  const timerNormalized = normalized.timer.status === 'running' && normalized.timer.phase !== 'focus' && normalized.timer.remainingSeconds === 0
    ? finishTimer(normalized, now)
    : normalized
  return compactRecurringTaskHistory(timerNormalized, now)
}

function finishTimer(state: AppState, now: number, allowPartial = false): AppState {
  const elapsed = elapsedAt(state.timer, now)
  const endedAt = new Date(now).toISOString()
  const shouldRecord = state.timer.phase === 'focus' && (allowPartial ? elapsed >= 1 : elapsed >= state.timer.durationSeconds)
  const session = shouldRecord ? {
    id: crypto.randomUUID(),
    taskId: state.timer.taskId,
    categoryId: state.tasks.find(task => task.id === state.timer.taskId)?.categoryId ?? 'work',
    startedAt: state.timer.startedAt ?? new Date(now - elapsed * 1000).toISOString(),
    endedAt,
    seconds: elapsed,
    minutes: Math.max(1, Math.ceil(elapsed / 60)),
    updatedAt: endedAt,
  } : undefined
  return {
    ...state,
    sessions: session ? [...state.sessions, session] : state.sessions,
    timer: {
      ...state.timer,
      status: allowPartial ? 'idle' : 'finished',
      remainingSeconds: allowPartial ? state.timer.durationSeconds : 0,
      elapsedSeconds: allowPartial ? 0 : state.timer.durationSeconds,
      liveElapsedSeconds: allowPartial ? 0 : elapsed,
      startedAt: undefined,
      runStartedAt: undefined,
      rounds: state.timer.rounds + (session ? 1 : 0),
    },
  }
}

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'HYDRATE': return normalizeState(action.state)
    case 'ADD_TASK': {
      const now = action.task.updatedAt ?? new Date().toISOString()
      return { ...state, tasks: [{ ...action.task, createdAt: action.task.createdAt ?? now, updatedAt: action.task.updatedAt ?? now }, ...state.tasks] }
    }
    case 'UPDATE_TASK': return { ...state, tasks: state.tasks.map(task => task.id === action.task.id ? { ...action.task, createdAt: task.createdAt ?? action.task.createdAt ?? task.updatedAt ?? action.task.updatedAt } : task) }
    case 'DELETE_TASK': {
      const now = new Date().toISOString()
      return {
        ...state,
        tasks: state.tasks.map(task => task.id === action.id ? { ...task, deletedAt: now, updatedAt: now } : task),
        timer: state.timer.taskId === action.id ? { ...state.timer, taskId: undefined } : state.timer,
      }
    }
    case 'DELETE_SESSION': {
      const now = action.now ?? new Date().toISOString()
      return { ...state, sessions: state.sessions.map(session => session.id === action.id && !session.deletedAt ? { ...session, deletedAt: now, updatedAt: now } : session) }
    }
    case 'UPDATE_SESSION': {
      const now = action.session.updatedAt ?? new Date().toISOString()
      return { ...state, sessions: state.sessions.map(session => session.id === action.session.id ? { ...action.session, updatedAt: now } : session) }
    }
    case 'TOGGLE_TASK': {
      const now = new Date().toISOString()
      const target = state.tasks.find(task => task.id === action.id && !task.deletedAt)
      if (!target) return state
      const completing = !target.completedAt
      const tasks = state.tasks.map(task => task.id === action.id ? { ...task, completedAt: completing ? now : undefined, updatedAt: now } : task)
      if (!completing || !target.recurrence) return { ...state, tasks }
      const next = createNextRecurringTask(target, crypto.randomUUID(), now)
      if (!next) return { ...state, tasks }
      const sourceId = next.recurrenceSourceId
      const exists = tasks.some(task => (task.recurrenceSourceId ?? task.id) === sourceId && task.plannedDate === next.plannedDate)
      return { ...state, tasks: exists ? tasks : [next, ...tasks] }
    }
    case 'ADD_CATEGORY': return { ...state, categories: [...state.categories, action.category] }
    case 'UPDATE_CATEGORY': return { ...state, categories: state.categories.map(category => category.id === action.category.id ? action.category : category) }
    case 'TOGGLE_CATEGORY': return { ...state, categories: state.categories.map(category => category.id === action.id ? { ...category, archived: !category.archived, updatedAt: new Date().toISOString() } : category) }
    case 'SAVE_REVIEW': return { ...state, reviews: [...state.reviews.filter(review => review.date !== action.review.date), action.review] }
    case 'SAVE_SLEEP': return { ...state, sleep: [...state.sleep.filter(record => record.date !== action.record.date), action.record] }
    case 'SET_THEME': return { ...state, settings: { ...state.settings, theme: action.theme } }
    case 'UPDATE_SETTINGS': {
      const next = { ...state, settings: { ...state.settings, ...action.settings } }
      if (state.timer.status !== 'idle') return next
      const durationSeconds = phaseSeconds(next, state.timer.phase)
      return { ...next, timer: { ...state.timer, durationSeconds, elapsedSeconds: 0, liveElapsedSeconds: 0, remainingSeconds: durationSeconds } }
    }
    case 'TIMER_START': {
      if (state.timer.status === 'running') return state
      const now = action.now ?? new Date().toISOString()
      return { ...state, timer: { ...state.timer, status: 'running', startedAt: state.timer.startedAt ?? now, runStartedAt: now, liveElapsedSeconds: state.timer.elapsedSeconds } }
    }
    case 'TIMER_PAUSE': {
      if (state.timer.status !== 'running') return state
      const elapsedSeconds = elapsedAt(state.timer, Date.parse(action.now ?? new Date().toISOString()))
      return { ...state, timer: { ...state.timer, status: 'paused', elapsedSeconds, liveElapsedSeconds: elapsedSeconds, remainingSeconds: Math.max(0, state.timer.durationSeconds - elapsedSeconds), runStartedAt: undefined } }
    }
    case 'TIMER_RESET': {
      const durationSeconds = phaseSeconds(state, state.timer.phase)
      return { ...state, timer: { ...state.timer, status: 'idle', remainingSeconds: durationSeconds, durationSeconds, elapsedSeconds: 0, liveElapsedSeconds: 0, startedAt: undefined, runStartedAt: undefined } }
    }
    case 'SET_TIMER_PHASE': {
      const durationSeconds = phaseSeconds(state, action.phase)
      return { ...state, timer: { ...state.timer, phase: action.phase, status: 'idle', remainingSeconds: durationSeconds, durationSeconds, elapsedSeconds: 0, liveElapsedSeconds: 0, startedAt: undefined, runStartedAt: undefined } }
    }
    case 'TIMER_TICK': {
      if (state.timer.status !== 'running') return state
      const now = Date.parse(action.now ?? new Date().toISOString())
      const elapsedSeconds = elapsedAt(state.timer, now)
      return elapsedSeconds >= state.timer.durationSeconds && state.timer.phase !== 'focus'
        ? finishTimer(state, now)
        : { ...state, timer: { ...state.timer, liveElapsedSeconds: elapsedSeconds, remainingSeconds: Math.max(0, state.timer.durationSeconds - elapsedSeconds) } }
    }
    case 'TIMER_FINISH': return finishTimer(state, Date.parse(action.now ?? new Date().toISOString()))
    case 'TIMER_END_EARLY': return finishTimer(state, Date.parse(action.now ?? new Date().toISOString()), true)
    case 'SET_TIMER_TASK': return { ...state, timer: { ...state.timer, taskId: action.id || undefined } }
    case 'RESET_APP': return structuredClone(seedState)
    default: return state
  }
}

const AppContext = createContext<{ state: AppState; rawState: AppState; dispatch: Dispatch<Action>; storageStatus: StorageStatus } | null>(null)

export function AppProvider({ children, repository: suppliedRepository }: { children: ReactNode; repository?: Repository }) {
  const [state, dispatch] = useReducer(appReducer, seedState, structuredClone)
  const [storageStatus, setStorageStatus] = useState<StorageStatus>('loading')
  const [repository] = useState<Repository>(() => suppliedRepository ?? createRepository(seedState))
  const [hydrated, setHydrated] = useState(false)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const saveRevision = useRef(0)
  const latestState = useRef(state)

  useEffect(() => {
    latestState.current = state
  }, [state])

  useEffect(() => {
    let cancelled = false

    async function hydrate() {
      try {
        const saved = await repository.load()
        if (cancelled) return

        if (saved) dispatch({ type: 'HYDRATE', state: saved })
        else await repository.save(structuredClone(seedState))

        if (!cancelled) {
          setHydrated(true)
          setStorageStatus('saved')
        }
      } catch {
        if (!cancelled) setStorageStatus('error')
      }
    }

    void hydrate()
    return () => { cancelled = true }
  }, [repository])

  useEffect(() => {
    if (!hydrated) return

    const revision = ++saveRevision.current
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setStorageStatus('saving')
    })
    const snapshot = structuredClone(latestState.current)
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => repository.save(snapshot))
    void saveQueue.current
      .then(() => {
        if (!cancelled && revision === saveRevision.current) setStorageStatus('saved')
      })
      .catch(() => {
        if (!cancelled && revision === saveRevision.current) setStorageStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [
    hydrated,
    repository,
    state.tasks,
    state.completions,
    state.categories,
    state.sessions,
    state.reviews,
    state.sleep,
    state.settings,
    state.timer.phase,
    state.timer.status,
    state.timer.taskId,
    state.timer.rounds,
  ])

  useEffect(() => {
    const theme = state.settings.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : state.settings.theme
    document.documentElement.dataset.theme = theme
  }, [state.settings.theme])

  useEffect(() => {
    if (state.timer.status !== 'running') return
    const sync = () => dispatch({ type: 'TIMER_TICK' })
    const id = window.setInterval(sync, 1000)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('pageshow', sync)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('pageshow', sync)
    }
  }, [state.timer.status])

  const visibleState = visibleAppState(state)
  return <AppContext.Provider value={{ state: visibleState, rawState: state, dispatch, storageStatus }}>{children}</AppContext.Provider>
}

export function useApp() {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp requires AppProvider')
  return value
}
