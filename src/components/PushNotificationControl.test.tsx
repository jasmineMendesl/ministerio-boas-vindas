import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), remove: vi.fn(), register: vi.fn(), getSubscription: vi.fn(), subscribe: vi.fn(), requestPermission: vi.fn() }))
vi.mock('../app/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'user-1' } } }) }))
vi.mock('../lib/supabase', () => {
  const query = {
    eq: () => query,
    then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(mocks.remove()).then(resolve, reject),
  }
  return { supabase: { from: () => ({ upsert: mocks.upsert, delete: () => query }) } }
})
import { PushNotificationControl, removePushSubscription } from './PushNotificationControl'

describe('mobile notifications', () => {
  beforeEach(() => {
    mocks.upsert.mockResolvedValue({ error: null })
    mocks.remove.mockResolvedValue({ error: null })
    mocks.getSubscription.mockResolvedValue(null)
    mocks.requestPermission.mockResolvedValue('granted')
    mocks.subscribe.mockResolvedValue({ endpoint: 'https://push.example/subscription', toJSON: () => ({ keys: { p256dh: 'key', auth: 'auth' } }) })
    const registration = { pushManager: { getSubscription: mocks.getSubscription, subscribe: mocks.subscribe } }
    mocks.register.mockResolvedValue(registration)
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: mocks.requestPermission })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: mocks.register, ready: Promise.resolve(registration), getRegistration: async () => registration } })
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); Reflect.deleteProperty(navigator, 'serviceWorker') })

  it('shows iPhone installation guidance on tap when push is unsupported', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone')
    Reflect.deleteProperty(navigator, 'serviceWorker')
    render(<PushNotificationControl />)
    fireEvent.click(await screen.findByRole('button', { name: 'Notificações indisponíveis neste navegador' }))
    expect(screen.getByRole('status').textContent).toContain('Adicionar à Tela de Início')
    expect(mocks.requestPermission).not.toHaveBeenCalled()
  })

  it('explains how to unblock notifications instead of disabling the button', async () => {
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: mocks.requestPermission })
    render(<PushNotificationControl />)
    fireEvent.click(await screen.findByRole('button', { name: /Permissão bloqueada/ }))
    expect(screen.getByRole('status').textContent).toContain('configurações deste site')
  })

  it('requests permission directly from the click and saves the device subscription', async () => {
    render(<PushNotificationControl />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar notificações neste dispositivo' }))
    expect(mocks.requestPermission).toHaveBeenCalledOnce()
    await screen.findByText('Notificações ativadas neste dispositivo.')
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-1', endpoint: 'https://push.example/subscription' }), { onConflict: 'endpoint' })
  })

  it('recovers from a service worker that never becomes ready', async () => {
    vi.useFakeTimers()
    Object.defineProperty(navigator.serviceWorker, 'ready', { value: new Promise(() => {}) })
    render(<PushNotificationControl />)
    await act(() => vi.advanceTimersByTimeAsync(10000))
    expect(screen.getByRole('button', { name: 'Tentar novamente' }).hasAttribute('disabled')).toBe(false)
  })

  it('offers reactivation after disabling and saves a new subscription without asking permission again', async () => {
    const makeSubscription = (endpoint: string) => ({
      endpoint,
      toJSON: () => ({ keys: { p256dh: 'key', auth: 'auth' } }),
      unsubscribe: vi.fn(async () => { subscription = null; return true }),
    })
    let subscription: ReturnType<typeof makeSubscription> | null = makeSubscription('https://push.example/old')
    mocks.getSubscription.mockImplementation(async () => subscription)
    mocks.subscribe.mockImplementation(async () => { subscription = makeSubscription('https://push.example/new'); return subscription })
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: mocks.requestPermission })
    render(<PushNotificationControl />)
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar notificações' }))
    await screen.findByText('Notificações desativadas neste dispositivo.')
    expect(screen.getByRole('button', { name: 'Ativar notificações neste dispositivo' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ativar novamente' }))
    await screen.findByText('Notificações ativadas neste dispositivo.')
    expect(screen.getByRole('button', { name: 'Desativar notificações' })).toBeTruthy()
    expect(mocks.remove).toHaveBeenCalledOnce()
    expect(mocks.subscribe).toHaveBeenCalledOnce()
    expect(mocks.requestPermission).not.toHaveBeenCalled()
    expect(mocks.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ endpoint: 'https://push.example/new' }), { onConflict: 'endpoint' })
  })

  it('does not fail logout when service workers exist without push support', async () => {
    Object.defineProperty(navigator.serviceWorker, 'getRegistration', { value: async () => ({}) })
    await expect(removePushSubscription('user-1')).resolves.toBeUndefined()
  })
})
