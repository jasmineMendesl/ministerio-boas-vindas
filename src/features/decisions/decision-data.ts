import { normalizeBrazilianPhone, normalizeVisitorName } from '../../../supabase/functions/_shared/visitor-validation.ts'
import type { VisitorPerson } from '../visitors/visitor-data'

export type DecisionType = 'acceptance' | 'reconciliation'
export type FollowUpStatus = 'awaiting_first_contact' | 'contact_made' | 'awaiting_response' | 'responded' | 'invited' | 'awaiting_confirmation' | 'confirmed' | 'attended' | 'no_show' | 'declined' | 'unable_to_contact'

export type ContactEntry = { id: string; contactedAt: string; observations: string }
export type DecisionFollowUp = {
  id: string
  status: FollowUpStatus
  contactDate: string | null
  observations: string
  contacts: ContactEntry[]
}
export type DecisionRecord = {
  id: string
  personId: string
  personName: string
  phoneNormalized: string
  type: DecisionType
  baptized: boolean
  interestedInBaptism: boolean
  acceptsMessages: boolean
  welcomedBy: string
  decidedOn: string
  observations: string
  followUp: DecisionFollowUp
}

export type NewDecision = Omit<DecisionRecord, 'id' | 'followUp'>
export type DecisionStateResult = { records: DecisionRecord[]; personReused: boolean }

function day(now: Date, daysAgo: number) {
  const date = new Date(now)
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

export function createDemoDecisions(now = new Date()): DecisionRecord[] {
  const seeds: Array<Omit<DecisionRecord, 'followUp'> & { followUp: DecisionFollowUp }> = [
    { id: 'demo-decision-01', personId: 'demo-person-01', personName: 'Visitante Exemplo 01', phoneNormalized: '+5511900000001', type: 'acceptance', baptized: false, interestedInBaptism: true, acceptsMessages: true, welcomedBy: 'Equipe de demonstração', decidedOn: day(now, 2), observations: 'Registro fictício para demonstração.', followUp: { id: 'demo-follow-01', status: 'awaiting_first_contact', contactDate: null, observations: '', contacts: [] } },
    { id: 'demo-decision-02', personId: 'demo-decision-person-02', personName: 'Pessoa Demonstração 02', phoneNormalized: '+5511980000002', type: 'reconciliation', baptized: true, interestedInBaptism: false, acceptsMessages: true, welcomedBy: 'Equipe de demonstração', decidedOn: day(now, 7), observations: 'Registro fictício para demonstração.', followUp: { id: 'demo-follow-02', status: 'contact_made', contactDate: new Date(now.getTime() - 3 * 86400000).toISOString(), observations: 'Contato inicial de demonstração.', contacts: [{ id: 'demo-contact-02', contactedAt: new Date(now.getTime() - 3 * 86400000).toISOString(), observations: 'Contato inicial de demonstração.' }] } },
    { id: 'demo-decision-03', personId: 'demo-decision-person-03', personName: 'Pessoa Demonstração 03', phoneNormalized: '+5511980000003', type: 'acceptance', baptized: true, interestedInBaptism: false, acceptsMessages: false, welcomedBy: 'Equipe de demonstração', decidedOn: day(now, 16), observations: '', followUp: { id: 'demo-follow-03', status: 'awaiting_first_contact', contactDate: null, observations: '', contacts: [] } },
    { id: 'demo-decision-04', personId: 'demo-person-01', personName: 'Visitante Exemplo 01', phoneNormalized: '+5511900000001', type: 'reconciliation', baptized: false, interestedInBaptism: true, acceptsMessages: true, welcomedBy: 'Equipe de demonstração', decidedOn: day(now, 35), observations: 'Segunda decisão fictícia da mesma pessoa.', followUp: { id: 'demo-follow-04', status: 'contact_made', contactDate: new Date(now.getTime() - 32 * 86400000).toISOString(), observations: 'Contato registrado no exemplo.', contacts: [{ id: 'demo-contact-04', contactedAt: new Date(now.getTime() - 32 * 86400000).toISOString(), observations: 'Contato registrado no exemplo.' }] } },
  ]
  return seeds
}

export function addDecision(records: DecisionRecord[], input: {
  fullName: string; phone: string; type: DecisionType; baptized: boolean; interestedInBaptism: boolean; acceptsMessages: boolean; decidedOn: string; observations: string
}, now = new Date(), makeId = () => globalThis.crypto?.randomUUID?.() ?? `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`, knownPeople: VisitorPerson[] = []) {
  const personName = normalizeVisitorName(input.fullName)
  const phoneNormalized = normalizeBrazilianPhone(input.phone)
  if (!personName) return { ok: false as const, error: 'name' as const }
  if (!phoneNormalized) return { ok: false as const, error: 'phone' as const }
  if (!input.decidedOn || input.decidedOn > now.toISOString().slice(0, 10)) return { ok: false as const, error: 'date' as const }
  if (input.observations.length > 4000) return { ok: false as const, error: 'observations' as const }

  const existingDecisionPerson = records.find(record => record.phoneNormalized === phoneNormalized)
  const existingVisitorPerson = knownPeople.find(person => person.phoneNormalized === phoneNormalized)
  const existingPersonName = existingDecisionPerson?.personName ?? existingVisitorPerson?.fullName
  const personId = existingDecisionPerson?.personId ?? existingVisitorPerson?.id ?? makeId()
  const record: DecisionRecord = {
    id: makeId(), personId, personName: existingPersonName ?? personName, phoneNormalized, type: input.type, baptized: input.baptized, interestedInBaptism: input.interestedInBaptism, acceptsMessages: input.acceptsMessages, welcomedBy: 'Equipe de demonstração',
    decidedOn: input.decidedOn, observations: input.observations.trim(),
    followUp: { id: makeId(), status: 'awaiting_first_contact', contactDate: null, observations: '', contacts: [] },
  }
  return { ok: true as const, records: [record, ...records], personReused: Boolean(existingDecisionPerson || existingVisitorPerson) }
}

export function recordContact(records: DecisionRecord[], decisionId: string, observations: string, contactedAt = new Date().toISOString()): DecisionRecord[] {
  const note = observations.trim()
  return records.map(record => record.id !== decisionId ? record : {
    ...record,
    followUp: {
      ...record.followUp,
      status: 'contact_made',
      contactDate: contactedAt,
      observations: note,
      contacts: [...record.followUp.contacts, { id: globalThis.crypto?.randomUUID?.() ?? `demo-contact-${Date.now()}`, contactedAt, observations: note }],
    },
  })
}

export function filterDecisions(records: DecisionRecord[], query: string, month: number, year: number, type: DecisionType | 'all', status: FollowUpStatus | 'all') {
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')
  const digits = query.replace(/\D/g, '')
  return records.filter(record => {
    const date = new Date(`${record.decidedOn}T12:00:00`)
    return (month === 0 || date.getMonth() + 1 === month)
      && (year === 0 || date.getFullYear() === year)
      && (type === 'all' || record.type === type)
      && (status === 'all' || record.followUp.status === status)
      && (!normalizedQuery || record.personName.toLocaleLowerCase('pt-BR').includes(normalizedQuery) || (digits.length > 0 && record.phoneNormalized.replace(/\D/g, '').includes(digits)))
  })
}
