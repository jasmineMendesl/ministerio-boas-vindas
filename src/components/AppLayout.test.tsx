import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mocks = vi.hoisted(() => ({ cleanupPush: vi.fn(), signOut: vi.fn() }))
vi.mock('../app/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'user-1' } }, role: 'team' }) }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut: mocks.signOut } } }))
vi.mock('./PushNotificationControl', () => ({ PushNotificationControl: () => <button>Avisos</button>, removePushSubscription: mocks.cleanupPush }))
import { AppLayout } from './AppLayout'

function renderLayout() {
  render(<MemoryRouter initialEntries={['/']}><Routes><Route path="/" element={<AppLayout />} /><Route path="/login" element={<h1>Login</h1>} /></Routes></MemoryRouter>)
}

function mobileLogoutButton() {
  return screen.getAllByRole('button', { name: 'Sair' }).slice(-1)[0]
}

describe('mobile logout', () => {
  beforeEach(() => { mocks.signOut.mockResolvedValue({ error: null }); mocks.cleanupPush.mockResolvedValue(undefined) })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('logs out even when the browser push API fails', async () => {
    mocks.cleanupPush.mockRejectedValue(new Error('Push unavailable'))
    renderLayout()
    fireEvent.click(mobileLogoutButton())
    await screen.findByRole('heading', { name: 'Login' })
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('does not let stalled push cleanup block logout', async () => {
    vi.useFakeTimers()
    mocks.cleanupPush.mockReturnValue(new Promise(() => {}))
    renderLayout()
    fireEvent.click(mobileLogoutButton())
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(screen.getByRole('heading', { name: 'Login' })).toBeTruthy()
  })

  it('reports a logout failure and allows a retry', async () => {
    mocks.signOut.mockResolvedValueOnce({ error: new Error('Offline') })
    renderLayout()
    fireEvent.click(mobileLogoutButton())
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível sair')
    fireEvent.click(mobileLogoutButton())
    await screen.findByRole('heading', { name: 'Login' })
  })
})
