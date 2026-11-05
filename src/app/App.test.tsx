import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const authMocks = vi.hoisted(() => ({
  session: null as null | { user: { email: string } },
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  invokeVisitorFunction: vi.fn(),
}))

vi.mock('./AuthProvider', () => ({
  useAuth: () => ({ session: authMocks.session, loading: false }),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { signInWithPassword: authMocks.signInWithPassword, signOut: authMocks.signOut },
    functions: { invoke: authMocks.invokeVisitorFunction },
  },
}))

import { App } from './App'

describe('rotas e autenticação da equipe', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    authMocks.session = null
    authMocks.signInWithPassword.mockResolvedValue({ error: null })
    authMocks.invokeVisitorFunction.mockResolvedValue({ data: { ok: true }, error: null })
  })

  it('redireciona rotas internas para login quando não há sessão', () => {
    render(<MemoryRouter initialEntries={['/visitantes']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeTruthy()
  })

  it('permite navegar entre as quatro áreas quando há sessão', async () => {
    authMocks.session = { user: { email: 'equipe@example.org' } }
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/visitantes']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Visitantes' })).toBeTruthy()
    await user.click(screen.getAllByRole('link', { name: 'Dashboard' })[0])
    expect(screen.getByRole('heading', { name: 'Bom dia, equipe' })).toBeTruthy()
    await user.click(screen.getAllByRole('link', { name: 'Decisões' })[0])
    expect(screen.getByRole('heading', { name: 'Aceitações / Reconciliações' })).toBeTruthy()
    await user.click(screen.getAllByRole('link', { name: 'Pertencer' })[0])
    expect(screen.getByRole('heading', { name: 'Projeto Pertencer' })).toBeTruthy()
  })

  it('envia credenciais ao Supabase e mostra uma mensagem genérica em caso de falha', async () => {
    authMocks.signInWithPassword.mockResolvedValueOnce({ error: { message: 'invalid credentials' } })
    render(<MemoryRouter initialEntries={['/login']}><App /></MemoryRouter>)
    fireEvent.change(screen.getAllByLabelText('E-mail')[0], { target: { value: 'equipe@example.org' } })
    fireEvent.change(screen.getAllByLabelText('Senha')[0], { target: { value: 'not-a-real-password' } })
    await userEvent.click(screen.getAllByRole('button', { name: 'Entrar na equipe' })[0])
    await waitFor(() => expect(authMocks.signInWithPassword).toHaveBeenCalledWith({ email: 'equipe@example.org', password: 'not-a-real-password' }))
    expect(screen.getByRole('alert').textContent).toContain('Confira seu e-mail e sua senha')
  })

  it('mantém o formulário público acessível sem sessão e envia os campos adicionais do cadastro', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/visitante']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Vamos manter contato?' })).toBeTruthy()
    expect(screen.getByLabelText('Seu nome')).toBeTruthy()
    expect(screen.getByLabelText('Telefone com DDD')).toBeTruthy()
    expect(screen.getByLabelText(/Dia em que você foi ao culto/)).toBeTruthy()
    expect(screen.getByLabelText(/Deseja deixar um pedido de oração/)).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: /Aceito receber uma mensagem/ })).toBeTruthy()
    expect(screen.queryByLabelText('E-mail')).toBeNull()
    expect(screen.queryByLabelText('Senha')).toBeNull()
    await user.type(screen.getByLabelText('Seu nome'), 'Marina Exemplo')
    await user.type(screen.getByLabelText('Telefone com DDD'), '11987654321')
    await user.type(screen.getByLabelText(/Deseja deixar um pedido de oração/), 'Ore por nossa família.')
    await user.click(screen.getByRole('checkbox', { name: /Aceito receber uma mensagem/ }))
    await user.click(screen.getByRole('button', { name: 'Enviar meu cadastro' }))
    await waitFor(() => expect(authMocks.invokeVisitorFunction).toHaveBeenCalledWith(
      'public-visitor-register',
      expect.objectContaining({ body: expect.objectContaining({
        name: 'Marina Exemplo',
        phone: '+5511987654321',
        visitedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        prayerRequest: 'Ore por nossa família.',
        contactConsent: true,
        website: '',
        startedAt: expect.any(Number),
      }) }),
    ))
    expect(await screen.findByRole('status')).toBeTruthy()
  })
})
