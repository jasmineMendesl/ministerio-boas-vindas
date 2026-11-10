import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ role: 'admin', from: vi.fn(), save: vi.fn(), invoke: vi.fn() }))
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ role: mocks.role, session: { user: { id: 'admin-1' } } }) }))
vi.mock('../../lib/supabase', () => ({ supabase: { from: mocks.from, rpc: mocks.save, functions: { invoke: mocks.invoke } } }))
import { ExtraSchedulesPanel } from './ExtraSchedulesPanel'

describe('extra schedules', () => {
  beforeEach(() => {
    mocks.role = 'admin'
    mocks.save.mockResolvedValue({ data: {
      id: 'extra-1', title: 'Encontro especial', event_date: '2026-12-12', members_needed: 8,
      event_time: '17:00:00', member_ids: ['member-1'], special_observation: null,
    }, error: null })
    mocks.from.mockImplementation((table: string) => {
      const query = { select: () => query, eq: () => query, order: async () => ({ data: table === 'profiles' ? [{ id: 'member-1', display_name: 'Pessoa selecionada' }] : [], error: null }) }
      return query
    })
    mocks.invoke.mockResolvedValue({ data: { configured: true, sent: 3 }, error: null })
  })
  afterEach(cleanup)

  async function submit() {
    render(<ExtraSchedulesPanel />)
    await screen.findByText('Nenhuma escala extra cadastrada.')
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Encontro especial' } })
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-12-12' } })
    fireEvent.change(screen.getByLabelText('Horário'), { target: { value: '17:00' } })
    fireEvent.change(screen.getByLabelText('Quantidade de membros necessários'), { target: { value: '8' } })
    fireEvent.click(screen.getByLabelText('Pessoa selecionada'))
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar e notificar equipe' }))
  }

  it('saves the requested fields and notifies the team after saving', async () => {
    await submit()
    await screen.findByText('Escala extra salva e notificação enviada para 3 dispositivo(s).')
    expect(mocks.save).toHaveBeenCalledWith('save_extra_schedule', { p_title: 'Encontro especial', p_event_date: '2026-12-12', p_event_time: '17:00', p_members_needed: 8, p_member_ids: ['member-1'], p_special_observation: null, p_schedule_id: null })
    expect(mocks.invoke).toHaveBeenCalledWith('notify-extra-schedule', { body: { scheduleId: 'extra-1' } })
    expect(screen.getByText('8 membros necessários')).toBeTruthy()
  })

  it('keeps the saved schedule when push fails and allows retrying without another insert', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { message: 'offline' } })
    await submit()
    await screen.findByText(/Não foi possível enviar a notificação/)
    expect(screen.getByText('Encontro especial')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Notificar equipe' }))
    await screen.findByText('Escala extra salva e notificação enviada para 3 dispositivo(s).')
    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(mocks.invoke).toHaveBeenCalledTimes(2)
  })

  it('does not send a notification if saving fails', async () => {
    mocks.save.mockResolvedValueOnce({ data: null, error: { message: 'denied' } })
    await submit()
    await screen.findByRole('alert')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('allows members to consult schedules without creation or notification controls', async () => {
    mocks.role = 'team'
    render(<ExtraSchedulesPanel />)
    await screen.findByText('Nenhuma escala extra cadastrada.')
    expect(screen.queryByLabelText('Título')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('only deletes after confirmation and removes the saved extra schedule', async () => {
    await submit()
    await screen.findByText('Escala extra salva e notificação enviada para 3 dispositivo(s).')
    const remove = vi.fn(() => ({ eq: vi.fn(() => ({ select: async () => ({ data: [{ id: 'extra-1' }], error: null }) })) }))
    mocks.from.mockReturnValue({ delete: remove })
    fireEvent.click(screen.getByRole('button', { name: 'Excluir escala extra Encontro especial' }))
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir escala extra Encontro especial' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir escala' }))
    await screen.findByText('Escala extra excluída.')
    expect(screen.queryByText('Encontro especial')).toBeNull()
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('keeps the extra schedule and confirmation open if no row was deleted', async () => {
    await submit()
    await screen.findByText('Escala extra salva e notificação enviada para 3 dispositivo(s).')
    mocks.from.mockReturnValue({ delete: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) })
    fireEvent.click(screen.getByRole('button', { name: 'Excluir escala extra Encontro especial' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir escala' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Encontro especial' })).toBeTruthy()
  })

  it('edits the time and selected members of a saved extra schedule', async () => {
    await submit()
    await screen.findByText('Escala extra salva e notificação enviada para 3 dispositivo(s).')
    fireEvent.click(screen.getByRole('button', { name: 'Editar escala' }))
    fireEvent.change(screen.getByLabelText('Horário'), { target: { value: '18:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e notificar equipe' }))
    await screen.findByRole('button', { name: 'Cadastrar e notificar equipe' })
    expect(mocks.save).toHaveBeenLastCalledWith('save_extra_schedule', expect.objectContaining({ p_schedule_id: 'extra-1', p_event_time: '18:30', p_member_ids: ['member-1'] }))
  })

  it('requires selected members before saving or sending an assignment notice', async () => {
    render(<ExtraSchedulesPanel />)
    await screen.findByText('Nenhuma escala extra cadastrada.')
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Encontro' } })
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-12-12' } })
    fireEvent.change(screen.getByLabelText('Horário'), { target: { value: '17:00' } })
    fireEvent.change(screen.getByLabelText('Quantidade de membros necessários'), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar e notificar equipe' }))
    await screen.findByRole('alert')
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})
