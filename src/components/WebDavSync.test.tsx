import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRepository } from '../data/repository'
import { AppProvider } from '../state/AppContext'
import { demoState } from '../test/fixtures'
import { createBackupEnvelope } from '../utils/backup'
import { WEBDAV_CONFIG_KEY } from '../utils/webdav'
import { WebDavSync } from './WebDavSync'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('WebDAV history recovery', () => {
  it('lists snapshots and opens the existing difference ledger without cloud overwrite actions', async () => {
    localStorage.setItem(WEBDAV_CONFIG_KEY, JSON.stringify({
      serverUrl: 'https://192.168.1.20:8443/',
      filename: 'kedu-focus-backup.json',
      username: 'kedu',
      password: 'secret',
    }))
    const historicalState = structuredClone(demoState)
    historicalState.reviews[0].summary = '历史版本中的复盘内容'
    const envelope = createBackupEnvelope(historicalState, '2026-08-10T09:00:00.000Z')
    const version = {
      id: 'kedu-focus-backup.20260811T100000000000Z.abc123.json',
      archivedAt: '2026-08-11T10:00:00.000Z',
      exportedAt: envelope.exportedAt,
      sizeBytes: 2048,
      etag: '"history-1"',
      counts: { tasks: 4, categories: 4, sessions: 5, reviews: 1, sleep: 1 },
    }
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ versions: [version] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(envelope), { status: 200, headers: { etag: version.etag } })))

    render(<AppProvider repository={new MemoryRepository(demoState)}><WebDavSync /></AppProvider>)
    await screen.findByText('4 条任务记录')
    fireEvent.click(screen.getByRole('button', { name: '查看历史' }))

    expect(await screen.findByText(/4 任务 · 5 专注 · 1 复盘 · 1 睡眠/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /比较/ }))

    expect(await screen.findByText('历史版本差异账本')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载 JSON' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '整份恢复本机' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '安全合并到本机' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '本机覆盖云端' })).not.toBeInTheDocument()
    expect(screen.getAllByText('需要选择').length).toBeGreaterThan(0)
  })
})
