import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const database = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'team-1' } }, role: 'team' }) }))
vi.mock('../../lib/supabase', () => ({ supabase: database }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,demo') } }))

import { VisitorsPage } from './VisitorsPage'

describe('visitor registration count', () => {
  afterEach(cleanup)

  it('adds manual registrations to the QR form total, fill rate and default list', async () => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const visit = (id: string, source: 'qr' | 'staff', name: string) => ({
      id, person_id: id, source, registered_at: now.toISOString(), visited_on: today,
      contact_consent: false, prayer: null,
      person: { id, full_name: name, phone_normalized: '+5511999991000' },
    })
    const visitors = [visit('qr-1', 'qr', 'Pessoa QR'), visit('staff-1', 'staff', 'Pessoa da equipe')]
    database.from.mockImplementation((table: string) => {
      const data = table === 'visitors' ? [...visitors] : table === 'visitor_service_gift_reports' ? [{
        id: 'report-1', service_date: today, service_label: 'Domingo às 18h', gifts_delivered: 4,
        responsible_user_id: 'team-1', responsible_profile: { display_name: 'Equipe' },
      }] : []
      const query = {
        select: () => query, order: () => query, in: () => query,
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
      }
      return query
    })
    database.rpc.mockImplementation(async () => {
      visitors.push(visit('staff-2', 'staff', 'Novo visitante'))
      return { error: null }
    })

    render(<MemoryRouter><VisitorsPage /></MemoryRouter>)
    const registrations = () => screen.getByText('Cadastros de visitantes').closest('article')!
    const fillRate = () => screen.getByText('Taxa de Preenchimento').closest('article')!
    await screen.findByText('Pessoa da equipe')
    expect(within(registrations()).getByText('2')).toBeTruthy()
    expect(within(fillRate()).getByText('50%')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Fechamento de mimos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar Visitante' }))
    fireEvent.change(screen.getByLabelText(/Seu nome/), { target: { value: 'Novo visitante' } })
    fireEvent.change(screen.getByLabelText(/Telefone com DDD/), { target: { value: '(11) 99999-1000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }))

    await screen.findByText('Novo visitante')
    expect(database.rpc).toHaveBeenCalledWith('register_staff_visitor_details', expect.objectContaining({
      p_full_name: 'Novo visitante', p_phone_normalized: '+5511999991000',
    }))
    expect(within(registrations()).getByText('3')).toBeTruthy()
    expect(within(fillRate()).getByText('75%')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
