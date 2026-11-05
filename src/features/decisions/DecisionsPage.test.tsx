import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ session: null, loading: false }) }))

import { DecisionsPage } from './DecisionsPage'

describe('módulo de decisões em demonstração', () => {
  afterEach(() => cleanup())

  it('apresenta o layout pastoral, os quatro indicadores e a identificação dos dados fictícios', () => {
    render(<DecisionsPage />)
    expect(screen.getByRole('heading', { name: 'Decisões de Fé e Vidas Transformadas' })).toBeTruthy()
    expect(screen.getByText(/Dados fictícios/)).toBeTruthy()
    expect(screen.getByText('Total de Decisões no Ano')).toBeTruthy()
    expect(screen.getByText('Aceitações de Jesus')).toBeTruthy()
    expect(screen.getByText('Reconciliações')).toBeTruthy()
    expect(screen.getByText('Interesse em Batismo')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Registrar Nova Decisão' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Filtrar por situação do acompanhamento' })).toBeTruthy()
  })

  it('adiciona outra decisão ao histórico da pessoa e cria a pendência inicial', async () => {
    render(<DecisionsPage />)
    fireEvent.change(screen.getByLabelText(/Nome Completo/), { target: { value: 'Nome alterado de demonstração' } })
    fireEvent.change(screen.getByLabelText(/WhatsApp/), { target: { value: '(11) 90000-0001' } })
    fireEvent.change(screen.getByLabelText(/Data da Decisão/), { target: { value: new Date().toISOString().slice(0, 10) } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar decisão' }))

    expect(await screen.findByText(/pessoa já estava nesta demonstração/)).toBeTruthy()
    expect(screen.getAllByText(/Aguardando primeiro contato/).length).toBeGreaterThan(0)
    const historyButton = screen.getAllByRole('button', { name: /Visitante Exemplo 01/ })[0]
    fireEvent.click(historyButton)
    const dialog = screen.getByRole('dialog', { name: 'Visitante Exemplo 01' })
    expect(dialog.textContent).toContain('Segunda decisão fictícia da mesma pessoa.')
    expect(dialog.textContent).toContain('Aguardando primeiro contato')
    expect(dialog.textContent).not.toContain('convite')
  })

  it('registra contato e suas observações sem criar convite ao Projeto Pertencer', async () => {
    render(<DecisionsPage />)
    fireEvent.click(screen.getAllByRole('button', { name: /Registrar contato/ })[0])
    fireEvent.change(screen.getByLabelText('Observações do contato'), { target: { value: 'Ligação fictícia realizada.' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar contato/ }))

    await waitFor(() => expect(screen.getAllByText(/Contato realizado/).length).toBeGreaterThan(0))
    expect(screen.getByText(/nenhum convite ao Projeto Pertencer foi criado/)).toBeTruthy()
  })
})
