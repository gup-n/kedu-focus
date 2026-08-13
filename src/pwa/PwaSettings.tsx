import { useEffect, useState } from 'react'
import { Check, Download, HardDrive, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react'
import { usePwa } from './PwaState'
import { currentRelease, fetchLatestRelease, releases, type ReleaseNote } from './releases'

export function PwaSettings() {
  const { installed, installAvailable, install, isIos, storageSupported, persisted, updateAvailable, checkingUpdate, lastCheckedAt, requestPersistence, checkForUpdate, applyUpdate } = usePwa()
  const [message, setMessage] = useState('')
  const [availableRelease, setAvailableRelease] = useState<ReleaseNote>(currentRelease)
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    if (updateAvailable) void fetchLatestRelease().then(setAvailableRelease)
  }, [updateAvailable])

  async function handleInstall() {
    const accepted = await install()
    setMessage(accepted ? '已接受安装，刻度会出现在你的应用列表中。' : '这次没有安装，之后仍可从浏览器菜单安装。')
  }

  async function handlePersistence() {
    const granted = await requestPersistence()
    setMessage(granted ? '浏览器已优先保留刻度的本机数据。' : '浏览器暂未授予持久存储，请继续定期导出 JSON 备份。')
  }

  async function handleUpdate() {
    if (updateAvailable) {
      setMessage('正在应用新版本，页面即将重新打开。')
      await applyUpdate()
      return
    }
    const result = await checkForUpdate()
    if (result === 'available') setAvailableRelease(await fetchLatestRelease())
    setMessage({
      available: '发现新版本，点击“立即更新”即可应用。',
      current: '当前已是最新版本。',
      offline: '当前处于离线状态，联网后再检查更新。',
      unsupported: '当前环境无法主动检查更新，请使用已安装的 PWA 或刷新网页。',
      error: '检查更新失败，请确认网络正常后重试。',
    }[result])
  }

  const installHint = installed
    ? '已作为应用运行。更新仍由网页发布，发现新版后会先询问你。'
    : isIos
      ? '在 Safari 中点“分享”，再选择“添加到主屏幕”。'
      : installAvailable
        ? '安装后可从桌面或安卓主屏幕打开，数据仍保存在此浏览器中。'
        : '使用 Chrome 或 Edge 的“安装应用 / 添加到主屏幕”菜单即可安装。'

  return <section className="card pwa-settings">
    <div className="card-head"><h2>应用与本机保护</h2><span className="pwa-badge">PWA 网页应用</span></div>
    <div className="pwa-setting-row">
      <span className="pwa-setting-icon"><Smartphone /></span>
      <div><b>{installed ? '刻度已安装' : '把刻度放到桌面'}</b><p>{installHint}</p></div>
      {!installed && installAvailable && <button className="btn primary" onClick={() => void handleInstall()}><Download /> 安装应用</button>}
    </div>
    <div className="pwa-setting-row">
      <span className="pwa-setting-icon"><HardDrive /></span>
      <div><b>{persisted ? '本机数据已受优先保护' : '降低浏览器自动清理风险'}</b><p>{persisted ? '浏览器已授予持久存储；手动清除站点数据仍会删除记录。' : '申请持久存储后，浏览器会尽量避免自动回收这些数据。'}</p></div>
      {storageSupported && !persisted && <button className="btn quiet" onClick={() => void handlePersistence()}><ShieldCheck /> 请求保护</button>}
    </div>
    <div className="pwa-setting-row">
      <span className="pwa-setting-icon"><RefreshCw /></span>
      <div><b>{updateAvailable ? '发现可用的新版本' : '检查应用更新'}</b><p>{updateAvailable ? '新版本已下载完成，由你决定何时重新打开应用。' : lastCheckedAt ? `上次检查：${new Date(lastCheckedAt).toLocaleString('zh-CN')}` : '主动查询最新版本，减少浏览器缓存造成的更新延迟。'}</p></div>
      <button className={`btn ${updateAvailable ? 'primary' : 'quiet'}`} disabled={checkingUpdate} onClick={() => void handleUpdate()}><RefreshCw className={checkingUpdate ? 'checking-update' : ''}/> {checkingUpdate ? '正在检查…' : updateAvailable ? '立即更新' : '检查更新'}</button>
    </div>
    {updateAvailable && <div className="available-release" aria-label="本次更新内容">
      <span>v{availableRelease.version}</span>
      <div><b>{availableRelease.title}</b><p>{availableRelease.summary}</p><ul>{availableRelease.changes.map(change=><li key={change}>{change}</li>)}</ul></div>
    </div>}
    {message && <p className="pwa-message" role="status">{message}</p>}
    <div className="release-history-head">
      <div><b>更新历史</b><p>当前版本 v{currentRelease.version} · 每次发布都留下清晰的变化记录。</p></div>
      <button className="text-btn" aria-expanded={historyOpen} onClick={()=>setHistoryOpen(value=>!value)}>{historyOpen?'收起历史':'查看历史'}</button>
    </div>
    {historyOpen&&<ol className="release-ruler">
      {releases.map((release,index)=><li key={release.version}>
        <span className="release-dot">{index===0?<Check/>:null}</span>
        <div className="release-meta"><b>v{release.version}</b><time dateTime={release.date}>{release.date}</time></div>
        <div className="release-copy"><h3>{release.title}</h3><p>{release.summary}</p><ul>{release.changes.map(change=><li key={change}>{change}</li>)}</ul></div>
      </li>)}
    </ol>}
  </section>
}
