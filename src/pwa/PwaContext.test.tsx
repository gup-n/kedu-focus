import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PwaProvider } from './PwaContext'
import { PwaSettings } from './PwaSettings'

const sw = vi.hoisted(() => ({
  needRefresh: false,
  offlineReady: false,
  setNeedRefresh: vi.fn(),
  setOfflineReady: vi.fn(),
  update: vi.fn(),
  registered: undefined as ((url: string, registration?: ServiceWorkerRegistration) => void) | undefined,
}))

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: { onRegisteredSW?: (url: string, registration?: ServiceWorkerRegistration) => void }) => {
    sw.registered = options.onRegisteredSW
    return {
    needRefresh: [sw.needRefresh, sw.setNeedRefresh],
    offlineReady: [sw.offlineReady, sw.setOfflineReady],
    updateServiceWorker: sw.update,
    }
  },
}))

describe('PWA controls', () => {
  afterEach(cleanup)

  beforeEach(() => {
    sw.needRefresh = false
    sw.offlineReady = false
    sw.setNeedRefresh.mockReset()
    sw.setOfflineReady.mockReset()
    sw.update.mockReset()
    sw.registered = undefined
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    })
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockResolvedValue(true) },
    })
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  })

  it('offers the deferred browser install prompt', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    const event = new Event('beforeinstallprompt')
    Object.assign(event, {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    })

    render(<PwaProvider><PwaSettings /></PwaProvider>)
    fireEvent(window, event)
    fireEvent.click(await screen.findByRole('button', { name: /安装应用/ }))

    await waitFor(() => expect(prompt).toHaveBeenCalledOnce())
    expect(await screen.findByText(/已接受安装/)).toBeInTheDocument()
  })

  it('updates only after the user confirms', () => {
    sw.needRefresh = true
    render(<PwaProvider><div>应用内容</div></PwaProvider>)

    expect(screen.getByText('新版本已经准备好')).toBeInTheDocument()
    expect(sw.update).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '立即更新' }))
    expect(sw.update).toHaveBeenCalledWith(true)
  })

  it('requests persistent storage from settings', async () => {
    render(<PwaProvider><PwaSettings /></PwaProvider>)
    const button = await screen.findByRole('button', { name: /请求保护/ })
    fireEvent.click(button)

    await waitFor(() => expect(navigator.storage.persist).toHaveBeenCalledOnce())
    expect(screen.getByText(/已优先保留/)).toBeInTheDocument()
  })

  it('manually checks the service worker and reports the current version', async () => {
    const registration = { update: vi.fn().mockResolvedValue(undefined), waiting: null, installing: null } as unknown as ServiceWorkerRegistration
    render(<PwaProvider><PwaSettings /></PwaProvider>)
    act(() => sw.registered?.('/sw.js', registration))

    fireEvent.click(screen.getByRole('button', { name: '检查更新' }))

    await waitFor(() => expect(registration.update).toHaveBeenCalledOnce())
    expect(await screen.findByText('当前已是最新版本。')).toBeInTheDocument()
    expect(screen.getByText(/上次检查/)).toBeInTheDocument()
  })

  it('turns the settings action into an explicit update after finding a waiting worker', async () => {
    const registration = { update: vi.fn(), waiting: null as ServiceWorker | null, installing: null }
    registration.update.mockImplementation(async () => { registration.waiting = {} as ServiceWorker })
    render(<PwaProvider><PwaSettings /></PwaProvider>)
    act(() => sw.registered?.('/sw.js', registration as unknown as ServiceWorkerRegistration))

    fireEvent.click(screen.getByRole('button', { name: '检查更新' }))
    expect(await screen.findByRole('button', { name: '立即更新' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '立即更新' }))

    expect(sw.update).toHaveBeenCalledWith(true)
  })

  it('reports offline state without asking the service worker to update', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const registration = { update: vi.fn(), waiting: null, installing: null } as unknown as ServiceWorkerRegistration
    render(<PwaProvider><PwaSettings /></PwaProvider>)
    act(() => sw.registered?.('/sw.js', registration))

    fireEvent.click(screen.getByRole('button', { name: '检查更新' }))

    expect(await screen.findByText(/当前处于离线状态/)).toBeInTheDocument()
    expect(registration.update).not.toHaveBeenCalled()
  })
})
