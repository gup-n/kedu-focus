import { addDays, addWeeks, differenceInCalendarDays, format, getDay, parseISO } from 'date-fns'
import type { Task } from '../domain/types'

export function nextRecurringDate(task: Task): string | undefined {
  if (!task.recurrence) return undefined
  const planned = parseISO(task.plannedDate)
  if (task.recurrence.kind === 'daily') return format(addDays(planned, 1), 'yyyy-MM-dd')
  if (task.recurrence.kind === 'weekly') return format(addWeeks(planned, 1), 'yyyy-MM-dd')
  const weekdays = new Set(task.recurrence.weekdays ?? [])
  if (!weekdays.size) return undefined
  for (let offset = 1; offset <= 14; offset += 1) {
    const candidate = addDays(planned, offset)
    if (weekdays.has(getDay(candidate))) return format(candidate, 'yyyy-MM-dd')
  }
  return undefined
}

export function createNextRecurringTask(task: Task, id: string, now: string): Task | undefined {
  const plannedDate = nextRecurringDate(task)
  if (!plannedDate) return undefined
  const dueOffset = Math.max(0, differenceInCalendarDays(parseISO(task.dueDate), parseISO(task.plannedDate)))
  return {
    ...task,
    id,
    plannedDate,
    dueDate: format(addDays(parseISO(plannedDate), dueOffset), 'yyyy-MM-dd'),
    recurrenceSourceId: task.recurrenceSourceId ?? task.id,
    createdAt: now,
    updatedAt: now,
    completedAt: undefined,
    deletedAt: undefined,
  }
}
