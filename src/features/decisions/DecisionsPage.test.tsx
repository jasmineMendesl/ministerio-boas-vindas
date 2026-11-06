import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ session: null, loading: false }) }))

import { DecisionRegistrationPage, DecisionsModule, DecisionsPage } from './DecisionsPage'

function renderDecisions(path = '/decisoes') {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/decisoes" element={<DecisionsModule />}><Route index element={<DecisionsPage />} /><Route path="nova" element={<DecisionRegistrationPage />} /></Route></Routes></MemoryRouter>)
}

describe('módulo de decisões em demonstração', () => {
  afterEach(() => cleanup())

  it('apresenta o layout pastoral, os quatro indicadores e a identificação dos dados fictícios', () => {
    renderDecisions()
    expect(screen.getByRole('heading', { name: 'Decisões de Fé e Vidas Transformadas' })).toBeTruthy()
    expect(screen.getByText(/Dados fictícios/)).toBeTruthy()
    expect(screen.getByText('Total de Decisões no Ano')).toBeTruthy()
    expect(screen.getByText('Aceitações de Jesus')).toBeTruthy()
    expect(screen.getByText('Reconciliações')).toBeTruthy()
    expect(screen.getByText('Interesse em Batismo')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Registrar Nova Decis/ })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /Registrar Nova Decis/ })).toBeNull()
    expect(screen.queryByRole('group', { name: /Filtrar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Registrar contato/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Hist.rico/ })).toBeNull()
    expect(screen.getAllByRole('link', { name: /Abrir conversa no WhatsApp/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Aguardando primeiro contato/)[0].classList.contains('status-pending')).toBe(true)
    expect(screen.getAllByText('Contato realizado').some(node => node.classList.contains('status-positive'))).toBe(true)
  })

  it('adiciona outra decisão ao histórico da pessoa e cria a pendência inicial', async () => {
    renderDecisions()
    fireEvent.click(screen.getByRole('button', { name: /Registrar Nova Decis/ }))
    fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'Nome alterado de demonstração' } })
    fireEvent.change(screen.getByLabelText(/WhatsApp/), { target: { value: '(11) 90000-0001' } })
    fireEvent.change(screen.getByLabelText(/Data da decis/i), { target: { value: new Date().toISOString().slice(0, 10) } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar decisão' }))

    expect(await screen.findByText(/pessoa já estava nesta demonstração/)).toBeTruthy()
    expect(screen.getAllByText(/Aguardando primeiro contato/).length).toBeGreaterThan(0)
    const whatsappLink = screen.getAllByRole('link', { name: /Abrir conversa no WhatsApp com Visitante Exemplo 01/ })[0]
    expect(whatsappLink.getAttribute('href')).toBe('https://wa.me/5511900000001')
  })

  it('mostra somente o link do WhatsApp em cada decisao', () => {
    renderDecisions()
    expect(screen.queryByRole('button', { name: /Registrar contato/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Historico/ })).toBeNull()
    expect(screen.queryByRole('group', { name: /Filtrar/ })).toBeNull()
    const links = screen.getAllByRole('link', { name: /Abrir conversa no WhatsApp/ })
    expect(links.length).toBeGreaterThan(0)
    expect(links[0].getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\d+$/)
  })
})
