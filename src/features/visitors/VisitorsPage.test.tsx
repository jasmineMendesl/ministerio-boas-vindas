import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const visitorAuth = vi.hoisted(() => ({ email: 'equipe@exemplo.org' }))

vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ session: { user: { email: visitorAuth.email } }, loading: false }) }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,qr-demo') } }))

import { VisitorsPage } from './VisitorsPage'

describe('tela de visitantes em demonstração', () => {
  afterEach(() => cleanup())

  it('exibe o layout, indicadores, aviso de dados fictícios e QR Code público', async () => {
    render(<VisitorsPage />)

    expect(screen.getByRole('heading', { name: 'Visitantes' })).toBeTruthy()
    expect(screen.getByText(/Demonstração fictícia/)).toBeTruthy()
    expect(screen.getByText('Marca-páginas Entregues')).toBeTruthy()
    expect(screen.getByText('Cadastros via QR Code')).toBeTruthy()
    expect(screen.getByText('Taxa de Preenchimento')).toBeTruthy()
    expect(screen.getByText('Visitantes Cadastrados')).toBeTruthy()
    expect(await screen.findByRole('img', { name: /QR Code do formulário/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Testar formulário/ }).getAttribute('href')).toContain('/visitante')
  })

  it('abre o olho para exibir o pedido de oração fictício', () => {
    render(<VisitorsPage />)
    fireEvent.change(screen.getByLabelText('Filtrar mês'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Filtrar ano'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes de Visitante Demonstração 03/ }))

    const detail = screen.getByRole('dialog')
    expect(detail.textContent).toContain('Pedido fictício de oração por uma pessoa querida.')
    expect(detail.textContent).toContain('Detalhes do visitante · exemplo fictício')
  })

  it('permite adicionar informação local e registrar o marca-página uma vez na primeira visita', async () => {
    render(<VisitorsPage />)
    fireEvent.change(screen.getByLabelText('Filtrar mês'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Filtrar ano'), { target: { value: '0' } })

    const recurring = screen.getByText(/Visitante Demonstração 03/).closest('article')
    expect(recurring?.textContent).toContain('Não elegível · visita recorrente')
    expect(screen.queryByRole('button', { name: /Registrar entrega de marca-página para Visitante Demonstração 03/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Adicionar informação para Visitante Exemplo 02/ }))
    fireEvent.change(screen.getByLabelText('Informação para a equipe'), { target: { value: 'Receber na porta principal.' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar informação/ }))
    expect(await screen.findByText(/Informação interna salva apenas na demonstração local/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Adicionar informação para Visitante Exemplo 02/ }))
    expect(screen.getByLabelText('Informação para a equipe')).toHaveProperty('value', 'Receber na porta principal.')
    fireEvent.click(screen.getByRole('button', { name: /Fechar informações/ }))

    fireEvent.click(screen.getByRole('button', { name: /Cadastrar Visitante/ }))
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Visitante de Teste 01' } })
    fireEvent.change(screen.getByLabelText('WhatsApp / Telefone'), { target: { value: '(11) 99999-1000' } })
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar$/ }))
    await screen.findByText('Visitante de Teste 01')
    fireEvent.click(screen.getByRole('button', { name: /Registrar entrega de marca-página para Visitante de Teste 01/ }))

    await waitFor(() => expect(screen.getByText(/Entrega do marca-página registrada somente nesta demonstração/)).toBeTruthy())
    expect(screen.getAllByText('Entregue pela Recepção').length).toBeGreaterThan(1)
    expect(screen.queryByRole('button', { name: /Registrar entrega de marca-página para Visitante de Teste 01/ })).toBeNull()
  })
})
