import { describe, expect, it } from 'vitest'
import { seedState } from './seed'
import { MemoryRepository } from './repository'

describe('MemoryRepository', () => {
  it('returns defensive copies from load and save', async () => {
    const repository = new MemoryRepository(seedState)
    const first = await repository.load()
    first!.tasks[0].title = '不应泄漏到仓储'

    const second = await repository.load()
    expect(second!.tasks[0].title).toBe(seedState.tasks[0].title)

    const changed = structuredClone(seedState)
    changed.tasks[0].title = '已持久化的标题'
    await repository.save(changed)
    changed.tasks[0].title = '保存后又被外部修改'

    expect((await repository.load())!.tasks[0].title).toBe('已持久化的标题')
  })
})
