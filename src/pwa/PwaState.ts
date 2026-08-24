import { createContext, useContext } from 'react'
import type { ApkDownloadProgress } from './apkUpdater'
import { emptyApkProgress } from './apkUpdater'
import { currentRelease, type ReleaseNote } from './releases'

export type UpdateCheckResult = 'available' | 'publishing' | 'current' | 'offline' | 'unsupported' | 'error'
export type NativeUpdateState = 'idle' | 'checking' | 'publishing' | 'available' | 'downloading' | 'ready' | 'installing' | 'failed'

export interface PwaContextValue {
  installed: boolean
  installAvailable: boolean
  isIos: boolean
  storageSupported: boolean
  persisted: boolean | null
  nativeAndroid: boolean
  installedAppVersion: string
  installedAppVersionCode: number
  availableRelease: ReleaseNote
  nativeUpdateState: NativeUpdateState
  apkDownloadProgress: ApkDownloadProgress
  updateAvailable: boolean
  checkingUpdate: boolean
  lastCheckedAt: string | null
  install: () => Promise<boolean>
  requestPersistence: () => Promise<boolean>
  checkForUpdate: () => Promise<UpdateCheckResult>
  applyUpdate: () => Promise<void>
  downloadUpdate: () => Promise<void>
  cancelUpdateDownload: () => Promise<void>
}

const unavailable = async () => false
const unsupportedUpdate = async (): Promise<UpdateCheckResult> => 'unsupported'
const ignoreUpdate = async () => undefined

export const PwaContext = createContext<PwaContextValue>({
  installed: false,
  installAvailable: false,
  isIos: false,
  storageSupported: false,
  persisted: null,
  nativeAndroid: false,
  installedAppVersion: currentRelease.version,
  installedAppVersionCode: 0,
  availableRelease: currentRelease,
  nativeUpdateState: 'idle',
  apkDownloadProgress: emptyApkProgress,
  updateAvailable: false,
  checkingUpdate: false,
  lastCheckedAt: null,
  install: unavailable,
  requestPersistence: unavailable,
  checkForUpdate: unsupportedUpdate,
  applyUpdate: ignoreUpdate,
  downloadUpdate: ignoreUpdate,
  cancelUpdateDownload: ignoreUpdate,
})

export function usePwa() {
  return useContext(PwaContext)
}
