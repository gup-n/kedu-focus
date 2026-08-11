import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoState } from '../test/fixtures'
import { createBackupEnvelope } from './backup'
import {
  DEFAULT_WEBDAV_FILENAME,
  downloadWebDav,
  inspectWebDav,
  stateFingerprint,
  uploadWebDav,
  webDavTarget,
  type WebDavConfig,
} from './webdav'

const config: WebDavConfig = {
  serverUrl: 'https://dav.example.com/remote.php/dav/files/me/',
  username: '用户',
  password: '密 码',
  filename: DEFAULT_WEBDAV_FILENAME,
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('WebDAV transport', () => {
  it('builds a safe target URL and rejects path traversal in the filename', () => {
    expect(webDavTarget(config)).toBe('https://dav.example.com/remote.php/dav/files/me/kedu-focus-backup.json')
    expect(() => webDavTarget({ ...config, filename: '../backup.json' })).toThrow('不能包含路径分隔符')
  })

  it('treats a missing remote file as a successful connection', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 404 }))
    vi.stubGlobal('fetch', fetcher)

    await expect(inspectWebDav(config)).resolves.toEqual({ exists: false })
    expect(fetcher).toHaveBeenCalledWith(webDavTarget(config), expect.objectContaining({ method: 'GET', cache: 'no-store' }))
    expect((fetcher.mock.calls[0][1].headers as Record<string, string>).Authorization).toMatch(/^Basic /)
  })

  it('downloads and validates a remote backup', async () => {
    const envelope = createBackupEnvelope(demoState, '2026-08-11T09:00:00.000Z')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(envelope), {
      status: 200,
      headers: { etag: '"remote-1"', 'last-modified': 'Tue, 11 Aug 2026 09:00:00 GMT' },
    })))

    const remote = await downloadWebDav(config)
    expect(remote?.envelope.exportedAt).toBe('2026-08-11T09:00:00.000Z')
    expect(remote?.etag).toBe('"remote-1"')
  })

  it('uses ETag preconditions while uploading to avoid overwriting a newer remote file', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204, headers: { etag: '"remote-2"' } }))
    vi.stubGlobal('fetch', fetcher)

    await uploadWebDav(config, demoState, '"remote-1"')
    const init = fetcher.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('PUT')
    expect(init.headers).toMatchObject({ 'If-Match': '"remote-1"', 'Content-Type': 'application/json; charset=utf-8' })
    expect(JSON.parse(String(init.body)).format).toBe('focus-planner-backup')
  })

  it('reports a remote write race as a readable conflict', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 412 })))
    await expect(uploadWebDav(config, demoState, '"stale"')).rejects.toMatchObject({ status: 412 })
  })

  it('ignores the live timer display cache when comparing data versions', () => {
    const first = structuredClone(demoState)
    const second = structuredClone(demoState)
    second.timer.liveElapsedSeconds = 77
    expect(stateFingerprint(first)).toBe(stateFingerprint(second))
  })
})
