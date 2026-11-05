import { describe, expect, it } from 'vitest'
import {
  addManualVisit,
  buildPublicVisitorUrl,
  createDemoVisitors,
  filterVisitors,
  firstVisit,
} from './visitor-data'

describe('dados de demonstração do módulo de visitantes', () => {
  const now = new Date(2026, 10, 5, 12, 0, 0)

  it('reutiliza a pessoa pelo telefone normalizado e acrescenta uma visita', () => {
    const people = createDemoVisitors(now)
    const original = people[0]
    const result = addManualVisit(people, 'Outro nome enviado', '(11) 90000-0001', now.toISOString(), () => 'new-visit')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reusedPerson).toBe(true)
    expect(result.personId).toBe(original.id)
    expect(result.people).toHaveLength(people.length)
    expect(result.people[0].fullName).toBe(original.fullName)
    expect(result.people[0].visits).toHaveLength(original.visits.length + 1)
  })

  it('cria uma pessoa e sua primeira visita para um novo telefone', () => {
    const result = addManualVisit([], 'Pessoa Nova', '11912345678', now.toISOString(), () => 'new-id')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reusedPerson).toBe(false)
    expect(result.people).toHaveLength(1)
    expect(result.people[0].phoneNormalized).toBe('+5511912345678')
    expect(result.people[0].visits[0]).toMatchObject({ source: 'staff', registeredAt: now.toISOString() })
  })

  it('rejeita nome e telefone inválidos', () => {
    expect(addManualVisit([], ' ', '11912345678').ok).toBe(false)
    expect(addManualVisit([], 'Pessoa Exemplo', 'telefone inválido').ok).toBe(false)
  })

  it('filtra pessoas únicas por mês/ano e busca por nome ou telefone', () => {
    const people = createDemoVisitors(now)
    expect(filterVisitors(people, '', 11, 2026)).toHaveLength(2)
    expect(filterVisitors(people, '', 10, 2026)).toHaveLength(3)
    expect(filterVisitors(people, '90000-0002', 10, 2026).map(person => person.id)).toEqual(['demo-person-02'])
    expect(filterVisitors(people, 'demonstração', 11, 2026).map(person => person.id)).toEqual(['demo-person-03'])
    expect(firstVisit(people[0])).toBe(people[0].visits[0].registeredAt)
  })

  it('monta a URL compatível com rotas tradicionais e GitHub Pages', () => {
    expect(buildPublicVisitorUrl('https://exemplo.org', '/')).toBe('https://exemplo.org/visitante')
    expect(buildPublicVisitorUrl('https://exemplo.org/', '/ministerio-boas-vindas/')).toBe('https://exemplo.org/ministerio-boas-vindas/#/visitante')
  })
})
