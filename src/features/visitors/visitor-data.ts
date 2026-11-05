import { normalizeBrazilianPhone, normalizeVisitorName } from '../../../supabase/functions/_shared/visitor-validation.ts'

export type VisitSource = 'qr' | 'staff'

export type VisitorVisit = {
  id: string
  registeredAt: string
  source: VisitSource
}

export type GiftDelivery = {
  id: string
  deliveredAt: string
  giftType: string
  quantity: number
  responsible: string | null
}

export type VisitorPerson = {
  id: string
  fullName: string
  phoneNormalized: string
  visits: VisitorVisit[]
  gifts: GiftDelivery[]
}

export type ManualVisitResult =
  | { ok: true; people: VisitorPerson[]; personId: string; reusedPerson: boolean }
  | { ok: false; error: 'name' | 'phone' }

function demoDate(now: Date, daysAgo: number, hour = 10): string {
  const date = new Date(now)
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

export function createDemoVisitors(now = new Date()): VisitorPerson[] {
  return [
    {
      id: 'demo-person-01',
      fullName: 'Visitante Exemplo 01',
      phoneNormalized: '+5511900000001',
      visits: [
        { id: 'demo-visit-01a', registeredAt: demoDate(now, 20), source: 'qr' },
        { id: 'demo-visit-01b', registeredAt: demoDate(now, 0), source: 'qr' },
      ],
      gifts: [{ id: 'demo-gift-01', deliveredAt: demoDate(now, 5), giftType: 'Lembrancinha de boas-vindas', quantity: 1, responsible: 'Equipe de demonstração' }],
    },
    {
      id: 'demo-person-02',
      fullName: 'Visitante Exemplo 02',
      phoneNormalized: '+5511900000002',
      visits: [{ id: 'demo-visit-02a', registeredAt: demoDate(now, 6), source: 'qr' }],
      gifts: [],
    },
    {
      id: 'demo-person-03',
      fullName: 'Visitante Demonstração 03',
      phoneNormalized: '+5511900000003',
      visits: [
        { id: 'demo-visit-03a', registeredAt: demoDate(now, 35), source: 'staff' },
        { id: 'demo-visit-03b', registeredAt: demoDate(now, 1), source: 'qr' },
      ],
      gifts: [],
    },
    {
      id: 'demo-person-04',
      fullName: 'Visitante Exemplo 04',
      phoneNormalized: '+5511900000004',
      visits: [{ id: 'demo-visit-04a', registeredAt: demoDate(now, 48), source: 'qr' }],
      gifts: [],
    },
  ]
}

export function addManualVisit(
  people: VisitorPerson[],
  nameInput: string,
  phoneInput: string,
  registeredAt = new Date().toISOString(),
  makeId: () => string = () => globalThis.crypto?.randomUUID?.() ?? `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
): ManualVisitResult {
  const fullName = normalizeVisitorName(nameInput)
  if (!fullName) return { ok: false, error: 'name' }

  const phoneNormalized = normalizeBrazilianPhone(phoneInput)
  if (!phoneNormalized) return { ok: false, error: 'phone' }

  const visit: VisitorVisit = { id: makeId(), registeredAt, source: 'staff' }
  const existing = people.find(person => person.phoneNormalized === phoneNormalized)
  if (existing) {
    return {
      ok: true,
      people: people.map(person => person.id === existing.id ? { ...person, visits: [...person.visits, visit] } : person),
      personId: existing.id,
      reusedPerson: true,
    }
  }

  const person: VisitorPerson = {
    id: makeId(),
    fullName,
    phoneNormalized,
    visits: [visit],
    gifts: [],
  }
  return { ok: true, people: [...people, person], personId: person.id, reusedPerson: false }
}

export function firstVisit(person: VisitorPerson): string | null {
  return person.visits.reduce<string | null>((first, visit) => {
    if (!first || new Date(visit.registeredAt).getTime() < new Date(first).getTime()) return visit.registeredAt
    return first
  }, null)
}

export function visitorHasVisitInPeriod(person: VisitorPerson, month: number, year: number): boolean {
  return person.visits.some(({ registeredAt }) => {
    const date = new Date(registeredAt)
    return (month === 0 || date.getMonth() + 1 === month) && (year === 0 || date.getFullYear() === year)
  })
}

export function filterVisitors(people: VisitorPerson[], query: string, month: number, year: number): VisitorPerson[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')
  const digits = query.replace(/\D/g, '')

  return people.filter(person => {
    if (!visitorHasVisitInPeriod(person, month, year)) return false
    if (!normalizedQuery) return true
    return person.fullName.toLocaleLowerCase('pt-BR').includes(normalizedQuery)
      || (digits.length > 0 && person.phoneNormalized.replace(/\D/g, '').includes(digits))
  })
}

export function buildPublicVisitorUrl(origin: string, basePath: string): string {
  if (basePath === '/') return `${origin.replace(/\/$/, '')}/visitante`
  const normalizedBase = `/${basePath.replace(/^\/+|\/+$/g, '')}/`
  return `${origin.replace(/\/$/, '')}${normalizedBase}#/visitante`
}

export function formatVisitorPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length === 13) return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`
  if (digits.startsWith('55') && digits.length === 12) return `(${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`
  return phone
}
