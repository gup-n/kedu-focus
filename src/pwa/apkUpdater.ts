import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type ApkDownloadState = 'idle' | 'checking' | 'downloading' | 'ready' | 'installing' | 'installed' | 'failed' | 'cancelled'

export interface ApkDownloadProgress {
  state: ApkDownloadState
  version: string
  downloadedBytes: number
  totalBytes: number | null
  percent: number | null
  error?: string
}

interface ApkUpdaterPlugin {
  startDownload(options: { url: string; version: string }): Promise<ApkDownloadProgress>
  getDownloadStatus(): Promise<ApkDownloadProgress>
  installDownloaded(): Promise<{ status: 'started' | 'permission-required' | 'not-ready' }>
  canInstallPackages(): Promise<{ granted: boolean }>
  cancelDownload(): Promise<ApkDownloadProgress>
  addListener(eventName: 'progress', listener: (progress: ApkDownloadProgress) => void): Promise<PluginListenerHandle>
}

export const emptyApkProgress: ApkDownloadProgress = {
  state: 'idle',
  version: '',
  downloadedBytes: 0,
  totalBytes: null,
  percent: null,
}

export const ApkUpdater = registerPlugin<ApkUpdaterPlugin>('ApkUpdater')

interface FocusNotificationPlugin {
  notify(options: { title: string; body: string }): Promise<void>
  startFocus(options: { title?: string; body?: string }): Promise<void>
  updateFocus(options: { title?: string; body?: string }): Promise<void>
  stopFocus(): Promise<void>
}

export const FocusNotification = registerPlugin<FocusNotificationPlugin>('FocusNotification')
