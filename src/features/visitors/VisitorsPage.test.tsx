import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const visitorAuth = vi.hoisted(() => ({ email: 'equipe@exemplo.org' }))

vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { email: visitorAuth.email } }, loading: false }),
}))

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,qr-demo') },
}))

import { VisitorsPage } from './VisitorsPage'

describe('tela de visitantes em modo de demonstração', () => {
  afterEach(() => cleanup())

  it('exibe os indicadores, sinaliza que os dados são fictícios e mostra um QR Code', async () => {
    render(<VisitorsPage />)

    expect(screen.getByText(/Modo de demonstração/)).toBeTruthy()
    expect(screen.getByText('Visitantes do mês')).toBeTruthy()
    expect(screen.getByText('Visitantes de hoje')).toBeTruthy()
    expect(screen.getByText('Lembrancinhas entregues')).toBeTruthy()
    expect(await screen.findByRole('img', { name: /QR Code para abrir/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Abrir formulário/ }).getAttribute('href')).toContain('/visitante')
  })

  it('adiciona uma visita à pessoa existente e permite registrar uma lembrancinha', async () => {
    render(<VisitorsPage />)

    fireEvent.click(screen.getByRole('button', { name: /Cadastrar visitante/ }))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Nome informado novamente' } })
    fireEvent.change(screen.getByLabelText('Telefone com DDD'), { target: { value: '(11) 90000-0001' } })
    fireEvent.click(screen.getByRole('button', { name: /Adicionar visita/ }))

    expect(await screen.findByText(/nova visita foi adicionada à mesma pessoa/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: /Detalhes/ })[0])
    expect(screen.getByRole('heading', { name: 'Visitante Exemplo 01' })).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Registrar entrega/ }))
    await waitFor(() => expect(screen.getByText(/Entrega adicionada aos dados de demonstração/)).toBeTruthy())
    expect(screen.getByText('Responsável: equipe@exemplo.org')).toBeTruthy()
    expect(screen.getByText(/não são salvas no Supabase/)).toBeTruthy()
  })
})
