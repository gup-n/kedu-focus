import { createContext, useContext } from 'react'

export type UpdateCheckResult = 'available' | 'current' | 'offline' | 'unsupported' | 'error'

export interface PwaContextValue {
  installed: boolean
  installAvailable: boolean
  isIos: boolean
  storageSupported: boolean
  persisted: boolean | null
  updateAvailable: boolean
  checkingUpdate: boolean
  lastCheckedAt: string | null
  install: () => Promise<boolean>
  requestPersistence: () => Promise<boolean>
  checkForUpdate: () => Promise<UpdateCheckResult>
  applyUpdate: () => Promise<void>
  downloadUpdate: () => void
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
  updateAvailable: false,
  checkingUpdate: false,
  lastCheckedAt: null,
  install: unavailable,
  requestPersistence: unavailable,
  checkForUpdate: unsupportedUpdate,
  applyUpdate: ignoreUpdate,
  downloadUpdate: () => undefined,
})

export function usePwa() {
  return useContext(PwaContext)
}
