import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportFile } from './fileExport'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('exportFile', () => {
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
