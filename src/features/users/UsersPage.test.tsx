import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { UsersPage } from './UsersPage'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: mocks.rpc, functions: { invoke: mocks.invoke } } }))

afterEach(() => { cleanup(); vi.resetAllMocks() })

it('creates a login with the volunteer details and submits a normalized phone', async () => {
  mocks.rpc.mockResolvedValue({ data: [], error: null })
  mocks.invoke.mockResolvedValue({ data: { id: 'new' }, error: null })
  render(<UsersPage />)
  fireEvent.click(screen.getByRole('tab', { name: 'Cadastrar usuário' }))
  const fields = {
    'Nome': 'Bruna Teste', 'E-mail': 'bruna@example.test', 'Telefone com DDD': '(11) 98765-4321',
    'Data de nascimento': '1992-02-29', 'Início no ministério': '2020-03-01', 'Senha inicial': 'senha-teste-123',
  }
  for (const [label, value] of Object.entries(fields)) {
    fireEvent.change(screen.getByLabelText(label, { exact: label !== 'Senha inicial' }), { target: { value } })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Criar usuário' }))
  await screen.findByText(/Usuário cadastrado/)
  expect(mocks.invoke).toHaveBeenCalledWith('create-team-user', {
    body: {
      display_name: fields.Nome, email: fields['E-mail'], phone: '11987654321', birth_date: fields['Data de nascimento'],
      service_start_date: fields['Início no ministério'], password: fields['Senha inicial'],
    },
  })
})

it('shows active birthdays in day order and allows completing older profiles', async () => {
  mocks.rpc.mockResolvedValue({ data: [
    { id: 'one', display_name: 'Bruna', email: 'bruna@example.test', birth_date: '1992-02-29', active: true },
    { id: 'two', display_name: 'Lia', birth_date: '1998-02-02', active: true },
    { id: 'three', display_name: 'Paulo', birth_date: '1980-02-03', active: false },
    { id: 'four', display_name: 'Ana', email: 'ana@example.test', active: true },
  ], error: null })
  render(<UsersPage />)
  fireEvent.click(screen.getByRole('tab', { name: 'Aniversariantes' }))
  fireEvent.change(await screen.findByLabelText('Mês'), { target: { value: '02' } })
  expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['02/02Lia', '29/02Bruna'])
  fireEvent.click(screen.getByRole('tab', { name: 'Equipe' }))
  fireEvent.click(screen.getByRole('button', { name: 'Editar Ana' }))
  fireEvent.change(screen.getByLabelText('Data de nascimento'), { target: { value: '1990-02-12' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar cadastro' }))
  await screen.findByText('Cadastro atualizado.')
  expect(mocks.rpc).toHaveBeenCalledWith('admin_update_team_member_details', {
    p_id: 'four', p_display_name: 'Ana', p_phone: null, p_birth_date: '1990-02-12', p_service_start_date: null,
  })
})
