import { useRef, useState } from 'react'
import { Check, Cloud, Download, FileJson, Files, Upload, X } from 'lucide-react'
import { useApp } from '../state/AppContext'
import type { AppState } from '../domain/types'
import {
  applyConflictChoices,
  buildMergePlan,
  collectionLabel,
  downloadBackup,
  getBackupPreview,
  parseBackupJson,
  type BackupEnvelope,
  type ConflictChoice,
  type MergePlan,
} from '../utils/backup'
import { downloadCsv, type CsvKind } from '../utils/csv'
import { WebDavSync } from './WebDavSync'

function entitySummary(entity: Record<string, unknown>) {
  const values = [
    entity.title && `标题：${entity.title}`,
    entity.name && `名称：${entity.name}`,
    entity.date && `日期：${entity.date}`,
    entity.startedAt && `开始：${String(entity.startedAt).replace('T', ' ').slice(0, 16)}`,
    entity.plannedDate && `计划：${entity.plannedDate}`,
    entity.minutes !== undefined && `时长：${entity.minutes} 分钟`,
    entity.summary && `收获：${entity.summary}`,
    entity.score !== undefined && `评分：${entity.score}`,
  ].filter(Boolean)
  return values.slice(0, 3).join(' · ') || '无可用摘要'
}

function ActionButton({ children, onClick, primary = false, disabled = false }: { children: React.ReactNode; onClick: () => void | Promise<unknown>; primary?: boolean; disabled?: boolean }) {
  return <button type="button" className={`btn ${primary ? 'primary' : 'quiet'}`} onClick={() => void onClick()} disabled={disabled}>{children}</button>
}

