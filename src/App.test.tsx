import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { MemoryRepository } from './data/repository'
import { demoState as seedState } from './test/fixtures'
import { AppProvider } from './state/AppContext'
import { createBackupEnvelope } from './utils/backup'
import { dateKeyToShanghaiStart, shanghaiDateKey } from './utils/statistics'

function renderRoute(route: string, state = seedState) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppProvider repository={new MemoryRepository(state)}>
        <App />
      </AppProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('task and category workflows', () => {
  it('opens the task page on pending tasks and orders completed and all after it', async () => {
    renderRoute('/tasks')
    await screen.findByText('已保存在本机')

    const tabs = screen.getAllByRole('button').filter(button => ['待完成', '已完成', '全部'].includes(button.textContent ?? ''))
    expect(tabs.map(button => button.textContent)).toEqual(['待完成', '已完成', '全部'])
    expect(screen.getByRole('button', { name: '待完成' })).toHaveClass('active')
    expect(screen.queryByText('整理上周项目笔记')).not.toBeInTheDocument()
  })

  it('creates a category inline and completes task CRUD with separate plan and due dates', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderRoute('/tasks')
    await screen.findByText('已保存在本机')

    fireEvent.click(screen.getByRole('button', { name: '新建任务' }))
    fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: '测试任务' } })
    const planDate = '2026-08-15'
    fireEvent.change(screen.getByLabelText('计划日期'), { target: { value: planDate } })

    expect(screen.getByLabelText('截止日期')).toHaveValue(planDate)

    fireEvent.click(screen.getByRole('button', { name: '新建分类' }))
    fireEvent.change(screen.getByLabelText('新分类名称'), { target: { value: '健康' } })
    fireEvent.click(screen.getByRole('button', { name: '添加并选中' }))

    expect(screen.getByLabelText('任务分类')).not.toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }))
    expect(await screen.findByText('测试任务')).toBeInTheDocument()
    expect(screen.getByText(/健康 · 计划 08-15 · 截止 08-15/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '编辑任务：测试任务' }))
    fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: '修改后的任务' } })
    fireEvent.change(screen.getByLabelText('截止日期'), { target: { value: '2026-08-15' } })
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))

    expect(await screen.findByText('修改后的任务')).toBeInTheDocument()
    expect(screen.getByText(/计划 08-15 · 截止 08-15/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '删除任务：修改后的任务' }))
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(screen.queryByText('修改后的任务')).not.toBeInTheDocument()
  })

  it('opens a read-only task detail before editing', async () => {
    renderRoute('/tasks')
    await screen.findByText('已保存在本机')

    fireEvent.click(screen.getByRole('button', { name: '查看任务：完成产品原型的交互梳理' }))
    expect(screen.getByRole('dialog', { name: '完成产品原型的交互梳理' })).toBeInTheDocument()
    expect(screen.getByText('整理主流程与异常状态')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '编辑任务' }))
    expect(screen.getByRole('heading', { name: '编辑任务' })).toBeInTheDocument()
  })

  it('configures a recurring task and exposes the rule in details', async () => {
    renderRoute('/tasks')
    await screen.findByText('已保存在本机')
    fireEvent.click(screen.getByRole('button', { name: '新建任务' }))
    fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: '每周整理' } })
    fireEvent.change(screen.getByLabelText('重复规则'), { target: { value: 'weekly' } })
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }))
    fireEvent.click(screen.getByRole('button', { name: /重复任务/ }))
    fireEvent.click(await screen.findByRole('button', { name: '查看任务：每周整理' }))

    expect(screen.getByText('每周同一天')).toBeInTheDocument()
  })

  it('rejects duplicate category names and can rename and archive a category', async () => {
    renderRoute('/settings')
    await screen.findByText('已保存在本机')

    const workName = screen.getByLabelText('深度工作名称')
    const workRow = workName.closest<HTMLElement>('.category-row')
    expect(workRow).not.toBeNull()

    fireEvent.change(workName, { target: { value: '学习' } })
    fireEvent.click(within(workRow!).getByRole('button', { name: '保存' }))
    expect(within(workRow!).getByRole('alert')).toHaveTextContent('分类名已存在')

    fireEvent.change(workName, { target: { value: '核心工作' } })
    fireEvent.click(within(workRow!).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByLabelText('核心工作名称')).toBeInTheDocument())

    const renamedRow = screen.getByLabelText('核心工作名称').closest<HTMLElement>('.category-row')!
    fireEvent.click(within(renamedRow).getByRole('button', { name: '停用' }))
    expect(within(renamedRow).getByRole('button', { name: '启用' })).toBeInTheDocument()
  })
})

