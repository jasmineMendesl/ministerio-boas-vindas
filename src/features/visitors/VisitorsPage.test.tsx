import { afterEach, describe, expect, it, vi } from 'vitest'
import { beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const visitorAuth = vi.hoisted(() => ({ email: 'equipe@example.org', role: 'team' as 'team' | 'admin' }))
const giftSupabase = vi.hoisted(() => {
  const query: Record<string, any> = {}
  const state: { rows: unknown[] } = { rows: [] }
  query.select = vi.fn(() => query)
  query.order = vi.fn(() => query)
  query.insert = vi.fn(async () => ({ error: null }))
  query.delete = vi.fn(() => query)
  query.eq = vi.fn(async () => { state.rows = []; return { error: null } })
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve({ data: state.rows, error: null }).then(resolve, reject)
  return { from: vi.fn(() => query), query, state }
})

vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'auth-team-1', email: visitorAuth.email } }, role: visitorAuth.role, loading: false }) }))
vi.mock('../../lib/supabase', () => ({ supabase: giftSupabase }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,qr-demo') } }))

import { VisitorsPage } from './VisitorsPage'

describe('Visitors screen', () => {
  afterEach(() => cleanup())
  beforeEach(() => {
    visitorAuth.role = 'team'
    giftSupabase.state.rows = []
    giftSupabase.query.insert.mockClear()
    giftSupabase.query.delete.mockClear()
    giftSupabase.query.eq.mockClear()
  })

  it('shows visitor demos and the Supabase gift report section', async () => {
    render(<VisitorsPage />)
    expect(screen.getByRole('heading', { name: 'Visitantes' })).toBeTruthy()
    expect(screen.getByText('Mimos reportados')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Fechamento de mimos por culto' })).toBeTruthy()
    expect(screen.getAllByText(/Demonstra/).length).toBeGreaterThan(0)
    expect(await screen.findByRole('img', { name: /QR Code do formul/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Abrir formulário/ }).getAttribute('href')).toContain('/visitante')
    expect(screen.queryByText(/Material de recepção e acolhimento|Instruções para Voluntários|Baixar PDF/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Excluir fechamento/ })).toBeNull()
  })

  it('shows the fictional prayer request in visitor details', () => {
    render(<VisitorsPage />)
    fireEvent.change(screen.getByLabelText(/Filtrar m/), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText(/Filtrar ano/), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes de Visitante Demonstra.*03/ }))
    expect(screen.getByRole('dialog').textContent).toContain('Pedido fict')
    expect(screen.getByRole('dialog').textContent).not.toContain('Marca-página / Kit')
    expect(screen.getByRole('dialog').textContent).not.toContain('Entregue em')
  })

  it('saves the service date, slot, gift count and authenticated leader id to Supabase', async () => {
    render(<VisitorsPage />)
    fireEvent.click(screen.getByRole('button', { name: /Registrar fechamento/ }))
    fireEvent.change(screen.getByLabelText(/Quantidade de mimos/), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: /Revisar fechamento/ }))
    expect(screen.getByRole('dialog', { name: /Confirme os dados do fechamento/ })).toBeTruthy()
    expect(giftSupabase.query.insert).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Confirmar e salvar/ }))
    await screen.findByText(/registrado no Supabase/)
    expect(giftSupabase.query.insert).toHaveBeenCalledWith(expect.objectContaining({
      service_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      service_label: 'Domingo - Noite (18:30)',
      gifts_delivered: 6,
      responsible_user_id: 'auth-team-1',
    }))
  })

  it('allows admins to delete a gift report only after confirmation', async () => {
    visitorAuth.role = 'admin'
    giftSupabase.state.rows = [{
      id: 'report-1', service_date: '2026-11-01', service_label: 'Domingo - Noite (18:30)', gifts_delivered: 6,
      responsible_user_id: 'auth-team-1', responsible_profile: { display_name: 'Líder de exemplo' },
    }]
    render(<VisitorsPage />)
    expect(await screen.findByText('Líder de exemplo')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Excluir fechamento de/ }))
    expect(screen.getByRole('alertdialog', { name: /Excluir fechamento/ })).toBeTruthy()
    expect(giftSupabase.query.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir fechamento' }))
    await screen.findByText('Fechamento excluído.')
    expect(giftSupabase.query.delete).toHaveBeenCalledOnce()
    expect(giftSupabase.query.eq).toHaveBeenCalledWith('id', 'report-1')
  })

  it('keeps local visitor annotations and first visit gift actions working', async () => {
    render(<VisitorsPage />)
    fireEvent.change(screen.getByLabelText(/Filtrar m/), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText(/Filtrar ano/), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes de Visitante Demonstra.*03/ }))
    expect(screen.queryByRole('button', { name: /Registrar entrega de marca-p/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Fechar detalhes/ }))

    fireEvent.click(screen.getByRole('button', { name: /Adicionar informa.*Visitante Exemplo 02/ }))
    fireEvent.change(screen.getByLabelText(/Informa.*equipe/), { target: { value: 'Receive at main entrance.' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar informa/ }))
    expect(await screen.findByText(/interna salva apenas/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Cadastrar Visitante/ }))
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Visitante de Teste 01' } })
    fireEvent.change(screen.getByLabelText(/Telefone/), { target: { value: '(11) 99999-1000' } })
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar$/ }))
    await screen.findByText('Visitante de Teste 01')
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes de Visitante de Teste 01/ }))
    fireEvent.click(screen.getByRole('button', { name: /Registrar entrega de marca-p/ }))
    await waitFor(() => expect(screen.getByText(/Entrega do marca-p/)).toBeTruthy())
    expect(screen.getByRole('dialog').textContent).not.toContain('Entregue em')
    expect(screen.queryByRole('button', { name: /Registrar entrega de marca-p/ })).toBeNull()
  })
})
