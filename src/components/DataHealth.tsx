import { useEffect, useMemo, useState } from 'react'
import { Archive, CheckCircle2, Cloud, Database, HardDrive, ShieldCheck } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { BACKUP_ACTIVITY_EVENT, calculateDataHealth, formatDataSize, readBackupActivity, type BackupActivity } from '../utils/dataHealth'
import { loadWebDavConfig, loadWebDavMeta, webDavTarget, WEBDAV_META_EVENT, type WebDavSyncMeta } from '../utils/webdav'

function localTime(value?: string) {
  if (!value) return '暂无记录'
  return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function currentSyncMeta() {
  try {
    const target = webDavTarget(loadWebDavConfig())
    return loadWebDavMeta(target)
  } catch { return undefined }
}

export function DataHealth() {
  const { rawState } = useApp()
  const health = useMemo(() => calculateDataHealth(rawState), [rawState])
  const [backup, setBackup] = useState<BackupActivity | undefined>(readBackupActivity)
  const [storageUsage, setStorageUsage] = useState<number>()
  const [storageQuota, setStorageQuota] = useState<number>()
  const [syncMeta, setSyncMeta] = useState<WebDavSyncMeta | undefined>(currentSyncMeta)

  useEffect(() => {
    const update = () => setBackup(readBackupActivity())
    window.addEventListener(BACKUP_ACTIVITY_EVENT, update)
    return () => window.removeEventListener(BACKUP_ACTIVITY_EVENT, update)
  }, [])

  useEffect(() => {
    const update = () => setSyncMeta(currentSyncMeta())
    window.addEventListener(WEBDAV_META_EVENT, update)
    return () => window.removeEventListener(WEBDAV_META_EVENT, update)
  }, [])

  useEffect(() => {
    let cancelled = false
    const estimate = navigator.storage?.estimate?.()
    if (!estimate) return () => { cancelled = true }
    void estimate.then(result => {
      if (cancelled) return
      setStorageUsage(result.usage)
      setStorageQuota(result.quota)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [rawState])

  const rulerTotal = Math.max(health.activeRecords + health.tombstones, 1)
  const activeWidth = health.activeRecords / rulerTotal * 100
  const recentWidth = health.recentTombstones / rulerTotal * 100
  const matureWidth = health.matureTombstones / rulerTotal * 100

  return <div className="data-health">
    <div className="health-summary">
      <span className={health.level}><Database/></span>
      <div><p className="eyebrow">LOCAL DATA</p><h3>{health.level === 'healthy' ? '数据结构保持轻盈' : '可以留意墓碑增长'}</h3><p>当前业务数据约 {formatDataSize(health.estimatedBytes)}，{health.tombstones ? `包含 ${health.tombstones} 条删除标记。` : '没有删除墓碑。'}</p></div>
      <strong>{health.activeRecords}<small> 条有效记录</small></strong>
    </div>

    <div className="health-ruler" aria-label={`有效记录 ${health.activeRecords} 条，墓碑 ${health.tombstones} 条`}>
      <div><i className="active" style={{ width: `${activeWidth}%` }}/><i className="recent" style={{ width: `${recentWidth}%` }}/><i className="mature" style={{ width: `${matureWidth}%` }}/></div>
      <span><b>有效数据</b>{health.activeRecords}</span><span><b>90 天内墓碑</b>{health.recentTombstones}</span><span><b>90 天以上</b>{health.matureTombstones}</span>
    </div>

    <div className="health-facts">
      <div><Archive/><span>历史压缩<strong>{health.archivedCompletions} 轻量归档 · {health.deletedTasks + health.deletedSessions} 删除标记</strong></span></div>
      <div><HardDrive/><span>浏览器空间<strong>{storageUsage === undefined ? '正在估算…' : `${formatDataSize(storageUsage)} / ${storageQuota ? formatDataSize(storageQuota) : '未知额度'}`}</strong></span></div>
      <div><ShieldCheck/><span>最近 JSON 备份<strong>{backup ? localTime(backup.savedAt) : '尚未在此设备导出'}</strong></span></div>
      <div><Cloud/><span>最近 WebDAV 同步<strong>{syncMeta ? localTime(syncMeta.lastSyncedAt) : '尚未在此设备同步'}</strong></span></div>
    </div>

    <section className="tombstone-policy">
      <header><CheckCircle2/><div><b>长期墓碑策略已启用</b><p>删除标记先保留 90 天；当前不会自动物理删除，避免离线设备把旧任务重新带回来。</p></div></header>
      <ol><li className="done"><i/>删除后 0—90 天<strong>完整保留，参与同步</strong></li><li className={health.matureTombstones ? 'current' : ''}><i/>超过 90 天<strong>{health.matureTombstones ? `${health.matureTombstones} 条进入观察区` : '暂时没有到期墓碑'}</strong></li><li><i/>设备同步水位确认<strong>全部设备确认后才允许压缩</strong></li></ol>
      <p>以目前的个人数据规模，墓碑占用远小于一张照片。安全水位完成前，保留它们比节省这点空间更重要。</p>
    </section>
  </div>
}
