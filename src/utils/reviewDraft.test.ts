import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearReviewDraft, loadReviewDraft, storeReviewDraft } from './reviewDraft'

describe('review draft protection', () => {
  beforeEach(() => localStorage.clear())

  it('recovers a review that did not reach the repository before exit', () => {
    vi.setSystemTime(new Date('2026-08-13T10:00:00.000Z'))
    storeReviewDraft('2026-08-13', { summary: '还没来得及保存', improvement: '', tomorrow: '继续完成' })

    expect(loadReviewDraft('2026-08-13')).toEqual({ summary: '还没来得及保存', improvement: '', tomorrow: '继续完成' })
  })

  it('clears only the draft confirmed by the repository', () => {
    storeReviewDraft('2026-08-12', { summary: '昨天', improvement: '', tomorrow: '' })
    storeReviewDraft('2026-08-13', { summary: '今天', improvement: '', tomorrow: '' })

    clearReviewDraft('2026-08-13')

    expect(loadReviewDraft('2026-08-13')).toBeNull()
    expect(loadReviewDraft('2026-08-12')?.summary).toBe('昨天')
  })
})
