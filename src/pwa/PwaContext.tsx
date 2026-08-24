import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, RefreshCw, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Capacitor } from '@capacitor/core'
import { App, type AppInfo } from '@capacitor/app'
import { ApkUpdater, emptyApkProgress, type ApkDownloadProgress } from './apkUpdater'
import { PwaContext, type NativeUpdateState, type PwaContextValue, type UpdateCheckResult } from './PwaState'
import { currentRelease, fetchLatestRelease, isApkReleaseReady, isReleaseNewer, releases, versionNumber, type ReleaseNote } from './releases'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface NavigatorWithStandalone extends Navigator { standalone?: boolean }

const updateCheckInterval = 60 * 60 * 1000
const pendingApkVersionKey = 'kedu-focus-pending-apk-version'
const pendingInstallPermissionKey = 'kedu-focus-pending-install-permission'
const downloadedApkPathKey = 'kedu-focus-apk-download-path'

function releaseNoticeKey(version: string) {
  return `kedu-focus-seen-release-notice:${version}`
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as NavigatorWithStandalone).standalone)
}

function progressState(progress: ApkDownloadProgress): NativeUpdateState | null {
  if (progress.state === 'checking') return 'checking'
  if (progress.state === 'downloading') return 'downloading'
  if (progress.state === 'ready') return 'ready'
  if (progress.state === 'installing') return 'installing'
  if (progress.state === 'failed') return 'failed'
  return null
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const nativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [detectedUpdate, setDetectedUpdate] = useState(false)
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null)
  const [availableRelease, setAvailableRelease] = useState<ReleaseNote>(currentRelease)
  const [announcementRelease, setAnnouncementRelease] = useState<ReleaseNote>(currentRelease)
  const [installedAppVersion, setInstalledAppVersion] = useState(currentRelease.version)
  const [installedAppVersionCode, setInstalledAppVersionCode] = useState(versionNumber(currentRelease.version))
  const [nativeUpdateState, setNativeUpdateState] = useState<NativeUpdateState>('idle')
  const [apkDownloadProgress, setApkDownloadProgress] = useState<ApkDownloadProgress>(emptyApkProgress)
  const [showInstalledRelease, setShowInstalledRelease] = useState(() => !nativeAndroid && localStorage.getItem(releaseNoticeKey(currentRelease.version)) !== '1')
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_url, registration) => {
      if (!registration) return
      if (nativeAndroid) {
        setNeedRefresh(false)
        setOfflineReady(false)
        void registration.unregister()
        return
      }
      registrationRef.current = registration
      window.setInterval(() => void registration.update(), updateCheckInterval)
    },
  })

  function setProgress(progress: ApkDownloadProgress) {
    setApkDownloadProgress(progress)
    const next = progressState(progress)
    if (next) setNativeUpdateState(next)
    if (progress.state === 'ready') localStorage.setItem(downloadedApkPathKey, 'cache://kedu-update.apk')
    if (progress.state === 'cancelled') {
      localStorage.removeItem(downloadedApkPathKey)
      setNativeUpdateState('available')
    }
  }

  async function readInstalledInfo() {
    const info = await App.getInfo()
    const build = Number.parseInt(info.build, 10) || versionNumber(info.version)
    setInstalledAppVersion(info.version)
    setInstalledAppVersionCode(build)
    const release = releases.find(item => item.version === info.version) ?? currentRelease
    setAnnouncementRelease(release)
    const pendingVersion = localStorage.getItem(pendingApkVersionKey)
    const completedPendingUpdate = Boolean(pendingVersion && build >= versionNumber(pendingVersion))
    if (completedPendingUpdate) {
      localStorage.removeItem(pendingApkVersionKey)
      localStorage.removeItem(pendingInstallPermissionKey)
      localStorage.removeItem(downloadedApkPathKey)
      setApkDownloadProgress({ ...emptyApkProgress, state: 'installed', version: info.version })
      setNativeUpdateState('idle')
    }
    if (nativeAndroid) {
      setShowInstalledRelease(completedPendingUpdate && localStorage.getItem(releaseNoticeKey(info.version)) !== '1')
    } else {
      setShowInstalledRelease(localStorage.getItem(releaseNoticeKey(info.version)) !== '1')
    }
    return info
  }

  async function checkNativeUpdate(info?: AppInfo): Promise<UpdateCheckResult> {
    if (!navigator.onLine) return 'offline'
    setCheckingUpdate(true)
    setNativeUpdateState('checking')
    try {
      const installedInfo = info ?? await readInstalledInfo()
      const installedBuild = Number.parseInt(installedInfo.build, 10) || versionNumber(installedInfo.version)
      const release = await fetchLatestRelease(true)
      setAvailableRelease(release)
      if (versionNumber(release.version) <= installedBuild || !isReleaseNewer(release, installedInfo.version)) {
        setNativeUpdateState('idle')
        return 'current'
      }
      if (!await isApkReleaseReady(release)) {
        setNativeUpdateState('publishing')
        return 'publishing'
      }
      setNativeUpdateState('available')
      return 'available'
    } catch {
      setNativeUpdateState('failed')
      return 'error'
    } finally {
      setLastCheckedAt(new Date().toISOString())
      setCheckingUpdate(false)
    }
  }

  async function openInstaller() {
    const result = await ApkUpdater.installDownloaded()
    if (result.status === 'started') {
      localStorage.removeItem(pendingInstallPermissionKey)
      setNativeUpdateState('installing')
    } else if (result.status === 'permission-required') {
      localStorage.setItem(pendingInstallPermissionKey, '1')
      setNativeUpdateState('ready')
    } else {
      localStorage.removeItem(downloadedApkPathKey)
      setNativeUpdateState('available')
    }
  }

  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent) }
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  useEffect(() => {
    if (!nativeAndroid && needRefresh) void fetchLatestRelease().then(setAvailableRelease)
  }, [nativeAndroid, needRefresh])

  useEffect(() => {
    if (!nativeAndroid) return
    let active = true
    let progressHandle: { remove: () => Promise<void> } | undefined
    let resumeHandle: { remove: () => Promise<void> } | undefined

    async function resumeNativeUpdate() {
      const info = await readInstalledInfo()
      if (!active) return
      const pendingVersion = localStorage.getItem(pendingApkVersionKey)
      const installedBuild = Number.parseInt(info.build, 10) || versionNumber(info.version)
      if (pendingVersion && installedBuild >= versionNumber(pendingVersion)) return
      const progress = await ApkUpdater.getDownloadStatus().catch(() => emptyApkProgress)
      if (!active) return
      setProgress(progress.state === 'installing' ? { ...progress, state: 'ready' } : progress)
      if (localStorage.getItem(pendingInstallPermissionKey) === '1' && progress.state === 'ready') {
        const permission = await ApkUpdater.canInstallPackages().catch(() => ({ granted: false }))
        if (permission.granted) {
          localStorage.removeItem(pendingInstallPermissionKey)
          await openInstaller()
          return
        }
      }
      await checkNativeUpdate(info)
      if (progress.state === 'ready' && progress.version === pendingVersion) setProgress(progress)
    }

    void (async () => {
      progressHandle = await ApkUpdater.addListener('progress', progress => { if (active) setProgress(progress) })
      await resumeNativeUpdate()
      resumeHandle = await App.addListener('resume', () => void resumeNativeUpdate())
    })()

    return () => {
      active = false
      void progressHandle?.remove()
      void resumeHandle?.remove()
    }
  // Native update callbacks are intentionally scoped to the Android lifecycle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (nativeAndroid) return checkNativeUpdate()
    if (!navigator.onLine) return 'offline'
    setCheckingUpdate(true)
    try {
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
    if (!nativeAndroid) await updateServiceWorker(true)
  }

  async function downloadUpdate() {
    if (!nativeAndroid || !availableRelease.apkUrl) return
    if (nativeUpdateState === 'ready') return openInstaller()
    if (nativeUpdateState === 'downloading' || nativeUpdateState === 'installing') return
    localStorage.setItem(pendingApkVersionKey, availableRelease.version)
    localStorage.removeItem(pendingInstallPermissionKey)
    try {
      const progress = await ApkUpdater.startDownload({ url: availableRelease.apkUrl, version: availableRelease.version })
      setProgress(progress)
      if (progress.state === 'ready') await openInstaller()
    } catch (reason) {
      setProgress({ ...emptyApkProgress, state: 'failed', version: availableRelease.version, error: reason instanceof Error ? reason.message : 'APK 下载失败' })
    }
  }

  async function cancelUpdateDownload() {
    setProgress(await ApkUpdater.cancelDownload())
    localStorage.removeItem(pendingApkVersionKey)
    localStorage.removeItem(pendingInstallPermissionKey)
  }

  function dismissInstalledRelease() {
    localStorage.setItem(releaseNoticeKey(announcementRelease.version), '1')
    setShowInstalledRelease(false)
  }

  function dismissUpdate() {
    setNeedRefresh(false)
    setDetectedUpdate(false)
    if (nativeAndroid && nativeUpdateState !== 'downloading') setNativeUpdateState('idle')
  }

  const nativeUpdateAvailable = ['available', 'downloading', 'ready', 'installing', 'failed'].includes(nativeUpdateState)
  const updateAvailable = nativeAndroid ? nativeUpdateAvailable : needRefresh || detectedUpdate
  const showNotice = updateAvailable || (!nativeAndroid && offlineReady) || showInstalledRelease
  const nativeActionLabel = nativeUpdateState === 'downloading' ? '取消下载' : nativeUpdateState === 'ready' ? '继续安装' : nativeUpdateState === 'failed' ? '重新下载' : '下载并安装'

  const value: PwaContextValue = {
    installed, installAvailable: Boolean(installPrompt), isIos: /iphone|ipad|ipod/i.test(navigator.userAgent),
    storageSupported: Boolean(navigator.storage?.persist), persisted, nativeAndroid, installedAppVersion,
    installedAppVersionCode, availableRelease, nativeUpdateState, apkDownloadProgress, updateAvailable,
    checkingUpdate, lastCheckedAt, install, requestPersistence, checkForUpdate, applyUpdate, downloadUpdate,
    cancelUpdateDownload,
  }

  return <PwaContext.Provider value={value}>
    {children}
    {showNotice && <aside className="pwa-notice" role="status" aria-live="polite">
      <span className="pwa-notice-icon">{updateAvailable ? <RefreshCw /> : <Check />}</span>
      <div>
        <b>{updateAvailable ? nativeAndroid
          ? nativeUpdateState === 'downloading' ? `正在下载 v${availableRelease.version}` : nativeUpdateState === 'installing' ? '等待系统安装确认' : `新版本 v${availableRelease.version} 可用`
          : `新版本 v${availableRelease.version} 已准备好`
          : showInstalledRelease ? nativeAndroid ? `已安装 v${announcementRelease.version}` : `版本公告 · v${announcementRelease.version}` : '离线使用已准备好'}</b>
        <p>{updateAvailable ? nativeAndroid && apkDownloadProgress.error ? apkDownloadProgress.error : availableRelease.summary : showInstalledRelease ? announcementRelease.summary : '网络不稳定时，仍可打开刻度并查看本机数据。'}</p>
        {nativeAndroid && nativeUpdateState === 'downloading' && <progress className="apk-progress" max={100} value={apkDownloadProgress.percent ?? undefined} />}
      </div>
      {!nativeAndroid && needRefresh && <button className="pwa-update" onClick={() => void applyUpdate()}>立即更新</button>}
      {nativeAndroid && nativeUpdateAvailable && nativeUpdateState !== 'installing' && <button className="pwa-update" onClick={() => void (nativeUpdateState === 'downloading' ? cancelUpdateDownload() : downloadUpdate())}>{nativeActionLabel}</button>}
      <button className="pwa-dismiss" aria-label={!nativeAndroid && needRefresh ? '稍后更新' : updateAvailable ? '知道了' : showInstalledRelease ? '知道了' : '关闭提示'} onClick={() => {
        if (!nativeAndroid && needRefresh) setNeedRefresh(false)
        else if (updateAvailable) dismissUpdate()
        else if (showInstalledRelease) dismissInstalledRelease()
        else setOfflineReady(false)
      }}>{!nativeAndroid && needRefresh ? '稍后' : updateAvailable ? '知道了' : showInstalledRelease ? '知道了' : <X />}</button>
    </aside>}
  </PwaContext.Provider>
}
