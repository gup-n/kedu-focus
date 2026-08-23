import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, RefreshCw, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Capacitor } from '@capacitor/core'
import { PwaContext, type PwaContextValue, type UpdateCheckResult } from './PwaState'
import { currentRelease, fetchLatestRelease, isReleaseNewer, type ReleaseNote } from './releases'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean
}

const updateCheckInterval = 60 * 60 * 1000
const seenReleaseKey = 'kedu-focus-seen-release'

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as NavigatorWithStandalone).standalone)
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [detectedUpdate, setDetectedUpdate] = useState(false)
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null)
  const [availableRelease, setAvailableRelease] = useState<ReleaseNote>(currentRelease)
  const nativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
  const [nativeReleaseAvailable, setNativeReleaseAvailable] = useState(false)
  const [showInstalledRelease, setShowInstalledRelease] = useState(() => {
    const seen = localStorage.getItem(seenReleaseKey)
    return seen !== currentRelease.version
  })
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_url, registration) => {
      if (registration) {
        registrationRef.current = registration
        window.setInterval(() => void registration.update(), updateCheckInterval)
      }
    },
  })

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setInstallPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  useEffect(() => {
    if (needRefresh) void fetchLatestRelease().then(setAvailableRelease)
  }, [needRefresh])

  useEffect(() => {
    if (!nativeAndroid || !navigator.onLine) return
    void fetchLatestRelease(true).then(release => {
      if (isReleaseNewer(release)) {
        setAvailableRelease(release)
        setNativeReleaseAvailable(true)
      }
    })
  }, [nativeAndroid])

  async function install() {
    if (!installPrompt) return false
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') setInstallPrompt(null)
    return choice.outcome === 'accepted'
  }

  async function requestPersistence() {
    if (!navigator.storage?.persist) return false
    const granted = await navigator.storage.persist()
    setPersisted(granted)
    return granted
  }

  async function checkForUpdate(): Promise<UpdateCheckResult> {
    if (!navigator.onLine) return 'offline'
    setCheckingUpdate(true)
    try {
      if (nativeAndroid) {
        const release = await fetchLatestRelease(true)
        const available = isReleaseNewer(release)
        setAvailableRelease(release)
        setNativeReleaseAvailable(available)
        setDetectedUpdate(available)
        setLastCheckedAt(new Date().toISOString())
        return available ? 'available' : 'current'
      }
      const registration = registrationRef.current ?? await navigator.serviceWorker?.getRegistration?.()
      if (!registration) return 'unsupported'
      registrationRef.current = registration
      await registration.update()
      await new Promise(resolve => window.setTimeout(resolve, 120))
      const available = Boolean(registration.waiting || registration.installing || needRefresh)
      setDetectedUpdate(available)
      setLastCheckedAt(new Date().toISOString())
      return available ? 'available' : 'current'
    } catch {
      return 'error'
    } finally {
      setCheckingUpdate(false)
    }
  }

  async function applyUpdate() {
    await updateServiceWorker(true)
  }

  function downloadUpdate() {
    if (availableRelease.apkUrl) window.open(availableRelease.apkUrl, '_blank', 'noopener,noreferrer')
  }

  function dismissInstalledRelease() {
    localStorage.setItem(seenReleaseKey, currentRelease.version)
    setShowInstalledRelease(false)
  }

  const updateAvailable = needRefresh || detectedUpdate || nativeReleaseAvailable

  const value: PwaContextValue = {
    installed,
    installAvailable: Boolean(installPrompt),
    isIos: /iphone|ipad|ipod/i.test(navigator.userAgent),
    storageSupported: Boolean(navigator.storage?.persist),
    persisted,
    updateAvailable,
    checkingUpdate,
    lastCheckedAt,
    install,
    requestPersistence,
    checkForUpdate,
    applyUpdate,
    downloadUpdate,
  }

  return <PwaContext.Provider value={value}>
    {children}
    {(updateAvailable || offlineReady || showInstalledRelease) && <aside className="pwa-notice" role="status" aria-live="polite">
      <span className="pwa-notice-icon">{updateAvailable ? <RefreshCw /> : <Check />}</span>
      <div>
        <b>{updateAvailable ? (nativeAndroid ? `新版本 v${availableRelease.version} 可用` : `新版本 v${availableRelease.version} 已准备好`) : showInstalledRelease ? `版本公告 · v${currentRelease.version}` : '离线使用已准备好'}</b>
        <p>{updateAvailable ? availableRelease.summary : showInstalledRelease ? currentRelease.summary : '网络不稳定时，仍可打开刻度并查看本机数据。'}</p>
      </div>
      {needRefresh && <button className="pwa-update" onClick={() => void applyUpdate()}>立即更新</button>}
      {nativeAndroid && nativeReleaseAvailable && availableRelease.apkUrl && <button className="pwa-update" onClick={downloadUpdate}>下载新版 APK</button>}
      <button className="pwa-dismiss" aria-label={needRefresh ? '稍后更新' : updateAvailable ? '知道了' : showInstalledRelease ? '知道了' : '关闭提示'} onClick={() => needRefresh ? setNeedRefresh(false) : updateAvailable ? setNativeReleaseAvailable(false) : showInstalledRelease ? dismissInstalledRelease() : setOfflineReady(false)}>
        {needRefresh ? '稍后' : updateAvailable ? '知道了' : showInstalledRelease ? '知道了' : <X />}
      </button>
    </aside>}
  </PwaContext.Provider>
}
