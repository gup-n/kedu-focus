import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { MemoryRepository } from '../data/repository'
import { seedState } from '../data/seed'
import { AppProvider } from '../state/AppContext'

function renderStats() {
  const state = structuredClone(seedState)
  state.sessions = [{
    id: 'real-stat',
    taskId: 't1',
    categoryId: 'work',
    startedAt: '2026-08-10T01:00:00.000Z',
    endedAt: '2026-08-10T01:25:00.000Z',
    seconds: 1500,
    minutes: 25,
  }]
  state.sleep = [
    { id: 'sleep-1', date: '2026-08-09', sleptAt: '2026-08-08T23:30:00+08:00', wokeAt: '2026-08-09T07:00:00+08:00', score: 4 },
    { id: 'sleep-2', date: '2026-08-10', sleptAt: '2026-08-10T00:30:00+08:00', wokeAt: '2026-08-10T08:00:00+08:00', score: 5 },
  ]
  return render(<MemoryRouter initialEntries={['/stats']}><AppProvider repository={new MemoryRepository(state)}><App/></AppProvider></MemoryRouter>)
}

describe('statistics page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-08-10T04:00:00.000Z'))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('switches real week/month/year ranges and average basis', async () => {
    renderStats()
    expect(await screen.findByText('看见注意力去了哪里')).toBeInTheDocument()
    expect(screen.getAllByText('25 分钟').length).toBeGreaterThan(0)
    expect(screen.getByText('睡眠概览')).toBeInTheDocument()
    expect(screen.getByText('2 晚记录')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '周' }))
    expect(screen.getByText('8月10日 — 8月16日')).toBeInTheDocument()
    expect(screen.getByText('1 晚记录')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '周期自然日' }))
    expect(screen.getByText('周期日均')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '年' }))
    expect(screen.getByText('2026 年')).toBeInTheDocument()
    expect(screen.getByText('每月趋势')).toBeInTheDocument()
  })

  it('validates and applies a custom inclusive range', async () => {
    renderStats()
    await screen.findByText('看见注意力去了哪里')
    fireEvent.click(screen.getByRole('button', { name: '自定义' }))
    fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-08-11' } })
    fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2026-08-10' } })
    fireEvent.click(screen.getByRole('button', { name: '应用范围' }))
    expect(screen.getByRole('alert')).toHaveTextContent('开始日期不能晚于结束日期')

    fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-08-10' } })
    fireEvent.click(screen.getByRole('button', { name: '应用范围' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('8月10日 — 8月10日')).toBeInTheDocument()
  })
})
