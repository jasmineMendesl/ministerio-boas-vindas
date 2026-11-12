import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), from: vi.fn(), profile: vi.fn(), listener: null as null | ((event: string, session: unknown) => void) }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange }, from: mocks.from } }))
import { AuthProvider, useAuth } from './AuthProvider'

function Status() {
  const { session, role, loading } = useAuth()
  return <p role="status">{loading ? 'loading' : session ? role : 'signed out'}</p>
}

describe('auth state changes', () => {
  beforeEach(() => {
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    mocks.onAuthStateChange.mockImplementation(listener => {
      mocks.listener = listener
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    mocks.profile.mockResolvedValue({ data: { role: 'team', active: true, display_name: 'Equipe' }, error: null })
    mocks.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }))
  })
  afterEach(cleanup)

  it('loads the profile outside the auth callback and handles signout', async () => {
    render(<AuthProvider><Status /></AuthProvider>)
    await screen.findByText('signed out')
    act(() => {
      mocks.listener?.('SIGNED_IN', { user: { id: 'user-1' }, access_token: 'token' })
      // The callback must return before any database call starts.
      expect(mocks.from).not.toHaveBeenCalled()
    })
    await screen.findByText('team')
    act(() => mocks.listener?.('SIGNED_OUT', null))
    await screen.findByText('signed out')
  })

  it('ignores a profile response that finishes after logout', async () => {
    let resolveProfile!: (result: unknown) => void
    mocks.profile.mockReturnValue(new Promise(resolve => { resolveProfile = resolve }))
    render(<AuthProvider><Status /></AuthProvider>)
    await screen.findByText('signed out')
    act(() => mocks.listener?.('SIGNED_IN', { user: { id: 'user-1' }, access_token: 'token' }))
    expect(screen.getByText('loading')).toBeTruthy()
    act(() => mocks.listener?.('SIGNED_OUT', null))
    await act(async () => resolveProfile({ data: { role: 'admin', active: true }, error: null }))
    expect(screen.getByText('signed out')).toBeTruthy()
  })
})
