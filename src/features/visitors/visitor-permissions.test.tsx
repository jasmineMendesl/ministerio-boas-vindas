import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const auth = vi.hoisted(() => ({ role: 'team' as 'team' | 'admin' }))
const database = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'user-1' } }, role: auth.role }) }))
vi.mock('../../lib/supabase', () => ({ supabase: database }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,demo') } }))

import { VisitorsPage } from './VisitorsPage'

describe('visitor permissions', () => {
  afterEach(cleanup)

  it.each(['team', 'admin'] as const)('limits visitor actions for %s', async role => {
    auth.role = role
    let visible = true
    const now = new Date()
    database.rpc.mockImplementation(async () => { visible = false; return { error: null } })
    database.from.mockImplementation((table: string) => {
      const data = table === 'visitors' && visible ? [{
        id: 'visit-1', person_id: 'person-1', source: 'staff', registered_at: now.toISOString(),
        visited_on: now.toISOString().slice(0, 10), contact_consent: false, prayer: null,
        person: { id: 'person-1', full_name: 'Visitante Teste', phone_normalized: '+5511999990001' },
      }] : []
      const query = {
        select: () => query, order: () => query, in: () => query,
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
      }
      return query
    })
    render(<MemoryRouter><VisitorsPage /></MemoryRouter>)
    await screen.findByText('Visitante Teste')
    expect(screen.getByRole('button', { name: 'Cadastrar Visitante' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes de Visitante Teste' }))
    expect(screen.getByRole('dialog', { name: 'Visitante Teste' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar detalhes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar informação para Visitante Teste' }))
    expect(screen.getByRole('textbox', { name: 'Informação para a equipe' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    if (role === 'team') {
      expect(screen.queryByRole('button', { name: 'Editar visitante Visitante Teste' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Excluir visitante Visitante Teste' })).toBeNull()
      expect(database.rpc).not.toHaveBeenCalled()
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Editar visitante Visitante Teste' }))
      expect(screen.getByRole('textbox', { name: /Nome completo/ }).getAttribute('value')).toBe('Visitante Teste')
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      fireEvent.click(screen.getByRole('button', { name: 'Excluir visitante Visitante Teste' }))
      expect(database.rpc).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Excluir cadastro' }))
      await screen.findByText('Cadastro de visitante excluído.')
      expect(database.rpc).toHaveBeenCalledWith('delete_staff_visitor', { p_person_id: 'person-1' })
    }
  })
})
