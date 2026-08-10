import { useState } from 'react'
import { Download, HardDrive, ShieldCheck, Smartphone } from 'lucide-react'
import { usePwa } from './PwaState'

export function PwaSettings() {
  const { installed, installAvailable, install, isIos, storageSupported, persisted, requestPersistence } = usePwa()
  const [message, setMessage] = useState('')

  async function handleInstall() {
    const accepted = await install()
    setMessage(accepted ? '已接受安装，刻度会出现在你的应用列表中。' : '这次没有安装，之后仍可从浏览器菜单安装。')
  }

  async function handlePersistence() {
    const granted = await requestPersistence()
    setMessage(granted ? '浏览器已优先保留刻度的本机数据。' : '浏览器暂未授予持久存储，请继续定期导出 JSON 备份。')
  }

  const installHint = installed
    ? '已作为应用运行。更新仍由网页发布，发现新版后会先询问你。'
    : isIos
      ? '在 Safari 中点“分享”，再选择“添加到主屏幕”。'
      : installAvailable
        ? '安装后可从桌面或安卓主屏幕打开，数据仍保存在此浏览器中。'
        : '使用 Chrome 或 Edge 的“安装应用 / 添加到主屏幕”菜单即可安装。'

  return <section className="card pwa-settings">
    <div className="card-head"><h2>安装与本机保护</h2><span className="pwa-badge">PWA 网页应用</span></div>
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
    {message && <p className="pwa-message" role="status">{message}</p>}
  </section>
}
