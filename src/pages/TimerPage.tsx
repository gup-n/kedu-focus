import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Pause, Pencil, Play, RotateCcw, Timer, Trash2, X } from 'lucide-react'
import type { FocusSession } from '../domain/types'
import { useApp } from '../state/AppContext'
import { availableTimerTasks, focusRoundLabel, sessionTimeRange, sessionsForShanghaiDate, shanghaiDateTimeInput } from '../utils/focusSession'
import { shanghaiDateKey } from '../utils/statistics'

const sessionSeconds = (session: Pick<FocusSession, 'seconds' | 'minutes'>) => session.seconds ?? session.minutes * 60
const durationText = (seconds: number) => {
  const whole = Math.max(0, Math.round(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor(whole % 3600 / 60)
  const remaining = whole % 60
  return hours ? `${hours} 小时 ${minutes} 分钟` : remaining ? `${minutes} 分 ${remaining} 秒` : `${minutes} 分钟`
}

export default function TimerPage() {
  const { state, dispatch } = useApp()
  const timer = state.timer
  const [date, setDate] = useState(() => shanghaiDateKey())
  const [editing, setEditing] = useState<FocusSession>()
  const duration = timer.durationSeconds
  const liveElapsed = timer.liveElapsedSeconds ?? timer.elapsedSeconds
  const active = timer.status === 'running' || timer.status === 'paused'
  const overtime = timer.phase === 'focus' && liveElapsed >= duration && active
  const displaySeconds = overtime ? liveElapsed - duration : timer.remainingSeconds
  const minutes = String(Math.floor(displaySeconds / 60)).padStart(2, '0')
  const seconds = String(displaySeconds % 60).padStart(2, '0')
  const progress = duration ? Math.min(1, liveElapsed / duration) : 0
  const phases = [['focus', '专注'], ['shortBreak', '短休息'], ['longBreak', '长休息']] as const
  const todaySessions = sessionsForShanghaiDate(state.sessions, date)
  const todaySeconds = todaySessions.reduce((sum, session) => sum + sessionSeconds(session), 0)
  const timerTasks = useMemo(() => availableTimerTasks(state.tasks, date), [state.tasks, date])

  useEffect(() => {
    const syncDate = () => setDate(shanghaiDateKey())
    const interval = window.setInterval(syncDate, 60_000)
    document.addEventListener('visibilitychange', syncDate)
    window.addEventListener('pageshow', syncDate)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', syncDate)
      window.removeEventListener('pageshow', syncDate)
    }
  }, [])

  useEffect(() => {
    if (timer.taskId && !timerTasks.some(task => task.id === timer.taskId)) {
      dispatch({ type: 'SET_TIMER_TASK' })
    }
  }, [dispatch, timer.taskId, timerTasks])

  function switchPhase(phase: typeof timer.phase) {
    if (phase === timer.phase) return
    if (active) {
      const message = timer.phase === 'focus'
        ? '当前专注还未结束。切换后将结束并按实际时长记录。'
        : '当前休息还未结束。切换后将放弃本次休息。'
      if (!window.confirm(message)) return
      dispatch({ type: 'TIMER_END_EARLY' })
    }
    dispatch({ type: 'SET_TIMER_PHASE', phase })
  }

  function endEarly() {
    const label = timer.phase === 'focus'
      ? (overtime ? '结束并记录本次专注？' : '提前结束并记录本次专注？')
      : '提前结束本次休息？'
    if (window.confirm(label)) dispatch({ type: 'TIMER_END_EARLY' })
  }

  function reset() {
    if (active && !window.confirm('重置会放弃当前阶段，确定继续？')) return
    dispatch({ type: 'TIMER_RESET' })
  }

  function removeSession(id: string, label: string) {
    if (window.confirm(`删除 ${label} 的专注记录？删除后不会出现在今日记录和统计中。`)) {
      dispatch({ type: 'DELETE_SESSION', id })
    }
  }

  return <div className="page">
    <div className="page-head"><div><p className="eyebrow">专注计时</p><h1>只做眼前这一件事</h1></div></div>
    <div className="timer-layout">
      <section className="card timer-card">
        <div className="phase-tabs">{phases.map(([phase, label]) => <button key={phase} className={timer.phase === phase ? 'active' : ''} onClick={() => switchPhase(phase)}>{label}</button>)}</div>
        <div className={`timer-ring ${overtime ? 'overtime' : ''}`} style={{ '--progress': `${progress * 360}deg` } as React.CSSProperties}>
          <div>
            <span>{overtime ? '已达成 · 继续专注' : timer.status === 'running' ? (timer.phase === 'focus' ? '正在专注' : '正在休息') : timer.status === 'paused' ? '已暂停' : timer.status === 'finished' ? '本阶段完成' : '准备好了吗'}</span>
            <strong>{overtime ? '+' : ''}{minutes}:{seconds}</strong>
            <small>{timer.phase === 'focus' ? (overtime ? '结束时会按实际时长记录' : focusRoundLabel(todaySessions.length, state.settings.longBreakEvery)) : `${Math.ceil(duration / 60)} 分钟恢复时间`}</small>
          </div>
        </div>
        {timer.phase === 'focus' && <select className="task-select" aria-label="本次专注任务" value={timer.taskId ?? ''} disabled={active} onChange={event => dispatch({ type: 'SET_TIMER_TASK', id: event.target.value })}>
          <option value="">不关联任务</option>
          {timerTasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
        </select>}
        <div className="timer-actions">
          {timer.status === 'running'
            ? <button className="btn primary" onClick={() => dispatch({ type: 'TIMER_PAUSE' })}><Pause /> 暂停</button>
            : timer.status === 'finished'
              ? <button className="btn primary" onClick={() => dispatch({ type: 'TIMER_RESET' })}><RotateCcw /> 再来一次</button>
              : <button className="btn primary" onClick={() => dispatch({ type: 'TIMER_START' })}><Play /> {timer.status === 'paused' ? '继续' : timer.phase === 'focus' ? '开始专注' : '开始休息'}</button>}
          {active && <button className="btn quiet" onClick={endEarly}>{timer.phase === 'focus' ? (overtime ? '结束并记录' : '提前结束并记录') : '提前结束休息'}</button>}
          <button className="btn quiet" onClick={reset}>重置</button>
        </div>
      </section>
      <section className="card">
        <div className="card-head"><h2>今日专注记录</h2><span className="round-count">{todaySessions.length} 次 · {durationText(todaySeconds)}</span></div>
        {todaySessions.length ? <div className="focus-log">{todaySessions.map(session => {
          const task = state.tasks.find(item => item.id === session.taskId)
          const category = state.categories.find(item => item.id === session.categoryId)
          const range = `${format(new Date(session.startedAt), 'HH:mm')}–${format(new Date(session.endedAt), 'HH:mm')}`
          return <article key={session.id}>
            <i style={{ background: category?.color ?? 'var(--cyan)' }}/>
            <div><b>{task?.title ?? '未关联任务'}</b><p>{range} · {category?.name ?? '未分类'}{session.note ? ` · ${session.note}` : ''}</p></div>
            <strong>{durationText(sessionSeconds(session))}</strong>
            <button className="focus-edit" aria-label={`编辑专注记录：${range}`} onClick={() => setEditing(session)}><Pencil /></button>
            <button className="focus-delete" aria-label={`删除专注记录：${range}`} onClick={() => removeSession(session.id, range)}><Trash2 /></button>
          </article>
        })}</div> : <div className="empty"><Timer /><b>今天还没有专注记录</b><p>开始第一轮，时间会在这里留下清晰的刻度。</p></div>}
        <p className="muted timer-note">每次结束的专注都按实际秒数保存在这里；编辑或删除后会立即刷新统计和同步差异。</p>
      </section>
    </div>
    {editing && <FocusSessionDialog session={editing} close={() => setEditing(undefined)}/>} 
  </div>
}

function FocusSessionDialog({ session, close }: { session: FocusSession; close: () => void }) {
  const { state, dispatch } = useApp()
  const [startedAt, setStartedAt] = useState(() => shanghaiDateTimeInput(session.startedAt))
  const [endedAt, setEndedAt] = useState(() => shanghaiDateTimeInput(session.endedAt))
  const [taskId, setTaskId] = useState(session.taskId ?? '')
  const [categoryId, setCategoryId] = useState(session.categoryId)
  const [note, setNote] = useState(session.note ?? '')
  const [error, setError] = useState('')
  const tasks = state.tasks.filter(task => !task.deletedAt || task.id === session.taskId)
  const categories = state.categories.filter(category => !category.archived || category.id === session.categoryId)

  function save(event: React.FormEvent) {
    event.preventDefault()
    try {
      const range = sessionTimeRange(startedAt, endedAt)
      dispatch({ type: 'UPDATE_SESSION', session: { ...session, ...range, taskId: taskId || undefined, categoryId, note: note.trim(), updatedAt: new Date().toISOString() } })
      close()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法保存这条专注记录。')
    }
  }

  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && close()}>
    <form className="dialog focus-session-dialog" onSubmit={save}>
      <div className="dialog-head"><div><p className="eyebrow">专注记录</p><h2>编辑实际投入</h2></div><button type="button" onClick={close} aria-label="关闭"><X /></button></div>
      <div className="form-grid">
        <label>开始时间<input aria-label="专注开始时间" required type="datetime-local" value={startedAt} onChange={event => { setStartedAt(event.target.value); setError('') }}/></label>
        <label>结束时间<input aria-label="专注结束时间" required type="datetime-local" value={endedAt} onChange={event => { setEndedAt(event.target.value); setError('') }}/></label>
      </div>
      <label>关联任务<select aria-label="专注关联任务" value={taskId} onChange={event => setTaskId(event.target.value)}><option value="">不关联任务</option>{tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
      <label>分类<select aria-label="专注分类" required value={categoryId} onChange={event => setCategoryId(event.target.value)}>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label>备注<textarea aria-label="专注备注" value={note} onChange={event => setNote(event.target.value)} placeholder="记录中止原因或这段时间的实际内容"/></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="btn quiet" onClick={close}>取消</button><button type="submit" className="btn primary">保存修改</button></div>
    </form>
  </div>
}
