import { useMemo, useState } from 'react'
import { ArchiveRestore, ArrowLeftRight, CheckCircle2, CloudDownload, CloudUpload, Download, Eye, EyeOff, Link2, Merge, RefreshCw, ShieldAlert } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { downloadBackup, type ConflictChoice } from '../utils/backup'
import { exportFile } from '../utils/fileExport'
import { applySyncChoices, buildSyncPlan, syncCollectionLabels, syncDifferenceCounts, type SyncDifference, type SyncPlan } from '../utils/syncPlan'
import {
  createWebDavMeta,
  downloadWebDavHistory,
  downloadWebDav,
  inspectWebDav,
  loadWebDavConfig,
  loadWebDavMeta,
  listWebDavHistory,
  saveWebDavConfig,
  saveWebDavMeta,
  stateFingerprint,
  uploadWebDav,
  webDavTarget,
  type WebDavConfig,
  type WebDavHistoryVersion,
  type WebDavRemote,
} from '../utils/webdav'

type Activity = 'idle' | 'testing' | 'reading' | 'writing'
type Intent = 'sync' | 'upload' | 'download' | 'history'

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : 'WebDAV 操作失败，请稍后重试。'
}

function activeCount<T extends { deletedAt?: string }>(items: T[]) {
  return items.filter(item => !item.deletedAt).length
}

function differenceSummary(item: SyncDifference, side: 'local' | 'remote') {
  const entity = side === 'local' ? item.local : item.remote
  if (!entity) return side === 'local' ? '本机没有这条记录' : '云端没有这条记录'
  const record = entity as unknown as Record<string, unknown>
  const parts = [
    record.title && `标题：${record.title}`,
    record.date && `日期：${record.date}`,
    record.plannedDate && `计划：${record.plannedDate}`,
    record.startedAt && `开始：${String(record.startedAt).replace('T', ' ').slice(0, 16)}`,
    record.summary && `收获：${record.summary}`,
    record.improvement && `改进：${record.improvement}`,
    record.tomorrow && `计划：${record.tomorrow}`,
  ].filter(Boolean)
  return parts.slice(0, 3).join(' · ') || (record.deletedAt ? '已删除墓碑' : '记录内容不同')
}

