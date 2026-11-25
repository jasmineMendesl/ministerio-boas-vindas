import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ role: 'admin', session: { user: { id: 'admin-1' } } }) }))
vi.mock('../../lib/supabase', () => ({ supabase: mocks }))
import { SchedulePage } from './SchedulePage'

describe('create a schedule with volunteers', () => {
  let schedules: unknown[]
  let assignments: unknown[]
  let profiles: { id: string; display_name: string }[]

  beforeEach(() => {
    schedules = []
    assignments = []
    profiles = [{ id: 'person-1', display_name: 'Bruna' }, { id: 'person-2', display_name: 'Ana' }]
    mocks.from.mockImplementation((table: string) => {
      const data = table === 'profiles' ? profiles : table === 'ministry_schedules' ? [...schedules] : table === 'ministry_schedule_assignments' ? [...assignments] : []
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
    return within(await screen.findByRole('dialog', { name: 'Distribuir funções' }))
  }

  it('opens a draft modal and cancels without creating a schedule', async () => {
    const modal = await openModal()
    expect(mocks.rpc).not.toHaveBeenCalled()
    fireEvent.change(modal.getByRole('combobox', { name: 'Selecionar voluntário para Portaria' }), { target: { value: 'person-1' } })
    fireEvent.click(modal.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('filters assignments in the same week only when selecting volunteers for a normal service', async () => {
    schedules.push(
      { id: 'same-week', service_date: '2099-12-13', service_label: 'Domingo às 18h', published_at: null, special_observation: null },
      { id: 'previous-week', service_date: '2099-12-06', service_label: 'Domingo às 18h', published_at: null, special_observation: null },
    )
    assignments.push(
      { id: 'same-week-assignment', schedule_id: 'same-week', volunteer_profile_id: 'person-1', ministry_role: 'portaria' },
      { id: 'previous-week-assignment', schedule_id: 'previous-week', volunteer_profile_id: 'person-2', ministry_role: 'portaria' },
    )
    render(<MemoryRouter><SchedulePage /></MemoryRouter>)
    await screen.findAllByText('Domingo às 18h')
    fireEvent.change(screen.getByLabelText('Dia do culto'), { target: { value: '2099-12-13' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar escala' }))
    const modal = within(await screen.findByRole('dialog', { name: 'Distribuir funções' }))
    const portaria = within(modal.getByRole('combobox', { name: 'Selecionar voluntário para Portaria' }))
    expect(portaria.queryByRole('option', { name: 'Bruna' })).toBeNull()
    expect(portaria.getByRole('option', { name: 'Ana' })).toBeTruthy()
    fireEvent.click(modal.getByRole('button', { name: 'Cancelar' }))

    fireEvent.click(screen.getByRole('tab', { name: 'Escala extra' }))
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2099-12-13' } })
    const member = await screen.findByRole<HTMLInputElement>('checkbox', { name: 'Bruna' })
    fireEvent.click(member)
    expect(member.checked).toBe(true)
  })

  it('validates the team, saves all assignments together and returns to the normal schedule', async () => {
    const modal = await openModal()
    fireEvent.click(modal.getByRole('button', { name: 'Salvar' }))
    expect(modal.getByRole('alert').textContent).toContain('Selecione pelo menos um')
    expect(modal.getByRole('combobox', { name: 'Selecionar voluntário para Líder' }).hasAttribute('disabled')).toBe(true)
    fireEvent.change(modal.getByRole('combobox', { name: 'Selecionar voluntário para Portaria' }), { target: { value: 'person-1' } })
    fireEvent.change(modal.getByRole('combobox', { name: 'Selecionar voluntário para Líder' }), { target: { value: 'person-1' } })
    fireEvent.click(modal.getByRole('button', { name: 'Salvar' }))
    await screen.findByText(/Escala criada com os voluntários selecionados/)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.rpc).toHaveBeenCalledWith('create_ministry_schedule_with_assignments', {
      p_service_date: '2099-12-12', p_service_label: 'Domingo às 10h', p_special_observation: null,
      p_assignments: [{ volunteer_profile_id: 'person-1', ministry_role: 'portaria' }, { volunteer_profile_id: 'person-1', ministry_role: 'leader' }],
    })
    expect(screen.getByRole('button', { name: 'Editar escala' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publicar escala' })).toBeTruthy()
  })

  it('lets the admin select and save more than four volunteers for Portaria', async () => {
    profiles.push({ id: 'person-3', display_name: 'Jasmine' }, { id: 'person-4', display_name: 'Mikaelly' }, { id: 'person-5', display_name: 'Naiara' })
    const modal = await openModal()
    const portaria = modal.getByRole<HTMLSelectElement>('combobox', { name: 'Selecionar voluntário para Portaria' })
    for (const person of profiles) {
      expect(portaria.disabled).toBe(false)
      expect(within(portaria).getByRole('option', { name: person.display_name })).toBeTruthy()
      fireEvent.change(portaria, { target: { value: person.id } })
    }
    fireEvent.click(modal.getByRole('button', { name: 'Salvar' }))
    await screen.findByText(/Escala criada com os voluntários selecionados/)
    expect(mocks.rpc).toHaveBeenCalledWith('create_ministry_schedule_with_assignments', expect.objectContaining({
      p_assignments: profiles.map(person => ({ volunteer_profile_id: person.id, ministry_role: 'portaria' })),
    }))
  })

  it('keeps the team selected when saving fails and allows retrying', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'network' } })
    const modal = await openModal()
    fireEvent.change(modal.getByRole('combobox', { name: 'Selecionar voluntário para Direcionamento de assentos' }), { target: { value: 'person-1' } })
    fireEvent.click(modal.getByRole('button', { name: 'Salvar' }))
    await modal.findByRole('alert')
    expect(modal.getByRole('button', { name: 'Remover Bruna de Direcionamento de assentos' })).toBeTruthy()
    fireEvent.click(modal.getByRole('button', { name: 'Salvar' }))
    await screen.findByText(/Escala criada com os voluntários selecionados/)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('removes complementary responsibilities when a volunteer is removed from the primary role', async () => {
    const modal = await openModal()
    fireEvent.change(modal.getByRole('combobox', { name: 'Selecionar voluntário para Portaria' }), { target: { value: 'person-1' } })
    fireEvent.change(modal.getByRole('combobox', { name: 'Selecionar voluntário para Líder' }), { target: { value: 'person-1' } })
    fireEvent.click(modal.getByRole('button', { name: 'Remover Bruna de Portaria' }))
    expect(modal.queryByRole('button', { name: 'Remover Bruna de Líder' })).toBeNull()
    expect(modal.getByRole('combobox', { name: 'Selecionar voluntário para Líder' }).hasAttribute('disabled')).toBe(true)
    fireEvent.change(modal.getByRole('combobox', { name: 'Selecionar voluntário para Direcionamento de assentos' }), { target: { value: 'person-1' } })
    fireEvent.click(modal.getByRole('button', { name: 'Salvar' }))
    await screen.findByText(/Escala criada com os voluntários selecionados/)
    expect(mocks.rpc).toHaveBeenCalledWith('create_ministry_schedule_with_assignments', expect.objectContaining({ p_assignments: [{ volunteer_profile_id: 'person-1', ministry_role: 'seat_direction' }] }))
  })
})
