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
}

const cancelled = (reason: unknown) => reason instanceof DOMException && reason.name === 'AbortError'

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
