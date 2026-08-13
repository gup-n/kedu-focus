export interface ReviewDraftFields {
  summary: string
  improvement: string
  tomorrow: string
}

interface StoredReviewDraft {
  date: string
  savedAt: string
  fields: ReviewDraftFields
}

const storageKey = 'kedu-focus-review-drafts-v1'
const maximumDrafts = 30

function readAll(): StoredReviewDraft[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item): item is StoredReviewDraft => {
      if (!item || typeof item !== 'object') return false
      const draft = item as Partial<StoredReviewDraft>
      return typeof draft.date === 'string'
        && typeof draft.savedAt === 'string'
        && Boolean(draft.fields)
        && typeof draft.fields?.summary === 'string'
        && typeof draft.fields?.improvement === 'string'
        && typeof draft.fields?.tomorrow === 'string'
    })
  } catch {
    return []
  }
}

export function loadReviewDraft(date: string): ReviewDraftFields | null {
  return readAll().find(draft => draft.date === date)?.fields ?? null
}

export function storeReviewDraft(date: string, fields: ReviewDraftFields) {
  try {
    const next = [
      { date, fields, savedAt: new Date().toISOString() },
      ...readAll().filter(draft => draft.date !== date),
    ].slice(0, maximumDrafts)
    localStorage.setItem(storageKey, JSON.stringify(next))
  } catch {
    // 草稿缓存不可用时，后续自动保存仍会写入正式仓库。
  }
}

export function clearReviewDraft(date: string) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(readAll().filter(draft => draft.date !== date)))
  } catch {
    // 浏览器禁用本地存储时无需阻断正式保存。
  }
}
