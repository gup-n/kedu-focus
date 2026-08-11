import type { AppState } from '../domain/types'
import { createBackupEnvelope, parseBackupJson, type BackupEnvelope } from './backup'

export interface WebDavConfig {
  serverUrl: string
  username: string
  password: string
  filename: string
}

export interface WebDavRemote {
  envelope: BackupEnvelope
  etag?: string
  lastModified?: string
}

export interface WebDavSyncMeta {
  target: string
  lastSyncedAt: string
  localFingerprint: string
  remoteFingerprint: string
  etag?: string
}

export const WEBDAV_CONFIG_KEY = 'kedu-focus-webdav-config-v1'
export const WEBDAV_META_KEY = 'kedu-focus-webdav-meta-v1'
export const DEFAULT_WEBDAV_FILENAME = 'kedu-focus-backup.json'

export class WebDavError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message)
    this.name = 'WebDavError'
  }
}

function storage(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage } catch { return undefined }
}

export function loadWebDavConfig(): WebDavConfig {
  const fallback = { serverUrl: '', username: '', password: '', filename: DEFAULT_WEBDAV_FILENAME }
  try {
    const saved = storage()?.getItem(WEBDAV_CONFIG_KEY)
    if (!saved) return fallback
    const value = JSON.parse(saved) as Partial<WebDavConfig>
    return {
      serverUrl: typeof value.serverUrl === 'string' ? value.serverUrl : '',
      username: typeof value.username === 'string' ? value.username : '',
      password: typeof value.password === 'string' ? value.password : '',
      filename: typeof value.filename === 'string' && value.filename.trim() ? value.filename : DEFAULT_WEBDAV_FILENAME,
    }
  } catch { return fallback }
}

export function saveWebDavConfig(config: WebDavConfig) {
  storage()?.setItem(WEBDAV_CONFIG_KEY, JSON.stringify(config))
}

export function loadWebDavMeta(target: string): WebDavSyncMeta | undefined {
  try {
    const saved = storage()?.getItem(WEBDAV_META_KEY)
    if (!saved) return undefined
    const meta = JSON.parse(saved) as WebDavSyncMeta
    return meta.target === target ? meta : undefined
  } catch { return undefined }
}

export function saveWebDavMeta(meta: WebDavSyncMeta) {
  storage()?.setItem(WEBDAV_META_KEY, JSON.stringify(meta))
}

export function webDavTarget(config: WebDavConfig): string {
  const serverUrl = config.serverUrl.trim()
  if (!serverUrl) throw new WebDavError('请填写 WebDAV 服务器地址。')
  let url: URL
  try { url = new URL(serverUrl) } catch { throw new WebDavError('WebDAV 地址格式不正确。') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new WebDavError('WebDAV 地址必须使用 HTTP 或 HTTPS。')
  const filename = config.filename.trim()
  if (!filename) throw new WebDavError('请填写远端备份文件名。')
  if (/[\\/]/.test(filename) || filename === '.' || filename === '..') throw new WebDavError('远端文件名不能包含路径分隔符。')
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${encodeURIComponent(filename)}`
  return url.toString()
}

function authorization(config: WebDavConfig) {
  const bytes = new TextEncoder().encode(`${config.username}:${config.password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}

async function request(config: WebDavConfig, init: RequestInit): Promise<Response> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new WebDavError('当前处于离线状态，连接网络后再同步。')
  try {
    return await fetch(webDavTarget(config), {
      ...init,
      cache: 'no-store',
      headers: {
        Authorization: authorization(config),
        ...init.headers,
      },
    })
  } catch (reason) {
    if (reason instanceof WebDavError) throw reason
    throw new WebDavError('无法连接 WebDAV。请检查地址、网络，以及服务器是否允许浏览器跨域访问（CORS）。')
  }
}

function responseError(response: Response): WebDavError {
  if (response.status === 401) return new WebDavError('用户名或密码不正确。', response.status)
  if (response.status === 403) return new WebDavError('服务器拒绝访问，请检查目录写入权限。', response.status)
  if (response.status === 412) return new WebDavError('云端文件刚被其他设备修改，请重新读取后再选择版本。', response.status)
  if (response.status >= 500) return new WebDavError(`WebDAV 服务器暂时不可用（${response.status}）。`, response.status)
  return new WebDavError(`WebDAV 请求失败（${response.status} ${response.statusText || '未知错误'}）。`, response.status)
}

export async function inspectWebDav(config: WebDavConfig): Promise<{ exists: boolean; etag?: string; lastModified?: string }> {
  const response = await request(config, { method: 'GET', headers: { Accept: 'application/json' } })
  if (response.status === 404) return { exists: false }
  if (!response.ok) throw responseError(response)
  return {
    exists: true,
    etag: response.headers.get('etag') ?? undefined,
    lastModified: response.headers.get('last-modified') ?? undefined,
  }
}

export async function downloadWebDav(config: WebDavConfig): Promise<WebDavRemote | null> {
  const response = await request(config, { method: 'GET', headers: { Accept: 'application/json' } })
  if (response.status === 404) return null
  if (!response.ok) throw responseError(response)
  let envelope: BackupEnvelope
  try { envelope = parseBackupJson(await response.text()) }
  catch (reason) {
    throw new WebDavError(reason instanceof Error ? `云端文件不是有效的刻度备份：${reason.message}` : '云端文件不是有效的刻度备份。')
  }
  return {
    envelope,
    etag: response.headers.get('etag') ?? undefined,
    lastModified: response.headers.get('last-modified') ?? undefined,
  }
}

export async function uploadWebDav(config: WebDavConfig, state: AppState, etag?: string | null): Promise<WebDavRemote> {
  const envelope = createBackupEnvelope(state)
  const response = await request(config, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(etag === null ? { 'If-None-Match': '*' } : etag ? { 'If-Match': etag } : {}),
    },
    body: JSON.stringify(envelope, null, 2),
  })
  if (!response.ok) throw responseError(response)
  return {
    envelope,
    etag: response.headers.get('etag') ?? undefined,
    lastModified: response.headers.get('last-modified') ?? undefined,
  }
}

export function stateFingerprint(state: AppState): string {
  const timer = { ...state.timer }
  delete timer.liveElapsedSeconds
  const text = JSON.stringify({ ...state, timer })
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function createWebDavMeta(config: WebDavConfig, local: AppState, remote: AppState, etag?: string): WebDavSyncMeta {
  return {
    target: webDavTarget(config),
    lastSyncedAt: new Date().toISOString(),
    localFingerprint: stateFingerprint(local),
    remoteFingerprint: stateFingerprint(remote),
    etag,
  }
}
