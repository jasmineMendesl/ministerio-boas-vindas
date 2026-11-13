import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { rpc, invoke, query } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), query: vi.fn() }))
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'staff-id' } } }) }))
vi.mock('../../lib/supabase', () => ({ supabase: { from: query, rpc, functions: { invoke } } }))
import { DecisionRegistrationPage, DecisionsModule } from './DecisionsPage'
import { churchDate } from '../../lib/church-date'
import { addDecision } from './decision-data'

beforeEach(() => {
  vi.clearAllMocks()
  const builder = { select: vi.fn(), order: vi.fn(), gte: vi.fn(), is: vi.fn(), limit: vi.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) }
  for (const method of ['select', 'order', 'gte', 'is', 'limit'] as const) builder[method].mockReturnValue(builder)
  query.mockReturnValue(builder)
})
afterEach(() => { cleanup(); vi.useRealTimers() })

function openForm() {
  render(<MemoryRouter initialEntries={['/decisoes/nova']}><Routes><Route path="/decisoes" element={<DecisionsModule />}><Route path="nova" element={<DecisionRegistrationPage />} /><Route index element={<p>Lista de decisões</p>} /></Route></Routes></MemoryRouter>)
  fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Pessoa Teste' } })
  fireEvent.change(screen.getByLabelText(/WhatsApp/), { target: { value: '(11) 99999-0001' } })
  return screen.getByRole('button', { name: 'Registrar decisão' }).closest('form')!
}

it('envia somente uma requisição para cinco tentativas durante o salvamento', async () => {
  let finish!: (value: unknown) => void
  rpc.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const form = openForm()
  for (let attempt = 0; attempt < 5; attempt++) fireEvent.submit(form)
  expect(rpc).toHaveBeenCalledTimes(1)
  expect((screen.getByRole('button', { name: 'Registrando...' }) as HTMLButtonElement).disabled).toBe(true)
  finish({ data: 'decision-id', error: null })
  expect(await screen.findByText('Lista de decisões')).toBeTruthy()
  expect(invoke).toHaveBeenCalledTimes(1)
})

it('explica a duplicação recusada pelo banco e libera o formulário após falha', async () => {
  rpc.mockResolvedValue({ data: null, error: { code: '23505' } })
  const form = openForm()
  fireEvent.submit(form)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Já existe uma decisão'))
  expect(invoke).not.toHaveBeenCalled()
  await waitFor(() => expect((screen.getByRole('button', { name: 'Registrar decisão' }) as HTMLButtonElement).disabled).toBe(false))
  rpc.mockRejectedValue(new Error('offline'))
  fireEvent.submit(form)
  expect(await screen.findByText(/Não foi possível confirmar o registro/)).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Registrar decisão' }) as HTMLButtonElement).disabled).toBe(false)
})

it('usa o dia de São Paulo após 21h, mesmo quando o UTC já está no dia seguinte', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-13T00:35:00Z'))
  rpc.mockReturnValue(new Promise(() => {}))
  const form = openForm()
  const date = screen.getByLabelText(/Data da decisão/) as HTMLInputElement
  expect(date.value).toBe('2026-11-12')
  expect(date.max).toBe('2026-11-12')
  fireEvent.submit(form)
  expect(rpc).toHaveBeenCalledWith('register_staff_decision', expect.objectContaining({ p_decided_on: '2026-11-12' }))
  const input = { fullName: 'Pessoa Teste', phone: '(11) 99999-0001', type: 'acceptance' as const, baptized: false, interestedInBaptism: false, acceptsMessages: true, decidedOn: '2026-11-13', observations: '' }
  expect(addDecision([], input)).toEqual({ ok: false, error: 'date' })
  expect(churchDate(new Date('2026-11-13T02:59:59Z'))).toBe('2026-11-12')
  expect(churchDate(new Date('2026-11-13T03:00:00Z'))).toBe('2026-11-13')
})
