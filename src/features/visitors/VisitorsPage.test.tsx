import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const visitorAuth = vi.hoisted(() => ({ email: 'equipe@exemplo.org' }))

vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { email: visitorAuth.email } }, loading: false }),
}))

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,qr-demo') } }))

import { VisitorsPage } from './VisitorsPage'

describe('tela de visitantes em modo de demonstração', () => {
  afterEach(() => cleanup())

  it('exibe indicadores, aviso de demonstração e QR Code sem botão de detalhes ou contador de visitas', async () => {
    render(<VisitorsPage />)

    expect(screen.getByText(/Modo de demonstração/)).toBeTruthy()
    expect(screen.getByText('Visitantes do mês')).toBeTruthy()
    expect(screen.getByText('Visitantes de hoje')).toBeTruthy()
    expect(screen.getByText('Lembrancinhas entregues')).toBeTruthy()
    expect(await screen.findByRole('img', { name: /QR Code para abrir/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Abrir formulário/ }).getAttribute('href')).toContain('/visitante')
    expect(screen.queryByRole('button', { name: /Detalhes/ })).toBeNull()
    expect(screen.queryByText(/\b\d+ visitas?\b/)).toBeNull()
  })

  it('permite registrar uma única lembrancinha apenas para a primeira visita', async () => {
    render(<VisitorsPage />)
    fireEvent.change(screen.getByLabelText('Filtrar por mês'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Filtrar por ano'), { target: { value: '0' } })

    const recurringVisitor = screen.getByText('Visitante Demonstração 03').closest('article')
    expect(recurringVisitor).toBeTruthy()
    expect(recurringVisitor?.querySelector('button')).toBeNull()
    expect(recurringVisitor?.textContent).toContain('Indisponível para visita recorrente')

    fireEvent.click(screen.getByRole('button', { name: /Cadastrar visitante/ }))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Visitante de Teste 01' } })
    fireEvent.change(screen.getByLabelText('Telefone com DDD'), { target: { value: '(11) 99999-1000' } })
    fireEvent.click(screen.getByRole('button', { name: /Adicionar visita/ }))
    const firstVisitVisitor = (await screen.findByText('Visitante de Teste 01')).closest('article')
    const deliverButton = firstVisitVisitor?.querySelector('button')
    expect(deliverButton?.textContent).toContain('Registrar entrega')
    fireEvent.click(deliverButton!)

    await waitFor(() => expect(screen.getByText(/Entrega adicionada aos dados de demonstração/)).toBeTruthy())
    expect(firstVisitVisitor?.textContent).toContain('equipe@exemplo.org')
    expect(firstVisitVisitor?.querySelector('button')).toBeNull()
    expect(screen.getByText(/não foi gravada no Supabase/)).toBeTruthy()
  })
})