describe('timer and review workflows', () => {
  it('requires confirmation before switching an active focus and records an early finish', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderRoute('/timer')
    await screen.findByText('已保存在本机')

    vi.useFakeTimers()
    try {
      const currentDayAtNoon = new Date(dateKeyToShanghaiStart(shanghaiDateKey()) + 12 * 60 * 60 * 1000)
      vi.setSystemTime(currentDayAtNoon)
      fireEvent.click(screen.getByRole('button', { name: '开始专注' }))
      await act(async () => { vi.advanceTimersByTime(2_000) })

      fireEvent.click(screen.getByRole('button', { name: '短休息' }))
      expect(confirm).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: '专注' })).toHaveClass('active')

      fireEvent.click(screen.getByRole('button', { name: '短休息' }))
      expect(confirm).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('button', { name: '短休息' })).toHaveClass('active')
      expect(screen.getByText('3 次 · 50 分 2 秒')).toBeInTheDocument()
      expect(document.querySelector('.compact-rounds')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the unified review fields inside the calendar day panel', async () => {
    renderRoute('/calendar')
    await screen.findByText('已保存在本机')

    expect(screen.getByText('当日复盘')).toBeInTheDocument()
    expect(screen.getByLabelText(/今日收获/)).toBeInTheDocument()
    expect(screen.getByLabelText(/可以改进/)).toBeInTheDocument()
    expect(screen.getByLabelText(/明日计划/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出 Markdown' })).toBeInTheDocument()
    expect(document.querySelectorAll('.review-marker').length).toBeGreaterThan(0)
  })

  it('uses a focused full-screen editor for reviews on narrow screens', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    renderRoute('/review')
    await screen.findByText('已保存在本机')

    const field = screen.getByLabelText(/今日收获/)
    fireEvent.click(field)
    const editor = screen.getByLabelText('复盘专注编辑框')
    fireEvent.change(editor, { target: { value: '手机长文草稿' } })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(field).toHaveValue('')

    fireEvent.click(field)
    fireEvent.change(screen.getByLabelText('复盘专注编辑框'), { target: { value: '确认后的长文' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(field).toHaveValue('确认后的长文')
  })

  it('shows searchable history and week/month review summaries', async () => {
    renderRoute('/review')
    await screen.findByText('已保存在本机')
    expect(screen.getByText('周期回顾')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出周复盘' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '月' }))
    expect(screen.getByRole('button', { name: '导出月复盘' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('搜索历史复盘'), { target: { value: '最重要' } })
    expect(screen.getAllByText(/完成了最重要的梳理工作/).length).toBeGreaterThan(0)
  })

  it('requires confirmation and immediately hides a deleted focus session', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderRoute('/timer')
    await screen.findByText('已保存在本机')
    const target = screen.getAllByRole('button', { name: /删除专注记录：/ })[0]
    const label = target.getAttribute('aria-label')!

    fireEvent.click(target)
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
  })
})

describe('sleep workflows', () => {
  it('previews and saves same-day and overnight sleep windows', async () => {
    renderRoute('/sleep')
    await screen.findByText('已保存在本机')

    const wakeDate = (screen.getByLabelText('起床日期') as HTMLInputElement).value
    const previousDate = (screen.getByLabelText('入睡日期') as HTMLInputElement).value
    expect(screen.getByText(/每个起床日期保存一条主睡眠记录/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('入睡日期'), { target: { value: wakeDate } })
    fireEvent.change(screen.getByLabelText('入睡时间'), { target: { value: '02:00' } })
    fireEvent.change(screen.getByLabelText('起床时间'), { target: { value: '08:00' } })
    expect(screen.getByText('6 小时')).toBeInTheDocument()
    expect(screen.getByText(/02:00 → .*08:00/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /记录$/ }))
    expect(screen.getByText('已保存睡眠记录')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('入睡日期'), { target: { value: previousDate } })
    fireEvent.change(screen.getByLabelText('入睡时间'), { target: { value: '23:30' } })
    fireEvent.change(screen.getByLabelText('起床时间'), { target: { value: '07:00' } })
    expect(screen.getByText('7 小时 30 分钟')).toBeInTheDocument()
    expect(screen.getByText(/23:30 → .*07:00/)).toBeInTheDocument()
  })

  it('loads an existing record when selecting its wake date', async () => {
    const state = structuredClone(seedState)
    state.sleep.push({ id: 'history', date: '2026-08-08', sleptAt: '2026-08-07T23:45', wokeAt: '2026-08-08T08:15', score: 3 })
    renderRoute('/sleep', state)
    await screen.findByText('已保存在本机')

    fireEvent.change(screen.getByLabelText('起床日期'), { target: { value: '2026-08-08' } })

    expect(screen.getByLabelText('入睡日期')).toHaveValue('2026-08-07')
    expect(screen.getByLabelText('入睡时间')).toHaveValue('23:45')
    expect(screen.getByLabelText('起床时间')).toHaveValue('08:15')
    expect(screen.getByRole('button', { name: '3' })).toHaveClass('active')
    expect(screen.getByRole('button', { name: '更新记录' })).toBeInTheDocument()
  })
})

describe('data import workflows', () => {
  function prepareDownloads() {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  }

  function backupFile(state = seedState) {
    const file = new File([], 'backup.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(createBackupEnvelope(state, '2026-08-09T12:00:00.000Z')) })
    return file
  }

  it('previews and confirms overwrite, downloading a pre-import backup first', async () => {
    prepareDownloads()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const imported = structuredClone(seedState)
    imported.tasks[0].title = '从备份覆盖的任务'
    renderRoute('/settings')
    await screen.findByText('已保存在本机')

    fireEvent.change(screen.getByLabelText('选择 JSON 备份文件'), { target: { files: [backupFile(imported)] } })
    expect(await screen.findByText('有效的刻度备份')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '覆盖本地' }))

    expect(window.confirm).toHaveBeenCalledOnce()
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(await screen.findByText(/已覆盖本地数据/)).toBeInTheDocument()
  })

  it('merges a non-conflicting imported record and creates a pre-import backup', async () => {
    prepareDownloads()
    const imported = structuredClone(seedState)
    imported.categories = imported.categories.map(category => ({ ...category, archived: false }))
    imported.tasks.push({ ...imported.tasks[0], id: 'only-imported', title: '仅备份中的任务' })
    renderRoute('/settings')
    await screen.findByText('已保存在本机')

    fireEvent.change(screen.getByLabelText('选择 JSON 备份文件'), { target: { files: [backupFile(imported)] } })
    expect(await screen.findByText('有效的刻度备份')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '合并数据' }))

    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(await screen.findByText(/数据已合并/)).toBeInTheDocument()
  })

  it('keeps local data unchanged when the pre-import backup is cancelled', async () => {
    vi.stubGlobal('showSaveFilePicker', vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const imported = structuredClone(seedState)
    imported.tasks[0].title = '不应覆盖的任务'
    renderRoute('/settings')
    await screen.findByText('已保存在本机')

    fireEvent.change(screen.getByLabelText('选择 JSON 备份文件'), { target: { files: [backupFile(imported)] } })
    fireEvent.click(await screen.findByRole('button', { name: '覆盖本地' }))
    expect(await screen.findByText('已取消导入，当前数据没有变化。')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('link', { name: '任务' })[0])
    expect(await screen.findByText('完成产品原型的交互梳理')).toBeInTheDocument()
    expect(screen.queryByText('不应覆盖的任务')).not.toBeInTheDocument()
  })

  it('shows both readable versions, full JSON, and a tombstone warning before conflict choice', async () => {
    prepareDownloads()
    const imported = structuredClone(seedState)
    imported.categories = imported.categories.map(category => ({ ...category, archived: false }))
    imported.tasks[0] = { ...imported.tasks[0], title: '导入版交互梳理', note: '来自备份的说明', deletedAt: '2026-08-09T13:00:00.000Z' }
    renderRoute('/settings')
    await screen.findByText('已保存在本机')

    fireEvent.change(screen.getByLabelText('选择 JSON 备份文件'), { target: { files: [backupFile(imported)] } })
    expect(await screen.findByText('有效的刻度备份')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '合并数据' }))

    expect(await screen.findByText('解决合并冲突')).toBeInTheDocument()
    expect(screen.getByText('本地版')).toBeInTheDocument()
    expect(screen.getByText('导入版')).toBeInTheDocument()
    expect(screen.getByText('已删除墓碑')).toBeInTheDocument()
    expect(screen.getAllByText('查看完整 JSON')).toHaveLength(2)
    expect(screen.getByText(/标题：导入版交互梳理/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '应用合并' })).toBeDisabled()
  })
})

