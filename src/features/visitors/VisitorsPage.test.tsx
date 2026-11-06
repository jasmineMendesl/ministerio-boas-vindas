import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const visitorAuth = vi.hoisted(() => ({ email: 'equipe@example.org' }))
const giftSupabase = vi.hoisted(() => {
  const query: Record<string, any> = {}
  query.select = vi.fn(() => query)
  query.order = vi.fn(() => query)
  query.insert = vi.fn(async () => ({ error: null }))
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve, reject)
  return { from: vi.fn(() => query), query }
})

vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'auth-team-1', email: visitorAuth.email } }, role: 'team', loading: false }) }))
vi.mock('../../lib/supabase', () => ({ supabase: giftSupabase }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,qr-demo') } }))

import { VisitorsPage } from './VisitorsPage'

describe('Visitors screen', () => {
  afterEach(() => cleanup())

  it('shows visitor demos and the Supabase gift report section', async () => {
    render(<VisitorsPage />)
    expect(screen.getByRole('heading', { name: 'Visitantes' })).toBeTruthy()
    expect(screen.getByText('Mimos reportados')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Fechamento de mimos por culto' })).toBeTruthy()
    expect(screen.getAllByText(/Demonstra/).length).toBeGreaterThan(0)
    expect(await screen.findByRole('img', { name: /QR Code do formul/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Abrir formulário/ }).getAttribute('href')).toContain('/visitante')
    expect(screen.queryByText(/Material de recepção e acolhimento|Instruções para Voluntários|Baixar PDF/)).toBeNull()
  })

  it('shows the fictional prayer request in visitor details', () => {
    render(<VisitorsPage />)
    fireEvent.change(screen.getByLabelText(/Filtrar m/), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText(/Filtrar ano/), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes de Visitante Demonstra.*03/ }))
    expect(screen.getByRole('dialog').textContent).toContain('Pedido fict')
  })

  it('saves the service date, slot, gift count and authenticated leader id to Supabase', async () => {
    render(<VisitorsPage />)
    fireEvent.click(screen.getByRole('button', { name: /Registrar fechamento/ }))
    fireEvent.change(screen.getByLabelText(/Quantidade de mimos/), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar fechamento/ }))
    await screen.findByText(/registrado no Supabase/)
    expect(giftSupabase.query.insert).toHaveBeenCalledWith(expect.objectContaining({
      service_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      service_label: 'Domingo - Noite (18:30)',
      gifts_delivered: 6,
      responsible_user_id: 'auth-team-1',
    }))
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
    expect(screen.getByText(/Entregue em/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Registrar entrega de marca-p/ })).toBeNull()
  })
})
