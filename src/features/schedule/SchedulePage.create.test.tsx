import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ role: 'admin', session: { user: { id: 'admin-1' } } }) }))
vi.mock('../../lib/supabase', () => ({ supabase: mocks }))
import { SchedulePage } from './SchedulePage'

describe('create a schedule with volunteers', () => {
  beforeEach(() => {
    const schedules: unknown[] = []
    const assignments: unknown[] = []
    mocks.from.mockImplementation((table: string) => {
      const data = table === 'profiles' ? [{ id: 'person-1', display_name: 'Bruna' }] : table === 'ministry_schedules' ? [...schedules] : table === 'ministry_schedule_assignments' ? [...assignments] : []
      const query = { select: () => query, order: () => query, eq: () => query,
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) }
      return query
    })
    mocks.rpc.mockImplementation(async (_name, input) => {
      schedules.push({ id: 'new-schedule', service_date: input.p_service_date, service_label: input.p_service_label, published_at: null, special_observation: input.p_special_observation })
      assignments.push(...input.p_assignments.map((item: object, index: number) => ({ ...item, id: `assignment-${index}`, schedule_id: 'new-schedule' })))
      return { data: 'new-schedule', error: null }
    })
  })
  afterEach(cleanup)

  async function openModal() {
    render(<MemoryRouter><SchedulePage /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Nenhuma escala aberta' })
    fireEvent.change(screen.getByLabelText('Dia do culto'), { target: { value: '2099-12-12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar escala' }))
    return within(await screen.findByRole('dialog', { name: 'Selecionar voluntários' }))
  }

  it('opens a draft modal and cancels without creating a schedule', async () => {
    const modal = await openModal()
    expect(mocks.rpc).not.toHaveBeenCalled()
    fireEvent.click(modal.getByRole('checkbox', { name: 'Bruna' }))
    fireEvent.click(modal.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('validates the team, saves all assignments together and returns to the normal schedule', async () => {
    const modal = await openModal()
    fireEvent.click(modal.getByRole('button', { name: 'Salvar' }))
    expect(modal.getByRole('alert').textContent).toContain('Selecione pelo menos um')
    fireEvent.click(modal.getByRole('checkbox', { name: 'Bruna' }))
    fireEvent.click(modal.getByRole('button', { name: 'Salvar' }))
    expect(modal.getByRole('alert').textContent).toContain('função principal')
    fireEvent.change(modal.getByRole('combobox', { name: 'Função principal de Bruna' }), { target: { value: 'portaria' } })
    fireEvent.click(modal.getByRole('checkbox', { name: 'Líder' }))
    fireEvent.click(modal.getByRole('button', { name: 'Salvar' }))
    await screen.findByText(/Escala criada com os voluntários selecionados/)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.rpc).toHaveBeenCalledWith('create_ministry_schedule_with_assignments', {
      p_service_date: '2099-12-12', p_service_label: 'Domingo às 10h', p_special_observation: null,
      p_assignments: [{ volunteer_profile_id: 'person-1', ministry_role: 'portaria' }, { volunteer_profile_id: 'person-1', ministry_role: 'leader' }],
    })
    expect(screen.getByRole('button', { name: 'Editar escala' })).toBeTruthy()
  })

  it('keeps the team selected when saving fails and allows retrying', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'network' } })
    const modal = await openModal()
    fireEvent.click(modal.getByRole('checkbox', { name: 'Bruna' }))
    fireEvent.change(modal.getByRole('combobox', { name: 'Função principal de Bruna' }), { target: { value: 'seat_direction' } })
    fireEvent.click(modal.getByRole('button', { name: 'Salvar' }))
    await modal.findByRole('alert')
    expect((modal.getByRole('combobox') as HTMLSelectElement).value).toBe('seat_direction')
    fireEvent.click(modal.getByRole('button', { name: 'Salvar' }))
    await screen.findByText(/Escala criada com os voluntários selecionados/)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