describe('WebDAV sync workflows', () => {
  function openWebDav() {
    fireEvent.click(screen.getByRole('button', { name: 'WebDAV 同步' }))
    fireEvent.change(screen.getByLabelText('WebDAV 服务器目录地址'), { target: { value: 'https://dav.example.com/files/me/' } })
    fireEvent.change(screen.getByLabelText('WebDAV 用户名'), { target: { value: 'me' } })
    fireEvent.change(screen.getByLabelText('WebDAV 密码'), { target: { value: 'secret' } })
  }

  it('tests the connection and stores credentials only in this browser', async () => {
    localStorage.clear()
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 404, headers: { 'x-kedu-sync-server': '1', 'x-kedu-sync-empty': '1' } }))
    vi.stubGlobal('fetch', fetcher)
    renderRoute('/settings')
    await screen.findByText('已保存在本机')
    openWebDav()

    fireEvent.click(screen.getByRole('button', { name: '测试连接' }))

    expect(await screen.findByText(/连接成功，远端还没有/)).toBeInTheDocument()
    expect(localStorage.getItem('kedu-focus-webdav-config-v1')).toContain('dav.example.com')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('requires confirmation before creating the first remote backup', async () => {
    localStorage.clear()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 404, headers: { 'x-kedu-sync-server': '1', 'x-kedu-sync-empty': '1' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204, headers: { etag: '"created"' } }))
    vi.stubGlobal('fetch', fetcher)
    renderRoute('/settings')
    await screen.findByText('已保存在本机')
    openWebDav()

    fireEvent.click(screen.getByRole('button', { name: '检查并同步' }))

    expect(await screen.findByRole('region', { name: '确认首次上传' })).toBeInTheDocument()
    expect(fetcher).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '确认首次上传' }))
    expect(await screen.findByText(/首份云端备份已创建/)).toBeInTheDocument()
    expect(fetcher.mock.calls.map(call => (call[1] as RequestInit).method)).toEqual(['GET', 'PUT'])
    expect((fetcher.mock.calls[1][1] as RequestInit).headers).toMatchObject({ 'If-None-Match': '*' })
  })

  it('requires an explicit version choice when the remote data differs', async () => {
    localStorage.clear()
    const cloud = structuredClone(seedState)
    cloud.tasks[0].title = '云端版本的任务'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(createBackupEnvelope(cloud)), { status: 200, headers: { etag: '"cloud"' } })))
    renderRoute('/settings')
    await screen.findByText('已保存在本机')
    openWebDav()

    fireEvent.click(screen.getByRole('button', { name: '检查并同步' }))

    expect(await screen.findByRole('region', { name: '同步差异预览' })).toBeInTheDocument()
    expect(screen.getByText(/标题：云端版本的任务/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /云端覆盖本机/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /本机覆盖云端/ })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('disables data transfer while a focus timer is active', async () => {
    localStorage.clear()
    const running = structuredClone(seedState)
    running.timer.status = 'running'
    running.timer.startedAt = new Date().toISOString()
    running.timer.runStartedAt = running.timer.startedAt
    renderRoute('/settings', running)
    await screen.findByText('已保存在本机')
    fireEvent.click(screen.getByRole('button', { name: 'WebDAV 同步' }))

    expect(screen.getByText(/计时进行中/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '检查并同步' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /检查云端下载/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /检查云端上传/ })).toBeDisabled()
  })
})
