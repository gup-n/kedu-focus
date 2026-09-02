import { Capacitor } from '@capacitor/core'

export type FileExportResult = 'saved' | 'shared' | 'downloaded' | 'cancelled'

interface FileSystemWritableFileStream {
  write(data: Blob): Promise<void>
  close(): Promise<void>
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>
}

interface WindowWithFilePicker extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<FileSystemFileHandle>
  showDirectoryPicker?: () => Promise<{ getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle> }>
}

const cancelled = (reason: unknown) => reason instanceof DOMException && reason.name === 'AbortError'

export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

async function saveNativeAndroid(blob: Blob, filename: string): Promise<FileExportResult> {
  const { Directory, Filesystem } = await import('@capacitor/filesystem')
  await Filesystem.writeFile({
    path: `kedu-focus/${filename}`,
    data: await blobToBase64(blob),
    directory: Directory.Documents,
    recursive: true,
  })
  return 'saved'
}

export function downloadBlob(contents: BlobPart[], filename: string, type: string) {
  const url = URL.createObjectURL(new Blob(contents, { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportFile(contents: BlobPart[], filename: string, type: string): Promise<FileExportResult> {
  const blob = new Blob(contents, { type })

  if (isNativeAndroid()) {
    return saveNativeAndroid(blob, filename)
  }

  const picker = (window as WindowWithFilePicker).showSaveFilePicker

  if (picker) {
    try {
      const extension = filename.includes('.') ? `.${filename.split('.').pop()}` : ''
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: '刻度导出文件', accept: { [type.split(';')[0]]: extension ? [extension] : [] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return 'saved'
    } catch (reason) {
      if (cancelled(reason)) return 'cancelled'
    }
  }

  const file = new File([blob], filename, { type })
  if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (reason) {
      if (cancelled(reason)) return 'cancelled'
    }
  }

  downloadBlob([blob], filename, type)
  return 'downloaded'
}

export async function exportFiles(files: Array<{ contents: BlobPart[]; filename: string; type: string }>): Promise<FileExportResult> {
  if (isNativeAndroid()) {
    for (const file of files) await exportFile(file.contents, file.filename, file.type)
    return 'saved'
  }
  const picker = (window as WindowWithFilePicker).showDirectoryPicker
  if (picker) {
    try {
      const directory = await picker()
      for (const file of files) {
        const handle = await directory.getFileHandle(file.filename, { create: true })
        const writable = await handle.createWritable()
        await writable.write(new Blob(file.contents, { type: file.type }))
        await writable.close()
      }
      return 'saved'
    } catch (reason) {
      if (cancelled(reason)) return 'cancelled'
    }
  }
  throw new Error('当前环境不支持一次选择导出目录，请改用合并为单个文件。')
}