export function WebDavSync() {
  const { rawState, dispatch } = useApp()
  const [config, setConfig] = useState<WebDavConfig>(loadWebDavConfig)
  const [activity, setActivity] = useState<Activity>('idle')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [remote, setRemote] = useState<WebDavRemote | null>(null)
  const [plan, setPlan] = useState<SyncPlan | null>(null)
  const [intent, setIntent] = useState<Intent>('sync')
  const [firstUpload, setFirstUpload] = useState(false)
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({})
  const [showPassword, setShowPassword] = useState(false)
  const [historyVersions, setHistoryVersions] = useState<WebDavHistoryVersion[] | null>(null)
  const [selectedHistory, setSelectedHistory] = useState<WebDavHistoryVersion | null>(null)
  const activeTimer = rawState.timer.status === 'running' || rawState.timer.status === 'paused'
  const target = useMemo(() => {
    try { return webDavTarget(config) } catch { return '' }
  }, [config])
  const meta = target ? loadWebDavMeta(target) : undefined
  const counts = plan ? syncDifferenceCounts(plan) : null
  const changed = plan?.differences.filter(item => item.kind === 'changed') ?? []
  const resolved = changed.filter(item => choices[item.key]).length

  function resetPreview() {
    setRemote(null)
    setPlan(null)
    setFirstUpload(false)
    setChoices({})
    setSelectedHistory(null)
  }

  function update<K extends keyof WebDavConfig>(key: K, value: WebDavConfig[K]) {
    setConfig(current => ({ ...current, [key]: value }))
    setNotice(''); setError(''); resetPreview()
  }

  function persistConfig() {
    webDavTarget(config)
    saveWebDavConfig(config)
  }

  function rememberSync(local: typeof rawState, cloud: typeof rawState, etag?: string) {
    saveWebDavMeta(createWebDavMeta(config, local, cloud, etag))
  }

  async function testConnection() {
    setActivity('testing'); setError(''); setNotice(''); resetPreview()
    try {
      persistConfig()
      const result = await inspectWebDav(config)
      setNotice(result.exists ? '连接成功，已找到远端刻度备份。' : '连接成功，远端还没有刻度备份。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setActivity('idle') }
  }

  async function loadHistory() {
    if (activeTimer) { setError('请先结束或重置当前计时，再查看云端历史版本。'); return }
    setActivity('reading'); setError(''); setNotice(''); resetPreview()
    try {
      persistConfig()
      const versions = await listWebDavHistory(config)
      setHistoryVersions(versions)
      setNotice(versions.length ? `已找到 ${versions.length} 个只读历史版本。` : '云端还没有历史版本；第二次上传后才会产生第一份归档。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setActivity('idle') }
  }

  async function inspectHistory(version: WebDavHistoryVersion) {
    if (activeTimer) { setError('请先结束或重置当前计时，再检查历史版本。'); return }
    setActivity('reading'); setError(''); setNotice(''); resetPreview()
    try {
      const snapshot = await downloadWebDavHistory(config, version)
      setSelectedHistory(version)
      setRemote(snapshot)
      setPlan(buildSyncPlan(rawState, snapshot.envelope.data))
      setIntent('history')
      setNotice('历史快照已读取。请先检查差异，再决定下载、合并或恢复本机。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setActivity('idle') }
  }

  async function previewSync(nextIntent: Intent) {
    if (activeTimer) { setError('请先结束或重置当前计时，再进行数据同步。'); return }
    setActivity('reading'); setError(''); setNotice(''); resetPreview(); setIntent(nextIntent)
    try {
      persistConfig()
      const cloud = await downloadWebDav(config)
      if (!cloud) {
        if (nextIntent === 'download') { setError('远端还没有刻度备份，无法拉取。'); return }
        setFirstUpload(true)
        setNotice('远端是空的。确认后才会创建第一份云端备份。')
        return
      }
      if (stateFingerprint(cloud.envelope.data) === stateFingerprint(rawState)) {
        rememberSync(rawState, cloud.envelope.data, cloud.etag)
        setNotice('本机与云端已经一致，没有需要同步的内容。')
        return
      }
      setRemote(cloud)
      setPlan(buildSyncPlan(rawState, cloud.envelope.data))
      setNotice('已读取两端数据。请检查具体差异，再选择同步方式。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setActivity('idle') }
  }

  async function createFirstBackup() {
    if (!firstUpload || !window.confirm('远端目前为空。确定上传本机全部数据并创建第一份云端备份吗？')) return
    setActivity('writing'); setError('')
    try {
      const uploaded = await uploadWebDav(config, rawState, null)
      rememberSync(rawState, rawState, uploaded.etag)
      resetPreview()
      setNotice('首份云端备份已创建。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setActivity('idle') }
  }

  async function mergeBoth() {
    if (!plan || !remote) return
    let merged
    try { merged = applySyncChoices(plan, choices) }
    catch (reason) { setError(errorMessage(reason)); return }
    if (!window.confirm('安全合并会保留两端独有记录，并按你的选择解决内容冲突。系统会先导出本机备份，再更新本机和云端。确定继续吗？')) return
    setActivity('writing'); setError('')
    try {
      const backup = await downloadBackup(rawState, '刻度_WebDAV合并前备份')
      if (backup === 'cancelled') { setNotice('已取消合并，两端数据没有变化。'); return }
      const uploaded = await uploadWebDav(config, merged, remote.etag)
      dispatch({ type: 'HYDRATE', state: merged })
      rememberSync(merged, merged, uploaded.etag)
      resetPreview()
      setNotice(uploaded.archivedVersion ? `安全合并完成；服务器已归档旧版本 ${uploaded.archivedVersion}。` : '安全合并完成，本机与云端已经一致。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setActivity('idle') }
  }

  async function overwriteRemote() {
    if (!remote || !window.confirm('这会用本机整份数据覆盖云端。云端独有记录不会进入本机，但服务器会归档旧版本。确定继续吗？')) return
    setActivity('writing'); setError('')
    try {
      const uploaded = await uploadWebDav(config, rawState, remote.etag)
      rememberSync(rawState, rawState, uploaded.etag)
      resetPreview()
      setNotice(uploaded.archivedVersion ? `云端已覆盖；旧版本已归档为 ${uploaded.archivedVersion}。` : '云端已用本机版本覆盖。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setActivity('idle') }
  }

  async function overwriteLocal() {
    if (!remote || !window.confirm('这会用云端整份数据替换本机。系统会先导出本机 JSON 备份。确定继续吗？')) return
    setActivity('writing'); setError('')
    try {
      const backup = await downloadBackup(rawState, '刻度_WebDAV拉取前备份')
      if (backup === 'cancelled') { setNotice('已取消拉取，本机数据没有变化。'); return }
      dispatch({ type: 'HYDRATE', state: remote.envelope.data })
      rememberSync(remote.envelope.data, remote.envelope.data, remote.etag)
      resetPreview()
      setNotice('云端数据已恢复到本机，替换前备份已保存。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setActivity('idle') }
  }

  async function exportHistorySnapshot() {
    if (!remote || !selectedHistory) return
    setActivity('writing'); setError('')
    try {
      const date = selectedHistory.archivedAt.slice(0, 10)
      const result = await exportFile(
        [JSON.stringify(remote.envelope, null, 2)],
        `刻度_云端历史_${date}_${selectedHistory.id.slice(-15, -5)}.json`,
        'application/json;charset=utf-8',
      )
      setNotice(result === 'cancelled' ? '已取消下载，当前数据没有变化。' : result === 'shared' ? '历史版本已交给系统分享。' : '历史版本 JSON 已保存。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setActivity('idle') }
  }

  async function mergeHistoryIntoLocal() {
    if (!plan || !remote || !selectedHistory) return
    let merged
    try { merged = applySyncChoices(plan, choices) }
    catch (reason) { setError(errorMessage(reason)); return }
    if (!window.confirm('这会把所选历史版本安全合并到本机，不修改云端活动文件。系统会先导出当前本机备份。确定继续吗？')) return
    setActivity('writing'); setError('')
    try {
      const backup = await downloadBackup(rawState, '刻度_恢复历史前备份')
      if (backup === 'cancelled') { setNotice('已取消恢复，本机和云端都没有变化。'); return }
      dispatch({ type: 'HYDRATE', state: merged })
      resetPreview()
      setNotice('历史版本已安全合并到本机；云端活动文件没有改变。完成检查后可再手动同步。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setActivity('idle') }
  }

  async function replaceLocalWithHistory() {
    if (!remote || !selectedHistory || !window.confirm('这会用所选历史版本整份替换本机数据，但不会修改云端活动文件。系统会先导出当前本机备份。确定继续吗？')) return
    setActivity('writing'); setError('')
    try {
      const backup = await downloadBackup(rawState, '刻度_恢复历史前备份')
      if (backup === 'cancelled') { setNotice('已取消恢复，本机和云端都没有变化。'); return }
      dispatch({ type: 'HYDRATE', state: remote.envelope.data })
      resetPreview()
      setNotice('本机已恢复到所选历史版本；云端活动文件没有改变。检查无误后再决定是否同步。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setActivity('idle') }
  }

  function formatSize(bytes: number) {
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
  }

  const busy = activity !== 'idle'
  return <div className="webdav-sync">
    <div className="sync-track" aria-label="WebDAV 同步状态">
      <div><span>本机</span><b>{activeCount(rawState.tasks)} 个任务</b></div>
      <div className={busy ? 'moving' : meta ? 'linked' : ''}><i/><Link2/><i/></div>
      <div><span>WebDAV</span><b>{meta ? `上次同步 ${new Date(meta.lastSyncedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '尚未同步'}</b></div>
    </div>

    <div className="webdav-fields">
      <label>服务器目录地址<input aria-label="WebDAV 服务器目录地址" inputMode="url" value={config.serverUrl} onChange={event => update('serverUrl', event.target.value)} placeholder="https://192.168.1.20:8443/"/></label>
      <label>远端文件名<input aria-label="WebDAV 远端文件名" value={config.filename} onChange={event => update('filename', event.target.value)}/></label>
      <label>用户名<input aria-label="WebDAV 用户名" autoComplete="username" value={config.username} onChange={event => update('username', event.target.value)}/></label>
      <label>密码<span className="password-field"><input aria-label="WebDAV 密码" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={config.password} onChange={event => update('password', event.target.value)}/><button type="button" aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff/> : <Eye/>}</button></span></label>
    </div>

    <div className="webdav-help"><ShieldAlert/><p>所有同步操作都会先读取并展示差异。安全合并保留两端独有记录；覆盖操作必须再次确认。</p></div>
    {activeTimer && <p className="webdav-warning" role="status">计时进行中：结束或重置计时后才能同步。</p>}
    {notice && <p className="data-notice" role="status"><CheckCircle2/> {notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}

    <section className="sync-history" aria-labelledby="sync-history-title">
      <header><span><ArchiveRestore/></span><div><b id="sync-history-title">云端历史版本</b><p>服务器覆盖前留下的只读快照。选择一个版本后，可先比较再恢复。</p></div><button type="button" className="btn quiet" disabled={busy || activeTimer || !target} onClick={() => void loadHistory()}>{activity === 'reading' ? '正在读取…' : historyVersions ? '刷新历史' : '查看历史'}</button></header>
      {historyVersions && (historyVersions.length ? <ol className="history-ruler">
        {historyVersions.map((version, index) => <li key={version.id} className={selectedHistory?.id === version.id ? 'selected' : ''}>
          <i>{index === 0 ? '新' : ''}</i>
          <button type="button" disabled={busy} onClick={() => void inspectHistory(version)}>
            <span><b>{new Date(version.archivedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</b><small>备份生成于 {new Date(version.exportedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {formatSize(version.sizeBytes)}</small></span>
            <em>{version.counts.tasks} 任务 · {version.counts.sessions} 专注 · {version.counts.reviews} 复盘 · {version.counts.sleep} 睡眠</em>
            <strong>比较</strong>
          </button>
        </li>)}
      </ol> : <div className="history-empty"><ArchiveRestore/><p>还没有历史版本。首次上传创建活动文件，下一次上传时才会归档旧版本。</p></div>)}
    </section>

    <div className="webdav-actions">
      <button type="button" className="btn quiet" disabled={busy} onClick={() => void testConnection()}><Link2/> {activity === 'testing' ? '正在测试…' : '测试连接'}</button>
      <button type="button" className="btn primary" disabled={busy || activeTimer} onClick={() => void previewSync('sync')}><RefreshCw/> {activity === 'reading' ? '正在读取两端…' : '检查并同步'}</button>
      <button type="button" className="btn quiet" disabled={busy || activeTimer} onClick={() => void previewSync('download')}><CloudDownload/> 检查云端下载</button>
      <button type="button" className="btn quiet" disabled={busy || activeTimer} onClick={() => void previewSync('upload')}><CloudUpload/> 检查云端上传</button>
    </div>

    {firstUpload && <section className="sync-conflict first-upload" aria-label="确认首次上传">
      <header><CloudUpload/><div><b>创建第一份云端备份</b><p>将上传 {activeCount(rawState.tasks)} 个任务、{activeCount(rawState.sessions)} 条专注、{rawState.reviews.length} 条复盘和 {rawState.sleep.length} 条睡眠。</p></div></header>
      <div className="webdav-actions"><button className="btn quiet" onClick={resetPreview}>取消</button><button className="btn primary" disabled={busy} onClick={() => void createFirstBackup()}>确认首次上传</button></div>
    </section>}

    {plan && remote && counts && <section className="sync-conflict sync-ledger" aria-label="同步差异预览">
      <header><ArrowLeftRight/><div><b>{intent === 'history' ? '历史版本差异账本' : '同步差异账本'}</b><p>云端快照：{new Date(remote.envelope.exportedAt).toLocaleString('zh-CN')} · 当前操作：{intent === 'upload' ? '上传检查' : intent === 'download' ? '下载检查' : intent === 'history' ? '只读历史恢复' : '双向检查'}</p></div></header>
      <div className="sync-difference-counts"><span><b>{counts['local-only']}</b>仅本机</span><span><b>{counts['remote-only']}</b>仅云端</span><span><b>{counts.changed}</b>内容冲突</span></div>
      {plan.settingsDiffer && <p className="webdav-warning">两端计时设置不同。安全合并保留本机设置；整份覆盖则采用被选择的一端。</p>}
      <div className="sync-difference-list">{plan.differences.map(item => <article key={item.key} className={`difference-${item.kind}`}>
        <div className="sync-difference-heading"><small>{syncCollectionLabels[item.collection]}</small><b>{item.label}</b><em>{item.kind === 'local-only' ? '仅本机' : item.kind === 'remote-only' ? '仅云端' : '需要选择'}</em></div>
        <div className="sync-version-pair"><section><span>本机</span><p>{differenceSummary(item, 'local')}</p></section><section><span>云端</span><p>{differenceSummary(item, 'remote')}</p></section></div>
        {item.kind === 'changed' && <div className="sync-choice"><button className={choices[item.key] === 'local' ? 'selected' : ''} onClick={() => setChoices(current => ({ ...current, [item.key]: 'local' }))}>合并时保留本机</button><button className={choices[item.key] === 'imported' ? 'selected' : ''} onClick={() => setChoices(current => ({ ...current, [item.key]: 'imported' }))}>合并时使用云端</button></div>}
      </article>)}</div>
      <p className="sync-merge-note"><Merge/> {intent === 'history' ? '历史恢复只修改本机，不会覆盖云端活动文件。' : '安全合并会自动保留“仅本机”和“仅云端”的记录；'}{changed.length ? `还需选择 ${changed.length - resolved} 条冲突。` : '没有内容冲突，可以直接合并。'}</p>
      {intent === 'history' ? <div className="webdav-actions sync-final-actions"><button className="btn quiet" disabled={busy} onClick={resetPreview}>取消</button><button className="btn quiet" disabled={busy} onClick={() => void exportHistorySnapshot()}><Download/> 下载 JSON</button><button className="btn quiet" disabled={busy} onClick={() => void replaceLocalWithHistory()}><ArchiveRestore/> 整份恢复本机</button><button className="btn primary" disabled={busy || resolved !== changed.length} onClick={() => void mergeHistoryIntoLocal()}><Merge/> 安全合并到本机</button></div> : <div className="webdav-actions sync-final-actions"><button className="btn quiet" disabled={busy} onClick={resetPreview}>取消</button><button className="btn quiet" disabled={busy} onClick={() => void overwriteLocal()}><CloudDownload/> 云端覆盖本机</button><button className="btn quiet" disabled={busy} onClick={() => void overwriteRemote()}><CloudUpload/> 本机覆盖云端</button><button className="btn primary" disabled={busy || resolved !== changed.length} onClick={() => void mergeBoth()}><Merge/> 安全合并两端</button></div>}
    </section>}
  </div>
}
