import { useEffect, useState, type ReactNode } from 'react'
import { Check, RefreshCw, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { PwaContext, type PwaContextValue } from './PwaState'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean
}

const updateCheckInterval = 60 * 60 * 1000

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as NavigatorWithStandalone).standalone)
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_url, registration) => {
      if (registration) window.setInterval(() => void registration.update(), updateCheckInterval)
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

  const value: PwaContextValue = {
    installed,
    installAvailable: Boolean(installPrompt),
    isIos: /iphone|ipad|ipod/i.test(navigator.userAgent),
    storageSupported: Boolean(navigator.storage?.persist),
    persisted,
    install,
    requestPersistence,
  }

  return <PwaContext.Provider value={value}>
    {children}
    {(needRefresh || offlineReady) && <aside className="pwa-notice" role="status" aria-live="polite">
      <span className="pwa-notice-icon">{needRefresh ? <RefreshCw /> : <Check />}</span>
      <div>
        <b>{needRefresh ? '新版本已经准备好' : '离线使用已准备好'}</b>
        <p>{needRefresh ? '由你决定何时更新，不会打断正在进行的专注。' : '网络不稳定时，仍可打开刻度并查看本机数据。'}</p>
      </div>
      {needRefresh && <button className="pwa-update" onClick={() => void updateServiceWorker(true)}>立即更新</button>}
      <button className="pwa-dismiss" aria-label={needRefresh ? '稍后更新' : '关闭提示'} onClick={() => needRefresh ? setNeedRefresh(false) : setOfflineReady(false)}>
        {needRefresh ? '稍后' : <X />}
      </button>
    </aside>}
  </PwaContext.Provider>
}
