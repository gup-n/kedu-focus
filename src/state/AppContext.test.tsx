import { StrictMode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appReducer, AppProvider, useApp } from './AppContext'
import { demoState as seedState } from '../test/fixtures'
import type { AppState } from '../domain/types'
import type { Repository } from '../data/repository'
import { MemoryRepository } from '../data/repository'

afterEach(cleanup)

describe('appReducer', () => {
  it('toggles task completion without mutating the existing state', () => {
    const next = appReducer(seedState, { type: 'TOGGLE_TASK', id: 't1' })

    expect(next.tasks.find(task => task.id === 't1')?.completedAt).toBeTruthy()
    expect(seedState.tasks.find(task => task.id === 't1')?.completedAt).toBeUndefined()
  })

  it('creates exactly one next occurrence when completing a recurring task', () => {
    const recurring = structuredClone(seedState)
    recurring.tasks[0].recurrence = { kind: 'daily' }
    recurring.tasks[0].plannedDate = '2026-08-10'
    recurring.tasks[0].dueDate = '2026-08-12'

    const completed = appReducer(recurring, { type: 'TOGGLE_TASK', id: recurring.tasks[0].id })
    const next = completed.tasks.find(task => task.recurrenceSourceId === recurring.tasks[0].id)
    const reopened = appReducer(completed, { type: 'TOGGLE_TASK', id: recurring.tasks[0].id })
    const completedAgain = appReducer(reopened, { type: 'TOGGLE_TASK', id: recurring.tasks[0].id })

    expect(next).toMatchObject({ plannedDate: '2026-08-11', dueDate: '2026-08-13', completedAt: undefined })
    expect(completedAgain.tasks.filter(task => task.recurrenceSourceId === recurring.tasks[0].id)).toHaveLength(1)
  })

  it('adds, updates, and deletes a task while preserving its plan and due dates', () => {
    const task = {
      id: 'new',
      title: '新任务',
      note: '',
      plannedDate: '2026-08-09',
      dueDate: '2026-08-12',
      priority: 'low' as const,
      categoryId: 'life',
      estimatedPomodoros: 1,
    }

    const added = appReducer(seedState, { type: 'ADD_TASK', task })
    const updated = appReducer(added, {
      type: 'UPDATE_TASK',
      task: { ...task, title: '修改后的任务', plannedDate: '2026-08-10' },
    })
    const deleted = appReducer(updated, { type: 'DELETE_TASK', id: task.id })

    expect(added.tasks[0]).toMatchObject(task)
    expect(added.tasks[0].createdAt).toEqual(expect.any(String))
    expect(updated.tasks[0]).toMatchObject({ title: '修改后的任务', plannedDate: '2026-08-10', dueDate: '2026-08-12' })
    expect(updated.tasks[0].createdAt).toBe(added.tasks[0].createdAt)
    expect(deleted.tasks).toHaveLength(seedState.tasks.length + 1)
    expect(deleted.tasks.find(item => item.id === task.id)?.deletedAt).toBeTruthy()
    expect(seedState.tasks).toHaveLength(4)
  })

  it('clears a deleted task from the active timer', () => {
    const next = appReducer(seedState, { type: 'DELETE_TASK', id: seedState.timer.taskId! })

    expect(next.timer.taskId).toBeUndefined()
  })

  it('adds, edits, archives, and restores a category', () => {
    const category = { id: 'health', name: '健康', color: '#33aa77', archived: false }
    const added = appReducer(seedState, { type: 'ADD_CATEGORY', category })
    const edited = appReducer(added, { type: 'UPDATE_CATEGORY', category: { ...category, name: '运动', color: '#118855' } })
    const archived = appReducer(edited, { type: 'TOGGLE_CATEGORY', id: category.id })
    const restored = appReducer(archived, { type: 'TOGGLE_CATEGORY', id: category.id })

    expect(edited.categories.at(-1)).toMatchObject({ name: '运动', color: '#118855' })
    expect(archived.categories.at(-1)?.archived).toBe(true)
    expect(restored.categories.at(-1)?.archived).toBe(false)
  })

  it('normalizes data created before planned dates and category archiving existed', () => {
    const legacy = structuredClone(seedState)
    const legacyTask = legacy.tasks[0] as Partial<(typeof legacy.tasks)[number]>
    delete legacyTask.plannedDate
    delete legacy.categories[0].archived

    const next = appReducer(seedState, { type: 'HYDRATE', state: legacy })

    expect(next.tasks[0].plannedDate).toBe(next.tasks[0].dueDate)
    expect(next.categories[0].archived).toBe(false)
  })

  it('updates settings and switches timer phase with the matching duration', () => {
    const configured = appReducer(seedState, { type: 'UPDATE_SETTINGS', settings: { shortBreakMinutes: 8 } })
    const next = appReducer(configured, { type: 'SET_TIMER_PHASE', phase: 'shortBreak' })

    expect(next.settings.shortBreakMinutes).toBe(8)
    expect(next.timer.phase).toBe('shortBreak')
    expect(next.timer.status).toBe('idle')
    expect(next.timer.remainingSeconds).toBe(8 * 60)
  })

  it('calibrates a running timer from timestamps and excludes paused time', () => {
    const started = appReducer(seedState, { type: 'TIMER_START', now: '2026-08-09T09:00:00.000Z' })
    const synced = appReducer(started, { type: 'TIMER_TICK', now: '2026-08-09T09:02:00.000Z' })
    const paused = appReducer(synced, { type: 'TIMER_PAUSE', now: '2026-08-09T09:02:00.000Z' })
    const resumed = appReducer(paused, { type: 'TIMER_START', now: '2026-08-09T10:00:00.000Z' })
    const afterResume = appReducer(resumed, { type: 'TIMER_TICK', now: '2026-08-09T10:01:00.000Z' })

    expect(synced.timer.remainingSeconds).toBe(23 * 60)
    expect(synced.timer.liveElapsedSeconds).toBe(2 * 60)
    expect(paused.timer.elapsedSeconds).toBe(2 * 60)
    expect(afterResume.timer.remainingSeconds).toBe(22 * 60)
  })

  it('reconciles elapsed wall time when hydrating a running timer', () => {
    vi.useFakeTimers()
    try {
      const persisted = appReducer(seedState, { type: 'TIMER_START', now: '2026-08-09T09:00:00.000Z' })
      vi.setSystemTime(new Date('2026-08-09T09:02:15.000Z'))

      const hydrated = appReducer(seedState, { type: 'HYDRATE', state: persisted })

      expect(hydrated.timer.status).toBe('running')
      expect(hydrated.timer.remainingSeconds).toBe(1365)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps focus running past its target and records the full elapsed time', () => {
    const started = appReducer(seedState, { type: 'TIMER_START', now: '2026-08-09T09:00:00.000Z' })
    const overtime = appReducer(started, { type: 'TIMER_TICK', now: '2026-08-09T09:30:00.000Z' })
    const ended = appReducer(overtime, { type: 'TIMER_END_EARLY', now: '2026-08-09T09:31:00.000Z' })

    expect(overtime.timer).toMatchObject({ status: 'running', remainingSeconds: 0, elapsedSeconds: 0, liveElapsedSeconds: 1800 })
    expect(ended.sessions.at(-1)).toMatchObject({ seconds: 1860, minutes: 31 })
  })

  it('reconciles focus overtime after the app returns from the background', () => {
    vi.useFakeTimers()
    try {
      const started = appReducer(seedState, { type: 'TIMER_START', now: '2026-08-09T09:00:00.000Z' })
      vi.setSystemTime(new Date('2026-08-09T09:40:00.000Z'))
      const hydrated = appReducer(seedState, { type: 'HYDRATE', state: started })

      expect(hydrated.timer).toMatchObject({ status: 'running', remainingSeconds: 0, elapsedSeconds: 0, liveElapsedSeconds: 2400 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not lose fractions when timer callbacks repeatedly arrive before a full second', () => {
    const startedAt = Date.parse('2026-08-11T07:47:32.387Z')
    let running = appReducer(seedState, { type: 'TIMER_START', now: new Date(startedAt).toISOString() })
    for (let tick = 1; tick <= 1352; tick += 1) {
      running = appReducer(running, { type: 'TIMER_TICK', now: new Date(startedAt + tick * 999).toISOString() })
    }
    const ended = appReducer(running, { type: 'TIMER_END_EARLY', now: '2026-08-11T08:10:04.043Z' })

    expect(running.timer.elapsedSeconds).toBe(0)
    expect(running.timer.liveElapsedSeconds).toBe(1350)
    expect(ended.sessions.at(-1)).toMatchObject({ seconds: 1351, minutes: 23 })
  })

  it('records an early focus with exact seconds and a minimum of one displayed minute', () => {
    const started = appReducer(seedState, { type: 'TIMER_START', now: '2026-08-09T09:00:00.000Z' })
    const ended = appReducer(started, { type: 'TIMER_END_EARLY', now: '2026-08-09T09:00:12.000Z' })

    expect(ended.sessions).toHaveLength(seedState.sessions.length + 1)
    expect(ended.sessions.at(-1)).toMatchObject({ taskId: 't1', seconds: 12, minutes: 1 })
    expect(ended.timer).toMatchObject({ status: 'idle', elapsedSeconds: 0, rounds: 1 })
  })

  it('does not create a focus session when a break ends early', () => {
    const breakState = appReducer(seedState, { type: 'SET_TIMER_PHASE', phase: 'shortBreak' })
    const started = appReducer(breakState, { type: 'TIMER_START', now: '2026-08-09T09:00:00.000Z' })
    const ended = appReducer(started, { type: 'TIMER_END_EARLY', now: '2026-08-09T09:01:00.000Z' })

    expect(ended.sessions).toHaveLength(seedState.sessions.length)
    expect(ended.timer.status).toBe('idle')
  })

  it('tombstones a focus session without physically removing it', () => {
    const next = appReducer(seedState, { type: 'DELETE_SESSION', id: 's1', now: '2026-08-10T10:00:00.000Z' })

    expect(next.sessions).toHaveLength(seedState.sessions.length)
    expect(next.sessions.find(session => session.id === 's1')).toMatchObject({
      deletedAt: '2026-08-10T10:00:00.000Z',
      updatedAt: '2026-08-10T10:00:00.000Z',
    })
    expect(seedState.sessions.find(session => session.id === 's1')?.deletedAt).toBeUndefined()
  })

  it('keeps one main sleep record per wake date while preserving other dates', () => {
    const date = seedState.sleep[0].date
    const updated = appReducer(seedState, { type: 'SAVE_SLEEP', record: { id: 'replacement', date, sleptAt: `${date}T01:00:00+08:00`, wokeAt: `${date}T08:00:00+08:00`, score: 5 } })
    const added = appReducer(updated, { type: 'SAVE_SLEEP', record: { id: 'another-day', date: '2026-08-08', sleptAt: '2026-08-07T23:00:00+08:00', wokeAt: '2026-08-08T07:00:00+08:00', score: 4 } })

    expect(updated.sleep.filter(record => record.date === date)).toHaveLength(1)
    expect(updated.sleep.find(record => record.date === date)?.id).toBe('replacement')
    expect(added.sleep).toHaveLength(2)
  })
})

function StorageProbe() {
  const { state, rawState, dispatch, storageStatus } = useApp()
  return (
    <div>
      <span>{storageStatus}</span>
      <span>{state.tasks[0]?.title}</span>
      <span>visible sessions {state.sessions.length}</span>
      <span>raw sessions {rawState.sessions.length}</span>
      <button onClick={() => dispatch({ type: 'SET_THEME', theme: 'dark' })}>change</button>
      <button onClick={() => dispatch({ type: 'TIMER_START', now: '2026-08-09T09:00:00.000Z' })}>start</button>
      <button onClick={() => dispatch({ type: 'TIMER_TICK', now: '2026-08-09T09:00:02.000Z' })}>tick</button>
      <button onClick={() => dispatch({ type: 'TIMER_PAUSE', now: '2026-08-09T09:00:02.000Z' })}>pause</button>
      <button onClick={() => dispatch({ type: 'DELETE_SESSION', id: 's1', now: '2026-08-10T10:00:00.000Z' })}>delete session</button>
    </div>
  )
}

describe('AppProvider persistence', () => {
  it('does not overwrite storage before hydration and persists later changes under StrictMode', async () => {
    let resolveLoad!: (state: AppState) => void
    const stored = structuredClone(seedState)
    stored.tasks[0].title = '来自本地的数据'
    const repository: Repository = {
      load: vi.fn(() => new Promise<AppState>(resolve => { resolveLoad = resolve })),
      save: vi.fn(async () => undefined),
    }

    render(
      <StrictMode>
        <AppProvider repository={repository}><StorageProbe /></AppProvider>
      </StrictMode>,
    )

    expect(repository.save).not.toHaveBeenCalled()
    await act(async () => { resolveLoad(stored) })
    await waitFor(() => expect(screen.getByText('来自本地的数据')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('saved')).toBeInTheDocument())

    await act(async () => { screen.getByRole('button', { name: 'change' }).click() })
    await waitFor(() => expect(repository.save).toHaveBeenCalled(), { timeout: 1000 })
    const lastSaved = vi.mocked(repository.save).mock.calls.at(-1)?.[0]
    expect(lastSaved?.settings.theme).toBe('dark')
    expect(lastSaved?.tasks[0].title).toBe('来自本地的数据')
  })

  it('does not save every timer tick but saves the latest remaining time when paused', async () => {
    const repository: Repository = {
      load: vi.fn(async () => structuredClone(seedState)),
      save: vi.fn(async () => undefined),
    }
    render(<AppProvider repository={repository}><StorageProbe /></AppProvider>)

    await waitFor(() => expect(repository.save).toHaveBeenCalled())
    vi.mocked(repository.save).mockClear()

    await act(async () => { screen.getByRole('button', { name: 'start' }).click() })
    await waitFor(() => expect(repository.save).toHaveBeenCalled())
    vi.mocked(repository.save).mockClear()

    await act(async () => {
      screen.getByRole('button', { name: 'tick' }).click()
      await new Promise(resolve => window.setTimeout(resolve, 200))
    })
    expect(repository.save).not.toHaveBeenCalled()

    await act(async () => { screen.getByRole('button', { name: 'pause' }).click() })
    await waitFor(() => expect(repository.save).toHaveBeenCalledOnce())
    expect(vi.mocked(repository.save).mock.calls[0][0].timer).toMatchObject({
      status: 'paused',
      remainingSeconds: seedState.timer.remainingSeconds - 2,
    })
  })

  it('hides session tombstones from visible state while persisting them in raw state', async () => {
    const repository: Repository = { load: vi.fn(async () => structuredClone(seedState)), save: vi.fn(async () => undefined) }
    render(<AppProvider repository={repository}><StorageProbe /></AppProvider>)
    await screen.findByText(`visible sessions ${seedState.sessions.length}`)

    await act(async () => { screen.getByRole('button', { name: 'delete session' }).click() })

    expect(screen.getByText(`visible sessions ${seedState.sessions.length - 1}`)).toBeInTheDocument()
    expect(screen.getByText(`raw sessions ${seedState.sessions.length}`)).toBeInTheDocument()
    await waitFor(() => expect(vi.mocked(repository.save).mock.calls.at(-1)?.[0].sessions.find(session => session.id === 's1')?.deletedAt).toBeTruthy())
  })

  it('keeps a deleted session hidden after remounting from the same repository', async () => {
    const repository = new MemoryRepository(seedState)
    const first = render(<AppProvider repository={repository}><StorageProbe /></AppProvider>)
    await screen.findByText(`visible sessions ${seedState.sessions.length}`)
    await act(async () => { screen.getByRole('button', { name: 'delete session' }).click() })
    await screen.findByText(`visible sessions ${seedState.sessions.length - 1}`)
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 200)) })
    expect((await repository.load())?.sessions.find(session => session.id === 's1')?.deletedAt).toBeTruthy()
    first.unmount()

    render(<AppProvider repository={repository}><StorageProbe /></AppProvider>)

    expect(await screen.findByText(`visible sessions ${seedState.sessions.length - 1}`)).toBeInTheDocument()
    expect(screen.getByText(`raw sessions ${seedState.sessions.length}`)).toBeInTheDocument()
  })
})
