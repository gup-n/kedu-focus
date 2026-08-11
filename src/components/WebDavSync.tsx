import { useMemo, useState } from 'react'
import { CheckCircle2, CloudDownload, CloudUpload, Eye, EyeOff, Link2, RefreshCw, ShieldAlert } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { downloadBackup, getBackupPreview } from '../utils/backup'
import {
  createWebDavMeta,
  downloadWebDav,
  inspectWebDav,
  loadWebDavConfig,
  loadWebDavMeta,
  saveWebDavConfig,
  saveWebDavMeta,
  stateFingerprint,
  uploadWebDav,
  webDavTarget,
  type WebDavConfig,
  type WebDavRemote,
} from '../utils/webdav'

type Activity = 'idle' | 'testing' | 'syncing' | 'uploading' | 'downloading'

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : 'WebDAV 操作失败，请稍后重试。'
}

export function WebDavSync() {
  const { rawState, dispatch } = useApp()
  const [config, setConfig] = useState<WebDavConfig>(loadWebDavConfig)
  const [activity, setActivity] = useState<Activity>('idle')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [remote, setRemote] = useState<WebDavRemote | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const activeTimer = rawState.timer.status === 'running' || rawState.timer.status === 'paused'
  const preview = remote ? getBackupPreview(remote.envelope) : null
  const target = useMemo(() => {
    try { return webDavTarget(config) } catch { return '' }
  }, [config])
  const meta = target ? loadWebDavMeta(target) : undefined

  function update<K extends keyof WebDavConfig>(key: K, value: WebDavConfig[K]) {
    setConfig(current => ({ ...current, [key]: value }))
    setNotice('')
    setError('')
    setRemote(null)
  }

  function persistConfig() {
    webDavTarget(config)
    saveWebDavConfig(config)
  }

  function rememberSync(local = rawState, cloud = local, etag?: string) {
    saveWebDavMeta(createWebDavMeta(config, local, cloud, etag))
  }

  async function testConnection() {
    setActivity('testing'); setError(''); setNotice(''); setRemote(null)
    try {
      persistConfig()
      const result = await inspectWebDav(config)
      setNotice(result.exists ? '连接成功，已找到远端刻度备份。' : '连接成功，远端目录中还没有刻度备份。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setActivity('idle') }
  }

  async function writeLocal(etag?: string | null) {
    const uploaded = await uploadWebDav(config, rawState, etag)
    rememberSync(rawState, rawState, uploaded.etag)
    setRemote(null)
    setNotice('本机数据已上传，云端刻度与当前设备一致。')
  }

  async function syncNow() {
    if (activeTimer) { setError('请先结束或重置当前计时，再进行数据同步。'); return }
    setActivity('syncing'); setError(''); setNotice(''); setRemote(null)
    try {
      persistConfig()
      const cloud = await downloadWebDav(config)
      if (!cloud) {
        await writeLocal(null)
        setNotice('首次同步完成：已在云端创建刻度备份。')
        return
      }
      const localFingerprint = stateFingerprint(rawState)
      const remoteFingerprint = stateFingerprint(cloud.envelope.data)
      const previous = loadWebDavMeta(webDavTarget(config))
      if (localFingerprint === remoteFingerprint) {
        rememberSync(rawState, cloud.envelope.data, cloud.etag)
        setNotice('本机与云端已经一致，无需传输。')
      } else if (previous && localFingerprint !== previous.localFingerprint && remoteFingerprint === previous.remoteFingerprint) {
        await writeLocal(cloud.etag)
      } else {
        setRemote(cloud)
        setNotice(previous ? '检测到云端有不同内容，请选择要保留的版本。' : '这是此设备首次连接该备份，请选择要保留的版本。')
      }
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setActivity('idle') }
  }

  async function uploadLocal() {
    if (activeTimer) { setError('请先结束或重置当前计时，再上传数据。'); return }
    setActivity('uploading'); setError(''); setNotice(''); setRemote(null)
    try {
      persistConfig()
      const cloud = await downloadWebDav(config)
      if (cloud && stateFingerprint(cloud.envelope.data) !== stateFingerprint(rawState)) {
        setRemote(cloud)
        setNotice('云端已有不同数据。确认版本后才能覆盖，避免误删另一台设备的记录。')
        return
      }
      await writeLocal(cloud?.etag ?? null)
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setActivity('idle') }
  }

  async function pullRemote() {
    if (activeTimer) { setError('请先结束或重置当前计时，再拉取数据。'); return }
    setActivity('downloading'); setError(''); setNotice(''); setRemote(null)
    try {
      persistConfig()
      const cloud = await downloadWebDav(config)
      if (!cloud) { setError('远端还没有刻度备份，请先上传本机数据。'); return }
      if (stateFingerprint(cloud.envelope.data) === stateFingerprint(rawState)) {
        rememberSync(rawState, cloud.envelope.data, cloud.etag)
        setNotice('本机与云端已经一致，无需拉取。')
        return
      }
      setRemote(cloud)
      setNotice('已读取远端备份，请确认是否替换本机数据。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setActivity('idle') }
  }

  async function chooseLocal() {
    if (!remote || !window.confirm('使用本机版本会覆盖当前云端备份。另一台设备尚未上传的内容可能丢失，确定继续吗？')) return
    setActivity('uploading'); setError('')
    try { await writeLocal(remote.etag) }
    catch (reason) { setError(errorMessage(reason)) }
    finally { setActivity('idle') }
  }

  async function chooseRemote() {
    if (!remote || !window.confirm('使用云端版本会替换此设备的数据。系统会先导出一份本机备份，确定继续吗？')) return
    setActivity('downloading'); setError('')
    try {
      const result = await downloadBackup(rawState, '刻度_WebDAV拉取前备份')
      if (result === 'cancelled') { setNotice('已取消拉取，本机数据没有变化。'); return }
      dispatch({ type: 'HYDRATE', state: remote.envelope.data })
      rememberSync(remote.envelope.data, remote.envelope.data, remote.etag)
      setRemote(null)
      setNotice('云端数据已恢复到本机，替换前备份也已保存。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setActivity('idle') }
  }

  const busy = activity !== 'idle'
  return <div className="webdav-sync">
    <div className="sync-track" aria-label="WebDAV 同步状态">
      <div><span>本机</span><b>{rawState.tasks.filter(task => !task.deletedAt).length} 个任务</b></div>
      <div className={busy ? 'moving' : meta ? 'linked' : ''}><i/><Link2/><i/></div>
      <div><span>WebDAV</span><b>{meta ? `上次同步 ${new Date(meta.lastSyncedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '尚未同步'}</b></div>
    </div>

    <div className="webdav-fields">
      <label>服务器目录地址<input aria-label="WebDAV 服务器目录地址" inputMode="url" value={config.serverUrl} onChange={event => update('serverUrl', event.target.value)} placeholder="https://dav.example.com/remote.php/dav/files/用户名/"/></label>
      <label>远端文件名<input aria-label="WebDAV 远端文件名" value={config.filename} onChange={event => update('filename', event.target.value)} /></label>
      <label>用户名<input aria-label="WebDAV 用户名" autoComplete="username" value={config.username} onChange={event => update('username', event.target.value)} /></label>
      <label>密码<span className="password-field"><input aria-label="WebDAV 密码" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={config.password} onChange={event => update('password', event.target.value)} /><button type="button" aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff/> : <Eye/>}</button></span></label>
    </div>

    <div className="webdav-help"><ShieldAlert/><p>凭据只保存在当前浏览器，不会进入 JSON 备份。服务器必须允许网页跨域访问；公开网络建议只使用 HTTPS。</p></div>
    {activeTimer && <p className="webdav-warning" role="status">计时进行中：为避免两台设备重复记录，结束或重置计时后才能同步。</p>}
    {notice && <p className="data-notice" role="status"><CheckCircle2/> {notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}

    <div className="webdav-actions">
      <button type="button" className="btn quiet" disabled={busy} onClick={() => void testConnection()}><Link2/> {activity === 'testing' ? '正在测试…' : '测试连接'}</button>
      <button type="button" className="btn primary" disabled={busy || activeTimer} onClick={() => void syncNow()}><RefreshCw/> {activity === 'syncing' ? '正在同步…' : '立即同步'}</button>
      <button type="button" className="btn quiet" disabled={busy || activeTimer} onClick={() => void pullRemote()}><CloudDownload/> 拉取云端</button>
      <button type="button" className="btn quiet" disabled={busy || activeTimer} onClick={() => void uploadLocal()}><CloudUpload/> 上传本机</button>
    </div>

    {remote && preview && <section className="sync-conflict" aria-label="选择同步版本">
      <header><ShieldAlert/><div><b>两端数据不同</b><p>云端备份导出于 {new Date(preview.exportedAt).toLocaleString('zh-CN')}</p></div></header>
      <div className="sync-compare">
        <div><small>当前本机</small><b>{rawState.tasks.filter(task => !task.deletedAt).length} 任务 · {rawState.sessions.filter(session => !session.deletedAt).length} 专注</b></div>
        <div><small>WebDAV 云端</small><b>{preview.tasks} 任务 · {preview.sessions} 专注</b></div>
      </div>
      <p>系统不会自动覆盖。使用云端前会先下载一份本机 JSON 备份；使用本机时会通过版本标记检查云端是否又被修改。</p>
      <div className="webdav-actions"><button type="button" className="btn quiet" disabled={busy} onClick={() => setRemote(null)}>稍后处理</button><button type="button" className="btn quiet" disabled={busy} onClick={() => void chooseRemote()}><CloudDownload/> 使用云端</button><button type="button" className="btn primary" disabled={busy} onClick={() => void chooseLocal()}><CloudUpload/> 使用本机</button></div>
    </section>}
  </div>
}
