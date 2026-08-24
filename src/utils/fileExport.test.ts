import { afterEach, describe, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { exportFile } from './fileExport'

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Documents: 'DOCUMENTS' },
  Filesystem: { writeFile: vi.fn() },
}))

vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.mocked(Filesystem.writeFile).mockReset()
  vi.mocked(Share.share).mockReset()
})

describe('exportFile', () => {
  it('persists files through Capacitor and opens the Android share sheet', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android')
    vi.mocked(Filesystem.writeFile).mockResolvedValue({ uri: 'content://backup.json' })
    vi.mocked(Share.share).mockResolvedValue({ activityType: undefined })

    await expect(exportFile(['刻度'], '刻度备份.json', 'application/json;charset=utf-8')).resolves.toBe('saved')
    expect(Filesystem.writeFile).toHaveBeenCalledWith(expect.objectContaining({
      path: '刻度备份.json',
      directory: Directory.Documents,
      data: expect.any(String),
      recursive: true,
    }))
    expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ files: ['content://backup.json'] }))
  })

  it('uses the system file picker when available', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn().mockResolvedValue(undefined)
    const picker = vi.fn().mockResolvedValue({ createWritable: vi.fn().mockResolvedValue({ write, close }) })
    vi.stubGlobal('showSaveFilePicker', picker)

    await expect(exportFile(['{}'], '备份.json', 'application/json;charset=utf-8')).resolves.toBe('saved')
    expect(write).toHaveBeenCalledWith(expect.any(Blob))
    expect(close).toHaveBeenCalledOnce()
  })

  it('uses offline-capable file sharing on mobile', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { onLine: false, canShare: vi.fn(() => true), share })

    await expect(exportFile(['{}'], '备份.json', 'application/json;charset=utf-8')).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.any(File)] }))
  })

  it('falls back to a mounted blob download link', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:offline') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    await expect(exportFile(['{}'], '备份.json', 'application/json;charset=utf-8')).resolves.toBe('downloaded')
    expect(click).toHaveBeenCalledOnce()
  })

  it('does not fall through when the user cancels saving', async () => {
    vi.stubGlobal('showSaveFilePicker', vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')))
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:unexpected') })

    await expect(exportFile(['{}'], '备份.json', 'application/json;charset=utf-8')).resolves.toBe('cancelled')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})
