export interface ReleaseNote {
  version: string
  date: string
  title: string
  summary: string
  changes: string[]
}

export const releases: ReleaseNote[] = [
  {
    version: '0.5.0',
    date: '2026-08-13',
    title: '复盘不再怕忘记保存',
    summary: '补上复盘草稿保护与自动保存，并让每次更新都有可查看的说明。',
    changes: [
      '复盘输入后自动保存，意外退出时由本机草稿继续保护',
      '发现新版本时展示本次更新内容，更新后首次打开也会提醒',
      '设置页新增更新历史，可随时回看版本变化',
      '同步前可核对差异，服务端保留同名备份的历史版本',
      '重复任务拥有独立区域，不再与普通待办混在一起',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-08-12',
    title: '局域网同步更安全',
    summary: '加入同步差异确认、备份版本留存和更明确的连接检测。',
    changes: [
      '上传和下载前展示本机、云端数据差异并等待确认',
      '同名 WebDAV 备份覆盖前自动归档旧版本',
      '修复服务关闭后测试连接仍显示成功的问题',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-08-11',
    title: '本机与手机可以互通',
    summary: '完成个人局域网 WebDAV 同步和手动更新检测。',
    changes: [
      '支持电脑与手机通过局域网同步 JSON 数据',
      '设置页可主动检查 PWA 更新',
      '补充 Windows 服务启动、停止和证书说明',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-08-10',
    title: '记录开始可靠地积累',
    summary: '完善实际专注时长、复盘导出、睡眠统计和离线使用。',
    changes: [
      '超过目标时间后继续按实际秒数记录专注',
      '复盘支持 Markdown 导出，睡眠加入平均时长与时段统计',
      '支持安装为 PWA，并在离线时继续使用本机数据',
    ],
  },
]

export const currentRelease = releases[0]

function isReleaseNote(value: unknown): value is ReleaseNote {
  if (!value || typeof value !== 'object') return false
  const note = value as Partial<ReleaseNote>
  return typeof note.version === 'string'
    && typeof note.date === 'string'
    && typeof note.title === 'string'
    && typeof note.summary === 'string'
    && Array.isArray(note.changes)
    && note.changes.every(change => typeof change === 'string')
}

export async function fetchLatestRelease(): Promise<ReleaseNote> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}releases.json?time=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return currentRelease
    const payload: unknown = await response.json()
    if (Array.isArray(payload)) {
      const latest = payload.find(isReleaseNote)
      if (latest) return latest
    }
  } catch {
    // 离线或旧缓存仍可使用随应用打包的更新说明。
  }
  return currentRelease
}
