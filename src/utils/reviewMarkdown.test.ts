import { afterEach, describe, expect, it, vi } from 'vitest'
import { seedState } from '../data/seed'
import { buildReviewMarkdown, downloadReviewMarkdown } from './reviewMarkdown'

afterEach(() => vi.restoreAllMocks())

describe('buildReviewMarkdown', () => {
  it('exports the review with stable heading levels and daily metrics', () => {
    const state = structuredClone(seedState)
    const review = { id: 'review-test', date: '2026-08-09', summary: '完成核心功能', improvement: '减少切换', tomorrow: '补充测试' }
    state.tasks = [{ ...state.tasks[0], completedAt: '2026-08-09T12:00:00.000Z' }]
    state.sessions = [{ ...state.sessions[0], startedAt: '2026-08-09T09:00:00.000Z', minutes: 18 }]

    const markdown = buildReviewMarkdown(state, review)

    expect(markdown).toContain('# 2026年8月9日')
    expect(markdown).toContain('完成任务：1 项 · 专注时长：18 分钟')
    expect(markdown).toContain('## 今日收获\n\n完成核心功能')
    expect(markdown).toContain('## 可以改进\n\n减少切换')
    expect(markdown).toContain('## 明日计划\n\n补充测试')
  })

  it('creates a real Markdown file download with the review date as its name', () => {
    const createObjectURL = vi.fn(() => 'blob:review')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const review = { id: 'review-test', date: '2026-08-09', summary: '收获', improvement: '改进', tomorrow: '计划' }

    downloadReviewMarkdown(seedState, review)

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalledOnce()
  })
})
