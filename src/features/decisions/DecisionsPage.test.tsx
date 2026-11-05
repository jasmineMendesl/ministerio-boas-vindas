import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ session: null, loading: false }) }))

import { DecisionsPage } from './DecisionsPage'

describe('módulo de decisões em demonstração', () => {
  afterEach(() => cleanup())

  it('apresenta os indicadores e identifica os dados como fictícios', () => {
    render(<DecisionsPage />)
    expect(screen.getByText(/Demonstração fictícia/)).toBeTruthy()
    expect(screen.getAllByText('Decisões no período').length).toBeGreaterThan(0)
    expect(screen.getByText('Aceitações de Jesus')).toBeTruthy()
    expect(screen.getByText('Reconciliações')).toBeTruthy()
    expect(screen.getByText('Pessoas aguardando primeiro contato')).toBeTruthy()
    expect(screen.getByText('Contatos realizados')).toBeTruthy()
  })

  it('cria outra decisão para telefone já conhecido e mantém pendência sem convidar para o café', async () => {
    render(<DecisionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /Registrar decisão/ }))
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Nome alterado de demonstração' } })
    fireEvent.change(screen.getByLabelText('Telefone com DDD'), { target: { value: '(11) 90000-0001' } })
    fireEvent.change(screen.getByLabelText('Data da decisão'), { target: { value: new Date().toISOString().slice(0, 10) } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar decisão/ }))

    expect(await screen.findByText(/pessoa já estava nesta demonstração/)).toBeTruthy()
    const personButton = screen.getAllByRole('button', { name: /Visitante Exemplo 01/ })[0]
    fireEvent.click(personButton)
    const dialog = screen.getByRole('dialog', { name: 'Visitante Exemplo 01' })
    expect(dialog.textContent).toContain('Segunda decisão fictícia da mesma pessoa.')
    expect(dialog.textContent).toContain('Aguardando primeiro contato')
    expect(dialog.textContent).not.toContain('convite')
  })

  it('registra contato e conserva observações no histórico individual', async () => {
    render(<DecisionsPage />)
    fireEvent.click(screen.getAllByRole('button', { name: /Registrar contato/ })[0])
    fireEvent.change(screen.getByLabelText('Observações do contato'), { target: { value: 'Ligação de demonstração realizada.' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirmar contato/ }))

    await waitFor(() => expect(screen.getAllByText(/Contato realizado/).length).toBeGreaterThan(0))
    expect(screen.getByText(/nenhum convite ao Projeto Pertencer foi criado/)).toBeTruthy()
  })
})
