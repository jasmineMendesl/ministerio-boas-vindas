import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({ role: 'admin' as 'admin' | 'team', date: '2099-12-12', from: vi.fn(), remove: vi.fn(), result: { data: [{ id: 'schedule-1' }] as { id: string }[], error: null as { message: string } | null } }))
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ role: mocks.role, session: { user: { id: 'admin-1' } } }) }))
vi.mock('../../lib/supabase', () => ({ supabase: { from: mocks.from } }))
import { SchedulePage } from './SchedulePage'

describe('schedule deletion', () => {
  beforeEach(() => {
    mocks.role = 'admin'
    mocks.date = '2099-12-12'
    mocks.result = { data: [{ id: 'schedule-1' }], error: null }
    mocks.remove.mockReturnValue({ eq: () => ({ select: async () => mocks.result }) })
    mocks.from.mockImplementation((table: string) => {
      const query = {
        select: () => query, order: () => query, eq: () => query, delete: mocks.remove,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === 'ministry_schedules' ? [{
          id: 'schedule-1', service_date: mocks.date, service_label: 'Domingo às 10h', published_at: null, special_observation: null,
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

  it('lets admins cancel and then confirm deletion from history', async () => {
    mocks.date = '2020-11-01'
    render(<MemoryRouter initialEntries={['/?tab=history']}><SchedulePage /></MemoryRouter>)
    const remove = await screen.findByRole('button', { name: /Excluir escala do histórico/ })
    fireEvent.click(remove)
    expect(mocks.remove).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))
    expect(mocks.remove).not.toHaveBeenCalled()
    fireEvent.click(remove)
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir escala' }))
    await screen.findByText('Escala excluída.')
    expect(mocks.remove).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: /Excluir escala do histórico/ })).toBeNull()
  })

  it('keeps history when deletion fails', async () => {
    mocks.date = '2020-11-01'
    mocks.result = { data: [], error: { message: 'denied' } }
    render(<MemoryRouter initialEntries={['/?tab=history']}><SchedulePage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /Excluir escala do histórico/ }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir escala' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: /Excluir escala do histórico/ })).toBeTruthy()
    expect(screen.queryByText('Escala excluída.')).toBeNull()
  })

  it('hides history deletion from team', async () => {
    mocks.date = '2020-11-01'
    mocks.role = 'team'
    render(<MemoryRouter initialEntries={['/?tab=history']}><SchedulePage /></MemoryRouter>)
    await screen.findByRole('button', { name: /Ver escala/ })
    expect(screen.queryByRole('button', { name: /Excluir escala/ })).toBeNull()
  })
})
