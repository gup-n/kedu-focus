import { createContext, useContext } from 'react'

export interface PwaContextValue {
  installed: boolean
  installAvailable: boolean
  isIos: boolean
  storageSupported: boolean
  persisted: boolean | null
  install: () => Promise<boolean>
  requestPersistence: () => Promise<boolean>
}

const unavailable = async () => false

export const PwaContext = createContext<PwaContextValue>({
  installed: false,
  installAvailable: false,
  isIos: false,
  storageSupported: false,
  persisted: null,
  install: unavailable,
  requestPersistence: unavailable,
})

export function usePwa() {
  return useContext(PwaContext)
}
