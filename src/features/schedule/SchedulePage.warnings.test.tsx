import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn() }))
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ role: 'admin', session: { user: { id: 'admin-1' } } }) }))
vi.mock('../../lib/supabase', () => ({ supabase: { from: mocks.from } }))
import { SchedulePage } from './SchedulePage'

describe('schedule assignment warnings', () => {
  afterEach(cleanup)
  it('allows a gray Thursday volunteer on Sunday and shows the previous-week badge after selection', async () => {
    const sunday = new Date()
    sunday.setDate(sunday.getDate() + ((7 - sunday.getDay()) % 7))
    const date = (offset: number) => {
      const value = new Date(sunday)
      value.setDate(value.getDate() + offset)
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    }
    const assignments = [
      { id: 'previous-assignment', schedule_id: 'previous', volunteer_profile_id: 'person-1', ministry_role: 'portaria' },
      { id: 'thursday-assignment', schedule_id: 'thursday', volunteer_profile_id: 'person-1', ministry_role: 'seat_direction' },
    ]
    mocks.insert.mockImplementation(async input => { assignments.push({ id: 'new', ...input }); return { error: null } })
    mocks.from.mockImplementation((table: string) => {
      const data = table === 'ministry_schedules' ? [
        { id: 'current', service_date: date(0), service_label: 'Domingo às 10h', published_at: null, special_observation: null },
        { id: 'previous', service_date: date(-7), service_label: 'Domingo às 10h', published_at: date(-7), special_observation: null },
        { id: 'thursday', service_date: date(-3), service_label: 'Quinta às 19h15', published_at: null, special_observation: null },
      ] : table === 'ministry_schedule_assignments' ? [...assignments] : table === 'profiles' ? [{ id: 'person-1', display_name: 'Pessoa Teste' }] : []
      const query = { select: () => query, order: () => query, eq: () => query, insert: mocks.insert,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) }
      return query
    })
    render(<MemoryRouter><SchedulePage /></MemoryRouter>)
    const sundayButton = await screen.findByRole('button', { name: /Domingo às 10h.*Rascunho/ })
    fireEvent.click(within(sundayButton.closest('section')!).getByRole('button', { name: 'Editar escala' }))
    const select = screen.getByRole('combobox', { name: 'Selecionar voluntário para Portaria' })
    const option = screen.getAllByRole('option', { name: 'Pessoa Teste — já escalado na quinta' })[0]
    expect(option.hasAttribute('disabled')).toBe(false)
    expect(option.classList.contains('text-gray-400')).toBe(true)
    fireEvent.change(select, { target: { value: 'person-1' } })
    await screen.findByText('essa pessoa serviu nesse culto na semana passada')
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ schedule_id: 'current', volunteer_profile_id: 'person-1', ministry_role: 'portaria' }))
  })
})
