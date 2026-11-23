import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PertencerPage } from './PertencerPage'

const mocks = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn(), upsert: vi.fn(), invoke: vi.fn() }))
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ role: 'admin', session: { user: { id: 'admin' } } }) }))
vi.mock('../../lib/supabase', () => ({ supabase: { from: mocks.from, functions: { invoke: mocks.invoke } } }))

afterEach(cleanup)

it('registers a past edition and saves its agenda without notifying volunteers', async () => {
  const past = { id: 'past', event_date: '2020-01-05', title: 'Café anterior', closed_at: null }
  const upcoming = { id: 'upcoming', event_date: '2099-01-01', title: 'Café futuro', closed_at: null }
  let pastCreated = false
  let agendaRows: unknown[] = []
  mocks.from.mockImplementation((table: string) => {
    let data: unknown[] = table === 'profiles' ? [{ id: 'volunteer', display_name: 'Bruna' }] : []
    const query = {
      select: () => query, order: () => query, in: () => query, is: () => query, limit: () => query,
      gte: () => { data = [upcoming]; return query },
      or: () => { data = pastCreated ? [past] : []; return query },
      eq: (_column: string, value: string) => {
        if (table === 'pertencer_agenda_items' && value === past.id) data = agendaRows
        return query
      },
      insert: (row: unknown) => { mocks.insert(row); pastCreated = true; return query },
      single: async () => ({ data: past, error: null }),
      upsert: async (rows: unknown[]) => { mocks.upsert(rows); agendaRows = rows; return { error: null } },
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
    }
    return query
  })
  render(<PertencerPage />)
  await screen.findByRole('heading', { name: /Próximo Café/ })
  fireEvent.click(screen.getByRole('tab', { name: 'Histórico de cafés' }))
  fireEvent.change(screen.getByLabelText('Data do café'), { target: { value: past.event_date } })
  fireEvent.change(screen.getByLabelText('Nome da edição'), { target: { value: past.title } })
  fireEvent.click(screen.getByRole('button', { name: 'Registrar edição passada' }))

  const volunteer = await screen.findByRole('combobox', { name: 'Voluntário responsável por Oração inicial' })
  fireEvent.change(volunteer, { target: { value: 'volunteer' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar roteiro' }))
  await screen.findByText('Roteiro atualizado no histórico.')
  expect(mocks.insert).toHaveBeenCalledWith({ event_date: past.event_date, title: past.title })
  expect(mocks.upsert).toHaveBeenCalledWith(expect.arrayContaining([{ event_id: past.id, sequence: 1, title: 'Oração inicial', volunteer_profile_id: 'volunteer' }]))
  expect(mocks.invoke).not.toHaveBeenCalled()
  expect(screen.getByRole('heading', { name: /Próximo Café.*2099/ })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Voltar ao histórico' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Ver roteiro' }))
  expect((await screen.findByRole<HTMLSelectElement>('combobox', { name: 'Voluntário responsável por Oração inicial' })).value).toBe('volunteer')
})
