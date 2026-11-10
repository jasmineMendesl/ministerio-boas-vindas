import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({ from: vi.fn(), remove: vi.fn(), result: { data: [{ id: 'schedule-1' }] as { id: string }[], error: null as { message: string } | null } }))
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ role: 'admin', session: { user: { id: 'admin-1' } } }) }))
vi.mock('../../lib/supabase', () => ({ supabase: { from: mocks.from } }))
import { SchedulePage } from './SchedulePage'

describe('schedule deletion', () => {
  beforeEach(() => {
    mocks.result = { data: [{ id: 'schedule-1' }], error: null }
    mocks.remove.mockReturnValue({ eq: () => ({ select: async () => mocks.result }) })
    mocks.from.mockImplementation((table: string) => {
      const query = {
        select: () => query, order: () => query, eq: () => query, delete: mocks.remove,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === 'ministry_schedules' ? [{
          id: 'schedule-1', service_date: '2099-12-12', service_label: 'Domingo às 10h', published_at: null, special_observation: null,
        }] : [], error: null }).then(resolve),
      }
      return query
    })
  })
  afterEach(cleanup)

  async function openConfirmation() {
    render(<MemoryRouter><SchedulePage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /Excluir escala de/ }))
    return within(screen.getByRole('alertdialog'))
  }

  it('uses an in-page confirmation and only removes the card after a confirmed deletion', async () => {
    const dialog = await openConfirmation()
    expect(mocks.remove).not.toHaveBeenCalled()
    fireEvent.click(dialog.getByRole('button', { name: 'Excluir escala' }))
    await screen.findByText('Escala excluída.')
    expect(screen.queryByRole('button', { name: /Excluir escala de/ })).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('cancels without deleting', async () => {
    const dialog = await openConfirmation()
    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }))
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Excluir escala de/ })).toBeTruthy()
  })

  it.each(['no rows', 'database error'])('keeps the schedule and reports %s', async failure => {
    mocks.result = { data: [], error: failure === 'database error' ? { message: 'denied' } : null }
    const dialog = await openConfirmation()
    fireEvent.click(dialog.getByRole('button', { name: 'Excluir escala' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Excluir escala de/ })).toBeTruthy()
    expect(screen.queryByText('Escala excluída.')).toBeNull()
  })
})
