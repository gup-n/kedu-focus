import { describe, expect, it, vi } from 'vitest'
import { isApkReleaseReady, type ReleaseNote } from './releases'

const release: ReleaseNote = {
  version: '0.9.4',
  date: '2026-08-23',
  title: '测试',
  summary: '测试',
  apkUrl: 'https://github.com/gup-n/kedu-focus/releases/download/v0.9.4/app-release.apk',
  changes: [],
}

describe('APK release readiness', () => {
  it('rejects mutable latest download URLs', async () => {
    const request = vi.fn()
    await expect(isApkReleaseReady({ ...release, apkUrl: 'https://github.com/gup-n/kedu-focus/releases/latest/download/app-release.apk' }, request)).resolves.toBe(false)
    expect(request).not.toHaveBeenCalled()
  })

  it('accepts a reachable APK content response', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, {
      status: 200,
      headers: { 'content-length': '1234', 'content-type': 'application/vnd.android.package-archive' },
    }))
    await expect(isApkReleaseReady(release, request)).resolves.toBe(true)
    expect(request).toHaveBeenCalledWith(release.apkUrl, expect.objectContaining({ method: 'HEAD' }))
  })

  it('rejects a release that is not ready or is not an APK', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, {
      status: 200,
      headers: { 'content-length': '1234', 'content-type': 'text/html' },
    }))
    await expect(isApkReleaseReady(release, request)).resolves.toBe(false)
  })
})