export function DataManagement() {
  const { rawState, dispatch } = useApp()
  const input = useRef<HTMLInputElement>(null)
  const [envelope, setEnvelope] = useState<BackupEnvelope | null>(null)
  const [plan, setPlan] = useState<MergePlan | null>(null)
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showCsv, setShowCsv] = useState(false)
  const [showWebDav, setShowWebDav] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function loadFile(file?: File) {
    if (!file) return
    setError('')
    setNotice('')
    setPlan(null)
    setChoices({})
    try {
      setEnvelope(parseBackupJson(await file.text()))
    } catch (reason) {
      setEnvelope(null)
      setError(reason instanceof Error ? reason.message : '无法读取此备份文件。')
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  function closeImport() {
    setEnvelope(null)
    setPlan(null)
    setChoices({})
    setError('')
  }

  async function exportJson() {
    setError('')
    setNotice('')
    setExporting(true)
    try {
      const result = await downloadBackup(rawState)
      setNotice(result === 'cancelled' ? '已取消导出，本地数据没有变化。' : result === 'shared' ? '备份文件已交给系统分享。' : 'JSON 备份已保存。')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法导出 JSON 备份。')
    } finally {
      setExporting(false)
    }
  }

  async function exportCsvFile(kind: CsvKind) {
    setError('')
    setNotice('')
    try {
      const result = await downloadCsv(rawState, kind)
      setNotice(result === 'cancelled' ? '已取消导出。' : result === 'shared' ? 'CSV 文件已交给系统分享。' : 'CSV 文件已保存。')
      if (result !== 'cancelled') setShowCsv(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法导出 CSV 文件。')
    }
  }

  async function applyState(next: AppState, message: string) {
    setError('')
    setExporting(true)
    try {
      const result = await downloadBackup(rawState, '刻度_导入前备份')
      if (result === 'cancelled') {
        setNotice('已取消导入，当前数据没有变化。')
        return
      }
      dispatch({ type: 'HYDRATE', state: next })
      closeImport()
      setNotice(message)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '导入前备份失败，当前数据没有变化。')
    } finally {
      setExporting(false)
    }
  }

  async function overwrite() {
    if (!envelope) return
    if (!window.confirm('覆盖会用备份中的数据替换当前本地数据。系统会先自动下载一份“导入前备份”，确定继续吗？')) return
    await applyState(envelope.data, '已覆盖本地数据，并已自动保存导入前备份。')
  }

  async function prepareMerge() {
    if (!envelope) return
    const nextPlan = buildMergePlan(rawState, envelope.data)
    if (!nextPlan.conflicts.length) {
      await applyState(nextPlan.state, '数据已合并，并已自动保存导入前备份。')
      return
    }
    setPlan(nextPlan)
    setChoices({})
  }

  function chooseAll(choice: ConflictChoice) {
    if (!plan) return
    setChoices(Object.fromEntries(plan.conflicts.map(conflict => [conflict.key, choice])))
  }

  async function applyMerge() {
    if (!plan) return
    try {
      await applyState(applyConflictChoices(plan, choices), '冲突已按你的选择合并，并已自动保存导入前备份。')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '合并失败。')
    }
  }

  const preview = envelope ? getBackupPreview(envelope) : null
  const resolved = plan ? plan.conflicts.filter(conflict => choices[conflict.key]).length : 0

  return <>
    <p className="muted">JSON 备份包含全部任务（含删除墓碑）、分类、专注、复盘、睡眠、偏好和计时状态。导入前可先预览，应用时会自动备份当前数据。</p>
    <input ref={input} className="visually-hidden" aria-label="选择 JSON 备份文件" type="file" accept="application/json,.json" onChange={event => void loadFile(event.target.files?.[0])}/>
    <div className="data-actions">
      <ActionButton disabled={exporting} onClick={exportJson}><Download/> {exporting ? '正在处理…' : '导出 JSON 备份'}</ActionButton>
      <ActionButton onClick={() => input.current?.click()}><Upload/> 导入 JSON</ActionButton>
      <ActionButton onClick={() => setShowCsv(true)}><Files/> 导出 CSV</ActionButton>
      <ActionButton onClick={() => setShowWebDav(true)}><Cloud/> WebDAV 同步</ActionButton>
    </div>
    {notice && <p className="data-notice" role="status"><Check/> {notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}

    {showCsv && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setShowCsv(false)}><div className="dialog data-dialog">
      <div className="dialog-head"><h2>导出 CSV</h2><button onClick={() => setShowCsv(false)} aria-label="关闭"><X/></button></div>
      <p className="muted">文件使用 UTF-8 BOM 和 Windows 友好的 CSV 格式，可直接用 Excel 打开。</p>
      <div className="csv-options">{([['tasks', '任务'], ['sessions', '专注记录'], ['sleep', '睡眠记录']] as [CsvKind, string][]).map(([kind, label]) => <ActionButton key={kind} onClick={() => exportCsvFile(kind)}><Download/> 导出{label}</ActionButton>)}</div>
    </div></div>}

    {showWebDav && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setShowWebDav(false)}><div className="dialog data-dialog webdav-dialog">
      <div className="dialog-head"><h2>WebDAV 同步</h2><button onClick={() => setShowWebDav(false)} aria-label="关闭"><X/></button></div>
      <WebDavSync/>
    </div></div>}

    {envelope && preview && <div className="modal-backdrop"><div className="dialog import-dialog">
      <div className="dialog-head"><h2>{plan ? '解决合并冲突' : '导入预览'}</h2><button onClick={closeImport} aria-label="关闭"><X/></button></div>
      {!plan ? <>
        <div className="backup-file"><FileJson/><div><b>有效的刻度备份</b><p>导出于 {new Date(preview.exportedAt).toLocaleString('zh-CN')}</p></div></div>
        <div className="preview-grid"><span><b>{preview.tasks}</b>任务{preview.deletedTasks>0&&<small> +{preview.deletedTasks} 已删除</small>}</span><span><b>{preview.categories}</b>分类</span><span><b>{preview.sessions}</b>专注{preview.deletedSessions>0&&<small> +{preview.deletedSessions} 已删除</small>}</span><span><b>{preview.reviews}</b>复盘</span><span><b>{preview.sleep}</b>睡眠</span></div>
        <p className="muted">“合并”会按记录 ID 对齐，并保留本机设置和当前计时器；内容不同的同 ID 记录需要你逐条选择。“覆盖”会恢复备份中的完整状态。</p>
        <div className="dialog-actions"><ActionButton disabled={exporting} onClick={overwrite}>覆盖本地</ActionButton><ActionButton primary disabled={exporting} onClick={prepareMerge}>合并数据</ActionButton></div>
      </> : <>
        <div className="conflict-toolbar"><span>{resolved} / {plan.conflicts.length} 条已选择</span><button onClick={() => chooseAll('local')}>全部保留本地</button><button onClick={() => chooseAll('imported')}>全部使用导入</button></div>
        <div className="conflict-list">{plan.conflicts.map(conflict => <article key={conflict.key}>
          <div className="conflict-heading"><small>{collectionLabel(conflict.collection)}</small><b>{conflict.label}</b><code>{conflict.id}</code></div>
          <div className="conflict-choices">
            <button className={choices[conflict.key] === 'local' ? 'selected' : ''} onClick={() => setChoices(current => ({ ...current, [conflict.key]: 'local' }))}>保留本地</button>
            <button className={choices[conflict.key] === 'imported' ? 'selected' : ''} onClick={() => setChoices(current => ({ ...current, [conflict.key]: 'imported' }))}>使用导入</button>
          </div>
          <div className="conflict-versions">
            {([['本地版', conflict.local], ['导入版', conflict.imported]] as const).map(([name, entity]) => { const record = entity as unknown as Record<string, unknown>; const deleted = Boolean(record.deletedAt); return <section key={name} className={deleted ? 'deleted-version' : ''}><div><strong>{name}</strong>{deleted && <em>已删除墓碑</em>}</div><p>{entitySummary(record)}</p><details><summary>查看完整 JSON</summary><pre>{JSON.stringify(entity, null, 2)}</pre></details></section> })}
          </div>
        </article>)}</div>
        <div className="dialog-actions"><ActionButton onClick={() => { setPlan(null); setChoices({}); setError('') }}>返回预览</ActionButton><ActionButton primary disabled={exporting || resolved !== plan.conflicts.length} onClick={applyMerge}>应用合并</ActionButton></div>
      </>}
    </div></div>}
  </>
}
